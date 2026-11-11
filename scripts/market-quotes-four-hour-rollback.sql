-- Review current state and hold coordination lock before recovery.
-- Pause dispatch, account for queued HTTP work, drain at least eight minutes.
-- Also redeploy exact loader v6 source from commit 9f56300 and revert UI thresholds.
-- No observations or run history are removed by this rollback.
begin;
do $$
begin
  if not exists (select 1 from cron.job where jobid = 1
    and jobname = 'trading-market-data-every-15-minutes' and not active
    and schedule = '0-14/2 3,7,11,15,19,23 * * *'
    and md5(command) = 'b5d1843e0d6991329cff770d25dd7944') then
    raise exception 'Quote job differs from four-hour release';
  end if;
end $$;
create or replace function public.market_freshness_status_v1(p_asset_type text, p_observed_at timestamptz, p_instrument_created_at timestamptz, p_now timestamptz default clock_timestamp())
returns text language plpgsql stable security definer set search_path = '' as $$
declare session_status text; age_minutes numeric;
begin
  session_status := public.market_session_status_v1(p_asset_type,p_now);
  if session_status = 'closed' then return 'market_closed'; end if;
  if p_observed_at is null then
    if p_instrument_created_at is null or p_now >= p_instrument_created_at + interval '120 minutes' then return 'no_observation'; end if;
    return 'current';
  end if;
  age_minutes := greatest(0, extract(epoch from (p_now - p_observed_at)) / 60.0);
  if age_minutes <= 90 then return 'current'; end if;
  if age_minutes <= 120 then return 'due'; end if;
  return 'stale';
end;
$$;
select cron.alter_job(1, schedule := '*/15 * * * *', active := true);
commit;
