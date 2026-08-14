create or replace view public.latest_market_observations
with (security_invoker = true)
as
select distinct on (mo.instrument_id)
  mo.id,
  mo.instrument_id,
  mo.provider_id,
  mo.close,
  mo.observed_at,
  mo.loaded_at,
  mo.currency_code
from public.market_observations mo
order by mo.instrument_id, mo.observed_at desc, mo.loaded_at desc, mo.id desc;

grant select on public.latest_market_observations to anon, authenticated;

comment on view public.latest_market_observations is
  'One most recent market observation per instrument, ordered by market observation timestamp. Security invoker preserves underlying market_observations RLS.';
