-- Read-only, aggregate-only inventory for the ASX integration review.
-- Age screens are diagnostics, not exchange-session freshness certificates.
-- This does not enable a convergence methodology or shared outcomes.
with params as materialized (
  select statement_timestamp() cutoff_at,
    (statement_timestamp() at time zone 'Australia/Sydney')::date sydney_date,
    (statement_timestamp() at time zone 'America/New_York')::date ai_logical_date
), selected as materialized (
  select i.id, p.*,
    t.id technical_id,t.score_date,t.overall_score,t.confidence_score,t.score_status,t.technical_calculation_version,
    a.assessment_id,a.assessment_date,a.score ai_score,a.confidence ai_confidence,a.rating,
    a.technical_engine_input_used,r.status run_status,r.completed_at
  from public.instruments i cross join params p
  left join lateral (
    select s.* from public.market_scores s
    where s.instrument_id=i.id and s.methodology_version='technical-score-asx-v1' and s.calculated_at<=p.cutoff_at
    order by s.score_date desc,s.calculated_at desc,s.id desc limit 1
  ) t on true
  left join lateral (
    select a.* from public.gpt_market_assessments a
    where a.instrument_id=i.id and a.methodology_version='independent-market-ai-v1' and a.created_at<=p.cutoff_at
    order by a.assessment_date desc,a.created_at desc,a.assessment_id desc limit 1
  ) a on true
  left join public.gpt_market_runs r on r.run_id=a.run_id
  where i.is_active and i.exchange_code='ASX'
), assessed as materialized (
  select *,case
    when technical_id is null then 'MISSING'
    when technical_calculation_version is distinct from 'technical-engine-asx-v1' then 'VERSION_MISMATCH'
    when not coalesce(overall_score between 0 and 100 and confidence_score between 0 and 100
      and score_status in ('complete','partial') and score_date is not null,false) then 'INVALID'
    when score_date>sydney_date then 'FUTURE_DATE'
    when sydney_date-score_date>4 then 'STALE_AGE_SCREEN'
    when not coalesce(technical_engine.asx_score_source_matches_v1(technical_id),false) then 'SOURCE_CHANGED_OR_BLOCKED'
    else 'SOURCE_MATCHED_AGE_SCREEN' end technical_state,
  case
    when assessment_id is null then 'MISSING'
    when not coalesce(technical_engine_input_used is false and ai_score between 0 and 100
      and ai_confidence between 0 and 100 and lower(rating) in ('strong buy','buy','hold','sell','strong sell')
      and assessment_date is not null,false) then 'INVALID_OR_NOT_INDEPENDENT'
    when run_status is null or run_status not in ('succeeded','partial') or completed_at is null
      or completed_at>cutoff_at then 'RUN_NOT_TERMINAL_AT_CUTOFF'
    when assessment_date>ai_logical_date then 'FUTURE_DATE'
    when ai_logical_date-assessment_date>4 then 'STALE_AGE_SCREEN'
    else 'TERMINAL_AGE_SCREEN' end ai_state
  from selected
)
select p.cutoff_at,p.sydney_date,p.ai_logical_date,
  (select count(*) from assessed) active_asx,
  coalesce((select jsonb_object_agg(technical_state,n) from (select technical_state,count(*) n from assessed group by technical_state)x),'{}') technical_states,
  coalesce((select jsonb_object_agg(ai_state,n) from (select ai_state,count(*) n from assessed group by ai_state)x),'{}') ai_states,
  'market-convergence-v1 excludes technical-score-asx-v1; a separately versioned adapter is required' convergence_contract,
  'Shared recommendations use independent AI and price evidence, not Market Convergence' recommendation_boundary,
  (select count(*) from private.shared_market_calendars where exchange_code='ASX') asx_calendar_revisions,
  (select count(*) from private.shared_market_calendars where exchange_code='ASX' and time_zone='Australia/Sydney'
    and coverage_start<=p.cutoff_at and coverage_end>p.cutoff_at and verified_at<=p.cutoff_at and valid_until>p.cutoff_at) currently_valid_asx_calendar_revisions,
  (select count(distinct c.instrument_id) from private.shared_market_input_config c join assessed a on a.id=c.instrument_id
    where c.exchange_code='ASX' and c.verified_at<=p.cutoff_at) active_asx_with_input_config,
  (select count(*) from private.shared_decision_config c join assessed a on a.id=c.instrument_id where c.enabled) active_asx_with_enabled_publication_config,
  (select count(*) from public.instruments where is_active and exchange_code='ASX' and trim(currency_code)='AUD'
    and asset_type in ('etf','index')) active_aud_etf_or_index_inventory,
  'Inventory counts do not certify mapping, benchmark return basis, price coverage, session attribution or evaluator support' measurement_limit
from params p;
