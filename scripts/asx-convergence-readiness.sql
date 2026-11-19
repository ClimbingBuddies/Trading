-- Trusted read-only diagnostic: private input payloads are deliberately omitted.
-- Execute only READY invocation_sql. No new research, automatic retries or backdating.
with context as materialized(select statement_timestamp() cutoff_at),
inputs as materialized (
  select i.id instrument_id,c.cutoff_at,market_convergence.prepare_asx_v1(i.id,c.cutoff_at) envelope
  from public.instruments i cross join context c where i.is_active and i.exchange_code='ASX'
), checked as (
  select i.*,s.id existing_success_id,s.input_envelope prior_envelope,f.id failed_leaf_id,f.attempt_number,
    exists(select 1 from public.market_convergence_runs where status='running')
      or exists(select 1 from market_convergence.asx_runs_v1 where status='running') overlap
  from inputs i left join lateral (
    select r.* from market_convergence.asx_runs_v1 r where r.instrument_id=i.instrument_id
      and r.logical_date=(i.cutoff_at at time zone 'America/New_York')::date and r.status='succeeded'
    order by r.started_at,r.id limit 1
  ) s on true left join lateral (
    select r.* from market_convergence.asx_runs_v1 r where r.instrument_id=i.instrument_id
      and r.logical_date=(i.cutoff_at at time zone 'America/New_York')::date and r.status='failed'
      and not exists(select 1 from market_convergence.asx_runs_v1 child where child.retry_of_run_id=r.id)
    order by r.started_at desc,r.id desc limit 1
  ) f on true
), decisions as (
  select *,case when overlap then 'CONVERGENCE_RUNNING'
    when envelope->>'readiness'<>'READY' then envelope->>'readiness'
    when existing_success_id is not null then case when (market_convergence.asx_input_identity_v1(prior_envelope)-array['cutoff_at','logical_date'])=
      (market_convergence.asx_input_identity_v1(envelope)-array['cutoff_at','logical_date']) then 'ALREADY_SUCCEEDED' else 'SAME_DAY_INPUT_CHANGED' end
    when failed_leaf_id is not null then case when attempt_number>=3 then 'RETRY_EXHAUSTED' else 'FAILED_CHAIN_REVIEW_REQUIRED' end
    when exists(select 1 from public.market_convergence_assessments a where a.instrument_id=checked.instrument_id
      and a.methodology_version='market-convergence-asx-v1'
      and a.assessment_date=greatest((envelope#>>'{technical,score_date}')::date,(envelope#>>'{ai,assessment_date}')::date)
      and not exists(select 1 from market_convergence.asx_runs_v1 r where r.assessment_id=a.id and r.status='succeeded'
        and (market_convergence.asx_input_identity_v1(r.input_envelope)-array['cutoff_at','logical_date'])=(market_convergence.asx_input_identity_v1(envelope)-array['cutoff_at','logical_date'])))
      then 'IMMUTABLE_ASSESSMENT_CONFLICT'
    else 'READY' end readiness from checked
)
select instrument_id,cutoff_at,readiness,existing_success_id,failed_leaf_id,attempt_number,
  envelope#>>'{technical,id}' technical_score_id,envelope#>>'{ai,assessment_id}' ai_assessment_id,
  envelope->>'target_session' target_session,envelope#>>'{calendar,revision}' calendar_revision,
  case when readiness='READY' then format('select market_convergence.run_asx_v1(%L::uuid,''scheduled'',null,%L::timestamptz) as run_id;',
    instrument_id,cutoff_at) end invocation_sql
from decisions order by instrument_id;
