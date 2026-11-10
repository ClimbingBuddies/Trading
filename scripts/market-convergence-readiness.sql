-- Read-only readiness for the existing controller's post-Market convergence step.
-- Run unchanged after due Market work is terminal. No caller-supplied/backdated cutoff.
-- invocation_sql is TEXT, never executed by this diagnostic. See the pipeline document.
with params as materialized (
  select statement_timestamp() as cutoff_at,
    (statement_timestamp() at time zone 'America/New_York')::date as logical_date
), selected as (
  select i.id as instrument_id, i.symbol, p.cutoff_at, p.logical_date,
    t.id as technical_score_id, t.score_date as technical_date,
    a.assessment_id as ai_assessment_id, a.assessment_date as ai_date,
    a.run_id as ai_run_id, r.status as ai_run_status, r.completed_at as ai_completed_at
  from public.instruments i cross join params p
  -- Match refresh_as_of_v1 selection BEFORE adding controller readiness gates.
  -- Do not fall back to an older AI row when the canonical latest row is unfinished.
  left join lateral (
    select ms.id, ms.score_date
    from public.market_scores ms
    where ms.instrument_id = i.id
      and ms.methodology_version = 'technical-score-v1'
      and ms.score_status in ('complete', 'partial')
      and ms.overall_score between 0 and 100
      and ms.confidence_score between 0 and 100
      and ms.score_date <= p.logical_date and ms.calculated_at <= p.cutoff_at
    order by ms.score_date desc, ms.calculated_at desc, ms.id desc limit 1
  ) t on true
  left join lateral (
    select gma.assessment_id, gma.assessment_date, gma.run_id
    from public.gpt_market_assessments gma
    where gma.instrument_id = i.id
      and gma.methodology_version = 'independent-market-ai-v1'
      and gma.technical_engine_input_used is false
      and gma.score between 0 and 100 and gma.confidence between 0 and 100
      and lower(gma.rating) in ('strong buy', 'buy', 'hold', 'sell', 'strong sell')
      and gma.assessment_date <= p.logical_date and gma.created_at <= p.cutoff_at
    order by gma.assessment_date desc, gma.created_at desc, gma.assessment_id desc limit 1
  ) a on true
  left join public.gpt_market_runs r on r.run_id = a.run_id
  where i.is_active is true
), readiness as (
  select s.*, done.id as existing_success_id, done.cutoff_at as existing_success_cutoff_at,
    leaf.id as failed_run_id,
    case when not leaf.has_child then leaf.id end as failed_leaf_id,
    leaf.attempt_number as failed_attempt_number,
    case
      when exists (select 1 from public.market_convergence_runs running
        where running.status = 'running') then 'CONVERGENCE_RUNNING'
      when done.id is not null and done.fresh_pairs <> 1 then 'SAME_DAY_INCOMPLETE_SUCCESS'
      when s.technical_score_id is null then 'TECHNICAL_INPUT_MISSING'
      when s.ai_assessment_id is null then 'AI_INPUT_MISSING'
      when s.ai_run_status is null or s.ai_run_status not in ('succeeded', 'partial')
        or s.ai_completed_at is null or s.ai_completed_at > s.cutoff_at then 'AI_RUN_NOT_TERMINAL_AT_CUTOFF'
      when s.logical_date - s.technical_date > 4 then 'TECHNICAL_INPUT_STALE'
      when s.logical_date - s.ai_date > 4 then 'AI_INPUT_STALE'
      -- A native success does not prove the source run was terminal when it ran.
      -- Later completion cannot retroactively validate that saved convergence cutoff.
      when done.id is not null and s.ai_completed_at > done.cutoff_at then 'AI_RUN_NOT_TERMINAL_AT_SAVED_CUTOFF'
      when done.id is not null and not exists (
        select 1 from public.market_convergence_assessments c
        where c.instrument_id = s.instrument_id
          and c.assessment_date = greatest(s.technical_date, s.ai_date)
          and c.methodology_version = 'market-convergence-v1'
          and c.technical_score_id = s.technical_score_id
          and c.ai_assessment_id = s.ai_assessment_id
      ) then 'SAME_DAY_LINEAGE_CHANGED'
      when done.id is not null then 'ALREADY_SUCCEEDED'
      when leaf.has_child then 'FAILED_CHAIN_REQUIRES_RECONCILIATION'
      when leaf.id is not null and leaf.attempt_number >= 3 then 'RETRY_EXHAUSTED'
      when leaf.id is not null then 'FAILED_RETRY_REQUIRES_ORIGINAL_CUTOFF'
      else 'READY'
    end as readiness
  from selected s
  left join lateral (
    select r.id, r.fresh_pairs, r.cutoff_at from public.market_convergence_runs r
    where r.logical_date = s.logical_date and r.instrument_id = s.instrument_id
      and r.methodology_version = 'market-convergence-v1' and r.status = 'succeeded'
    order by r.started_at desc, r.id desc limit 1
  ) done on true
  left join lateral (
    select r.id, r.attempt_number,
      exists (select 1 from public.market_convergence_runs child where child.retry_of_run_id = r.id) as has_child
    from public.market_convergence_runs r
    where r.logical_date = s.logical_date and r.instrument_id = s.instrument_id
      and r.methodology_version = 'market-convergence-v1' and r.status = 'failed'
    order by r.started_at desc, r.id desc limit 1
  ) leaf on true
)
select instrument_id, symbol, cutoff_at, logical_date,
  technical_score_id, technical_date, ai_assessment_id, ai_date, ai_run_id,
  ai_run_status, ai_completed_at, readiness, existing_success_id, existing_success_cutoff_at,
  failed_run_id, failed_leaf_id, failed_attempt_number,
  case when readiness = 'READY' then format(
    'select market_convergence.run_v1(''scheduled'', null, %L::timestamptz, %L::uuid) as run_id;',
    cutoff_at, instrument_id
  ) end as invocation_sql
from readiness order by symbol, instrument_id;
