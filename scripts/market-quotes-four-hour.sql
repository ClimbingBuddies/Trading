-- Trading glvbqcplgjdfgjyknzsa only. Pause dispatch, verify queue empty and drain
-- at least eight minutes; install claim RPC and deploy reviewed loader first.
-- Preserve job identity, command, credentials, history and function privileges.
begin;
do $$
begin
  if md5(pg_get_functiondef('public.market_freshness_status_v1(text,timestamptz,timestamptz,timestamptz)'::regprocedure)) <> '27bad74159be11400c14c5e72d65a740' then
    raise exception 'Freshness function differs from reviewed baseline';
  end if;
  if not exists (select 1 from cron.job where jobid = 1
    and jobname = 'trading-market-data-every-15-minutes' and not active
    and schedule = '*/15 * * * *'
    and md5(command) = 'b5d1843e0d6991329cff770d25dd7944') then
    raise exception 'Quote job differs from reviewed baseline';
  end if;
  if current_setting('cron.timezone') not in ('GMT','UTC') then
    raise exception 'Unexpected scheduler timezone';
  end if;
end $$;

create or replace function public.market_freshness_status_v1(p_asset_type text, p_observed_at timestamptz, p_instrument_created_at timestamptz, p_now timestamptz default clock_timestamp())
returns text language plpgsql stable security definer set search_path = '' as $$
declare session_status text; age_minutes numeric;
begin
  session_status := public.market_session_status_v1(p_asset_type,p_now);
  if session_status = 'closed' then return 'market_closed'; end if;
  if p_observed_at is null then
    if p_instrument_created_at is null or p_now >= p_instrument_created_at + interval '285 minutes' then return 'no_observation'; end if;
    return 'current';
  end if;
  age_minutes := greatest(0, extract(epoch from (p_now - p_observed_at)) / 60.0);
  if age_minutes <= 255 then return 'current'; end if;
  if age_minutes <= 285 then return 'due'; end if;
  return 'stale';
end;
$$;

-- Four-hour cycles, eight paced batches, at most eight symbols per batch.
select cron.alter_job(1, schedule := '0-14/2 3,7,11,15,19,23 * * *', active := true);
commit;
