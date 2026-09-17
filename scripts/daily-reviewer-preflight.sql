-- Read-only controller diagnostic. Run before freezing a new research cutoff.
-- Coverage is not a session-calendar check or permission to publish a decision.
with universe as (
  select id from public.instruments where is_active
  union select instrument_id from public.watchlist_items
  union select instrument_id from public.personal_prediction_plans p
    where methodology='decision-journal-v3' and not exists (
      select 1 from public.personal_decision_outcomes o
      where o.prediction_id=p.id and o.kind in ('EXIT','CANCELLED'))
), candidates as (
  select instrument_id, count(*) candidate_count,
    count(*) filter(where block_reason is null) eligible_candidates,
    string_agg(distinct block_reason,'; ') decision_block
  from private.decision_candidates_v3() group by instrument_id
)
select i.id instrument_id,i.symbol,i.exchange_code,i.currency_code,
  p.provider_code, coalesce(prices.daily_rows,0) daily_rows,
  prices.first_date,prices.last_date,prices.last_loaded_at,
  coalesce(mappings.mapping_count,0) active_mapping_count,
  jobs.status history_status,jobs.last_error history_error,
  a.assessment_id,a.assessment_date,a.created_at assessment_created_at,
  coalesce(c.candidate_count,0) pending_candidates,
  coalesce(c.eligible_candidates,0) eligible_candidates,c.decision_block,
  case
    when p.id is null then 'provider_missing'
    when coalesce(prices.daily_rows,0)<20 then 'history_insufficient'
    when coalesce(mappings.mapping_count,0)<>1 then 'mapping_missing_or_ambiguous'
    else 'requires_session_and_cutoff_validation'
  end data_status
from universe u join public.instruments i on i.id=u.id
left join public.data_providers p on p.is_active and p.provider_code=
  case when upper(i.exchange_code)='ASX' then 'yahoo' else 'tiingo' end
left join lateral (
  select count(*) daily_rows,min(observed_at::date) first_date,
    max(observed_at::date) last_date,max(loaded_at) last_loaded_at
  from public.market_observations m
  where m.instrument_id=i.id and m.provider_id=p.id and m.interval_code='1day'
    and m.close>0 and m.adjusted_close>0 and m.currency_code=i.currency_code
) prices on true
left join lateral (
  select count(*) mapping_count from public.provider_instruments pi
  where pi.instrument_id=i.id and pi.provider_id=p.id and pi.is_active
) mappings on true
left join lateral (
  select status,last_error from public.market_history_jobs j
  where j.instrument_id=i.id order by created_at desc,id desc limit 1
) jobs on true
left join lateral (
  select a.assessment_id,a.assessment_date,a.created_at
  from public.gpt_market_assessments a join public.gpt_market_runs r on r.run_id=a.run_id
  where a.instrument_id=i.id and r.analysis_mode='scheduled'
    and r.status in ('partial','succeeded') and r.completed_at is not null
    and a.technical_engine_input_used=false
  order by a.created_at desc,a.assessment_id limit 1
) a on true
left join candidates c on c.instrument_id=i.id
order by i.symbol,i.id;

