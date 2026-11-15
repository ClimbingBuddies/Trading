-- Read-only inventory, not a freshness, licensing or gap-free-history certificate.
-- Run with an authorized database operator connection; do not add public grants.
-- One latest v1 score per instrument, including inactive history-only instruments.
-- Provider presence means at least one stored daily row, NOT valid/full coverage.
-- Counts include instruments with no scores; no symbols, owners or notes are output.
with latest_scores as (
  select distinct on (instrument_id)
    instrument_id, score_status, score_details, score_date, calculated_at
  from public.market_scores
  where methodology_version = 'technical-score-v1'
    and technical_calculation_version = 'technical-engine-v1'
  order by instrument_id, score_date desc, calculated_at desc, id desc
), daily_sources as (
  select mo.instrument_id,
    bool_or(dp.provider_code = 'tiingo') as has_tiingo_daily,
    bool_or(dp.provider_code = 'yahoo') as has_yahoo_daily
  from public.market_observations mo
  join public.data_providers dp on dp.id = mo.provider_id
  where mo.interval_code = '1day'
  group by mo.instrument_id
)
select i.is_active, i.exchange_code, i.asset_type,
  coalesce(s.score_status, 'no_score') as score_status,
  s.score_details -> 'availability_weights' as availability_weights,
  count(*)::integer as instruments,
  count(*) filter (where d.has_tiingo_daily)::integer as with_tiingo_daily,
  count(*) filter (where d.has_yahoo_daily)::integer as with_yahoo_daily,
  count(*) filter (where d.instrument_id is null)::integer as without_daily_rows,
  min(s.score_date) as oldest_score_date,
  max(s.score_date) as newest_score_date,
  min(s.calculated_at) as oldest_calculation_at,
  max(s.calculated_at) as newest_calculation_at
from public.instruments i
left join latest_scores s on s.instrument_id = i.id
left join daily_sources d on d.instrument_id = i.id
group by i.is_active, i.exchange_code, i.asset_type,
  coalesce(s.score_status, 'no_score'), s.score_details -> 'availability_weights'
order by i.is_active desc nulls last, i.exchange_code, i.asset_type,
  score_status, availability_weights;
