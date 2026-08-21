-- TECH-002 corrective identity migration.
--
-- A daily and weekly calculation can legitimately end on the same source
-- observation. Interval is therefore part of a deterministic indicator result
-- identity; without it an upsert can replace the daily row with the weekly row.

alter table public.technical_indicators
  drop constraint technical_indicators_instrument_id_observation_id_indicator_key;

alter table public.technical_indicators
  add constraint technical_indicators_instrument_id_observation_id_indicator_key
  unique (
    instrument_id,
    observation_id,
    interval_code,
    indicator_code,
    calculation_version
  );

comment on constraint technical_indicators_instrument_id_observation_id_indicator_key
  on public.technical_indicators is
  'Deterministic versioned indicator identity. Interval is required because daily and weekly outputs may share a final source observation.';
