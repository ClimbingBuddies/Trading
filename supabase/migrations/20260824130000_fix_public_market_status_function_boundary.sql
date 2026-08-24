create or replace function public.market_session_status_v1(p_asset_type text, p_now timestamptz default clock_timestamp())
returns text language sql stable security definer set search_path = '' as $$
  select case when p_asset_type in ('equity','etf') then case when alerting.is_us_market_open_v1(p_now) then 'open' else 'closed' end else '24h' end;
$$;

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
revoke all on function public.market_session_status_v1(text,timestamptz) from public;
revoke all on function public.market_freshness_status_v1(text,timestamptz,timestamptz,timestamptz) from public;
grant execute on function public.market_session_status_v1(text,timestamptz) to anon, authenticated;
grant execute on function public.market_freshness_status_v1(text,timestamptz,timestamptz,timestamptz) to anon, authenticated;
