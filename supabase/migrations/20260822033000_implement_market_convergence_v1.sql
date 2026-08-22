create schema if not exists market_convergence authorization postgres;

revoke all on schema market_convergence from public;
revoke all on schema market_convergence from anon, authenticated;
grant usage on schema market_convergence to service_role;

revoke all on table public.market_convergence_assessments from anon, authenticated;
grant select on table public.market_convergence_assessments to anon, authenticated;
grant select, insert, update on table public.market_convergence_assessments to service_role;

alter table public.market_convergence_assessments
  add constraint market_convergence_v1_complete_chk
  check (
    methodology_version <> 'market-convergence-v1'
    or (
      technical_score_id is not null
      and ai_assessment_id is not null
      and technical_score is not null
      and technical_signal is not null
      and technical_confidence is not null
      and ai_score is not null
      and ai_signal is not null
      and ai_confidence is not null
      and convergence_score is not null
      and convergence_confidence is not null
      and convergence_label is not null
      and summary is not null
      and btrim(summary) <> ''
    )
  );

create or replace function market_convergence.refresh_v1(
  p_instrument_id uuid default null
)
returns table(rows_changed integer)
language sql
security invoker
set search_path = pg_catalog
as $function$
  with eligible_technical as materialized (
    select distinct on (ms.instrument_id)
      ms.id,
      ms.instrument_id,
      ms.score_date,
      ms.overall_score,
      ms.confidence_score,
      ms.methodology_version,
      ms.calculated_at
    from public.market_scores ms
    where ms.methodology_version = 'technical-score-v1'
      and ms.score_status in ('complete', 'partial')
      and ms.overall_score between 0 and 100
      and ms.confidence_score between 0 and 100
      and ms.calculated_at <= statement_timestamp()
      and (p_instrument_id is null or ms.instrument_id = p_instrument_id)
    order by
      ms.instrument_id,
      ms.score_date desc,
      ms.calculated_at desc,
      ms.id desc
  ),
  eligible_ai as materialized (
    select distinct on (gma.instrument_id)
      gma.assessment_id,
      gma.instrument_id,
      gma.assessment_date,
      gma.rating,
      gma.score,
      gma.confidence,
      gma.methodology_version,
      gma.created_at
    from public.gpt_market_assessments gma
    where gma.methodology_version = 'independent-market-ai-v1'
      and gma.technical_engine_input_used is false
      and gma.score between 0 and 100
      and gma.confidence between 0 and 100
      and lower(gma.rating) in ('strong buy', 'buy', 'hold', 'sell', 'strong sell')
      and gma.created_at <= statement_timestamp()
      and (p_instrument_id is null or gma.instrument_id = p_instrument_id)
    order by
      gma.instrument_id,
      gma.assessment_date desc,
      gma.created_at desc,
      gma.assessment_id desc
  ),
  paired as (
    select
      t.instrument_id,
      greatest(t.score_date, a.assessment_date) as assessment_date,
      t.id as technical_score_id,
      a.assessment_id as ai_assessment_id,
      t.score_date as technical_score_date,
      a.assessment_date as ai_assessment_date,
      t.methodology_version as technical_methodology_version,
      a.methodology_version as ai_methodology_version,
      round(t.overall_score, 2) as technical_score,
      case
        when t.overall_score >= 80 then 'Strong Buy'
        when t.overall_score >= 60 then 'Buy'
        when t.overall_score >= 40 then 'Hold'
        when t.overall_score >= 20 then 'Sell'
        else 'Strong Sell'
      end as technical_signal,
      case
        when t.overall_score >= 80 then 2
        when t.overall_score >= 60 then 1
        when t.overall_score >= 40 then 0
        when t.overall_score >= 20 then -1
        else -2
      end as technical_ordinal,
      round(t.confidence_score, 2) as technical_confidence,
      round(a.score, 2) as ai_score,
      initcap(lower(a.rating)) as ai_signal,
      case lower(a.rating)
        when 'strong buy' then 2
        when 'buy' then 1
        when 'hold' then 0
        when 'sell' then -1
        when 'strong sell' then -2
      end as ai_ordinal,
      round(a.confidence, 2) as ai_confidence
    from eligible_technical t
    join eligible_ai a using (instrument_id)
  ),
  classified as (
    select
      p.*,
      round((p.technical_score + p.ai_score) / 2, 2) as convergence_score,
      abs(p.technical_score - p.ai_score) as disagreement_gap,
      case
        when p.technical_ordinal <> 0
          and p.ai_ordinal <> 0
          and sign(p.technical_ordinal) <> sign(p.ai_ordinal)
          then 'conflict'
        when abs(p.technical_score - p.ai_score) >= 25
          then 'mixed'
        when abs(p.technical_score - p.ai_score) < 10
          then 'aligned'
        else 'mild_disagreement'
      end as agreement_class
    from paired p
  ),
  calculated as (
    select
      c.*,
      round(
        least(
          sqrt(c.technical_confidence * c.ai_confidence)
            * (1 - c.disagreement_gap / 200::numeric),
          case c.agreement_class
            when 'conflict' then 40::numeric
            when 'mixed' then 60::numeric
            else 100::numeric
          end
        ),
        2
      ) as convergence_confidence,
      case
        when c.agreement_class = 'conflict' then 'conflict'
        when c.agreement_class = 'mixed' then 'mixed'
        when c.convergence_score >= 85 then 'very_strong_bullish'
        when c.convergence_score >= 70 then 'strong_bullish'
        when c.convergence_score >= 60 then 'moderate_bullish'
        when c.convergence_score >= 40 then 'neutral'
        when c.convergence_score >= 30 then 'moderate_bearish'
        when c.convergence_score >= 15 then 'strong_bearish'
        else 'very_strong_bearish'
      end as convergence_label
    from classified c
  ),
  finalised as (
    select
      c.*,
      format(
        'Technical %s (%s/100, confidence %s/100) and AI Market %s (%s/100, confidence %s/100) combine to %s (%s/100, confidence %s/100; %s; score gap %s). Sources: Technical %s via %s; AI Market %s via %s. Market Convergence is separate from Opportunity Assessment and is not investment advice.',
        c.technical_signal,
        c.technical_score,
        c.technical_confidence,
        c.ai_signal,
        c.ai_score,
        c.ai_confidence,
        c.convergence_label,
        c.convergence_score,
        c.convergence_confidence,
        c.agreement_class,
        c.disagreement_gap,
        c.technical_score_date,
        c.technical_methodology_version,
        c.ai_assessment_date,
        c.ai_methodology_version
      ) as summary
    from calculated c
  ),
  upserted as (
    insert into public.market_convergence_assessments (
      instrument_id,
      assessment_date,
      technical_score_id,
      ai_assessment_id,
      technical_score,
      technical_signal,
      technical_confidence,
      ai_score,
      ai_signal,
      ai_confidence,
      convergence_score,
      convergence_confidence,
      convergence_label,
      summary,
      methodology_version
    )
    select
      f.instrument_id,
      f.assessment_date,
      f.technical_score_id,
      f.ai_assessment_id,
      f.technical_score,
      f.technical_signal,
      f.technical_confidence,
      f.ai_score,
      f.ai_signal,
      f.ai_confidence,
      f.convergence_score,
      f.convergence_confidence,
      f.convergence_label,
      f.summary,
      'market-convergence-v1'
    from finalised f
    on conflict on constraint market_convergence_one_per_method
    do update set
      technical_score_id = excluded.technical_score_id,
      ai_assessment_id = excluded.ai_assessment_id,
      technical_score = excluded.technical_score,
      technical_signal = excluded.technical_signal,
      technical_confidence = excluded.technical_confidence,
      ai_score = excluded.ai_score,
      ai_signal = excluded.ai_signal,
      ai_confidence = excluded.ai_confidence,
      convergence_score = excluded.convergence_score,
      convergence_confidence = excluded.convergence_confidence,
      convergence_label = excluded.convergence_label,
      summary = excluded.summary,
      updated_at = statement_timestamp()
    where row(
      market_convergence_assessments.technical_score_id,
      market_convergence_assessments.ai_assessment_id,
      market_convergence_assessments.technical_score,
      market_convergence_assessments.technical_signal,
      market_convergence_assessments.technical_confidence,
      market_convergence_assessments.ai_score,
      market_convergence_assessments.ai_signal,
      market_convergence_assessments.ai_confidence,
      market_convergence_assessments.convergence_score,
      market_convergence_assessments.convergence_confidence,
      market_convergence_assessments.convergence_label,
      market_convergence_assessments.summary
    ) is distinct from row(
      excluded.technical_score_id,
      excluded.ai_assessment_id,
      excluded.technical_score,
      excluded.technical_signal,
      excluded.technical_confidence,
      excluded.ai_score,
      excluded.ai_signal,
      excluded.ai_confidence,
      excluded.convergence_score,
      excluded.convergence_confidence,
      excluded.convergence_label,
      excluded.summary
    )
    returning id
  )
  select count(*)::integer as rows_changed
  from upserted;
$function$;

alter function market_convergence.refresh_v1(uuid) owner to postgres;

revoke all on function market_convergence.refresh_v1(uuid) from public;
revoke all on function market_convergence.refresh_v1(uuid) from anon, authenticated;
grant execute on function market_convergence.refresh_v1(uuid) to service_role;

alter default privileges for role postgres in schema market_convergence
  revoke execute on functions from public, anon, authenticated;

comment on schema market_convergence is
  'Private trusted execution surface for deterministic Market Convergence calculations.';

comment on function market_convergence.refresh_v1(uuid) is
  'Combines latest eligible independent Technical and AI Market assessments using market-convergence-v1 and persists complete lineage-backed rows.';
