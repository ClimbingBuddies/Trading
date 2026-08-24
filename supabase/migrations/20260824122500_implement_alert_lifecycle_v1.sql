create schema if not exists alerting;
revoke all on schema alerting from public, anon, authenticated;
grant usage on schema alerting to service_role;

alter table public.alerts add column if not exists theme_id uuid references public.opportunity_themes(id) on delete cascade;
alter table public.alerts add column if not exists updated_at timestamptz not null default now();
alter table public.alerts alter column owner_user_id set not null;
alter table public.alerts drop constraint if exists alerts_check;
alter table public.alerts drop constraint if exists alerts_exactly_one_target;
alter table public.alerts add constraint alerts_exactly_one_target check (num_nonnulls(instrument_id, watchlist_id, theme_id) = 1);
alter table public.alerts drop constraint if exists alerts_type_check;
alter table public.alerts add constraint alerts_type_check check (alert_type = any (array['price_threshold','data_freshness','market_assessment','opportunity_assessment','market_convergence','technical_score']));
alter table public.alerts drop constraint if exists alerts_target_type_check;
alter table public.alerts add constraint alerts_target_type_check check (
  (alert_type = 'opportunity_assessment' and theme_id is not null and instrument_id is null and watchlist_id is null)
  or
  (alert_type <> 'opportunity_assessment' and theme_id is null and num_nonnulls(instrument_id, watchlist_id) = 1)
);
alter table public.alerts drop constraint if exists alerts_condition_version_check;
alter table public.alerts add constraint alerts_condition_version_check check ((condition ->> 'condition_version') = 'alert-trigger-v1');
create index if not exists alerts_owner_user_id_idx on public.alerts(owner_user_id);
create index if not exists alerts_instrument_id_idx on public.alerts(instrument_id) where instrument_id is not null;
create index if not exists alerts_watchlist_id_idx on public.alerts(watchlist_id) where watchlist_id is not null;
create index if not exists alerts_theme_id_idx on public.alerts(theme_id) where theme_id is not null;

alter table public.alert_events add column if not exists theme_id uuid references public.opportunity_themes(id) on delete set null;
alter table public.alert_events add column if not exists event_key text;
alter table public.alert_events alter column event_key set not null;
alter table public.alert_events alter column notification_status set default 'not_requested';
alter table public.alert_events drop constraint if exists alert_events_notification_status_check;
alter table public.alert_events add constraint alert_events_notification_status_check check (notification_status = any (array['not_requested','pending','sent','failed','skipped']));
create unique index if not exists alert_events_alert_event_key_uidx on public.alert_events(alert_id,event_key);
create index if not exists alert_events_triggered_at_idx on public.alert_events(triggered_at desc);

create table if not exists public.alert_evaluation_state (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.alerts(id) on delete cascade,
  instrument_id uuid references public.instruments(id) on delete cascade,
  theme_id uuid references public.opportunity_themes(id) on delete cascade,
  last_source_key text,
  last_source_table text,
  last_source_at timestamptz,
  last_value jsonb not null default '{}'::jsonb,
  condition_true boolean,
  rearm_cycle integer not null default 0 check (rearm_cycle >= 0),
  last_evaluated_at timestamptz,
  last_triggered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alert_evaluation_state_one_scope check (num_nonnulls(instrument_id, theme_id) = 1)
);
create unique index if not exists alert_evaluation_state_alert_instrument_uidx on public.alert_evaluation_state(alert_id,instrument_id) where instrument_id is not null;
create unique index if not exists alert_evaluation_state_alert_theme_uidx on public.alert_evaluation_state(alert_id,theme_id) where theme_id is not null;

create table if not exists public.alert_evaluator_runs (
  id uuid primary key default gen_random_uuid(),
  reason text not null,
  alert_type text,
  alert_id uuid references public.alerts(id) on delete set null,
  instrument_id uuid references public.instruments(id) on delete set null,
  theme_id uuid references public.opportunity_themes(id) on delete set null,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  status text not null default 'running' check (status = any (array['running','succeeded','partial','failed'])),
  alerts_considered integer not null default 0 check (alerts_considered >= 0),
  events_created integer not null default 0 check (events_created >= 0),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  evaluator_version text not null default 'alert-evaluator-v1'
);

alter table public.alerts enable row level security;
alter table public.alert_events enable row level security;
alter table public.alert_evaluation_state enable row level security;
alter table public.alert_evaluator_runs enable row level security;

revoke all on public.alerts from anon, authenticated;
revoke all on public.alert_events from anon, authenticated;
revoke all on public.alert_evaluation_state from anon, authenticated;
revoke all on public.alert_evaluator_runs from anon, authenticated;
grant select, insert, update, delete on public.alerts to authenticated;
grant select on public.alert_events to authenticated;

drop policy if exists alerts_owner_select on public.alerts;
create policy alerts_owner_select on public.alerts for select to authenticated
using (
  (select auth.uid()) is not null
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and owner_user_id = (select auth.uid())
  and (watchlist_id is null or exists (select 1 from public.watchlists w where w.id = alerts.watchlist_id and w.owner_user_id = (select auth.uid())))
);
drop policy if exists alerts_owner_insert on public.alerts;
create policy alerts_owner_insert on public.alerts for insert to authenticated
with check (
  (select auth.uid()) is not null
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and owner_user_id = (select auth.uid())
  and (watchlist_id is null or exists (select 1 from public.watchlists w where w.id = alerts.watchlist_id and w.owner_user_id = (select auth.uid())))
);
drop policy if exists alerts_owner_update on public.alerts;
create policy alerts_owner_update on public.alerts for update to authenticated
using (
  (select auth.uid()) is not null
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and owner_user_id = (select auth.uid())
)
with check (
  (select auth.uid()) is not null
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and owner_user_id = (select auth.uid())
  and (watchlist_id is null or exists (select 1 from public.watchlists w where w.id = alerts.watchlist_id and w.owner_user_id = (select auth.uid())))
);
drop policy if exists alerts_owner_delete on public.alerts;
create policy alerts_owner_delete on public.alerts for delete to authenticated
using (
  (select auth.uid()) is not null
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and owner_user_id = (select auth.uid())
);

drop policy if exists alert_events_owner_select on public.alert_events;
create policy alert_events_owner_select on public.alert_events for select to authenticated
using (
  (select auth.uid()) is not null
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
  and exists (
    select 1 from public.alerts a
    where a.id = alert_events.alert_id
      and a.owner_user_id = (select auth.uid())
  )
);

create or replace function alerting.nth_isodow(p_year integer, p_month integer, p_isodow integer, p_nth integer)
returns date language sql immutable set search_path = '' as $$
  select make_date(p_year,p_month,1)
    + (((p_isodow - extract(isodow from make_date(p_year,p_month,1))::integer + 7) % 7) + 7 * (p_nth - 1));
$$;
create or replace function alerting.last_isodow(p_year integer, p_month integer, p_isodow integer)
returns date language sql immutable set search_path = '' as $$
  with d as (select (make_date(p_year,p_month,1) + interval '1 month - 1 day')::date as last_day)
  select last_day - ((extract(isodow from last_day)::integer - p_isodow + 7) % 7) from d;
$$;
create or replace function alerting.observed_fixed(p_year integer, p_month integer, p_day integer)
returns date language plpgsql immutable set search_path = '' as $$
declare d date := make_date(p_year,p_month,p_day); w integer;
begin
  w := extract(isodow from d)::integer;
  if w = 6 then return d - 1; end if;
  if w = 7 then return d + 1; end if;
  return d;
end;
$$;
create or replace function alerting.easter_sunday(p_year integer)
returns date language plpgsql immutable set search_path = '' as $$
declare a integer; b integer; c integer; d integer; e integer; f integer; g integer; h integer; i integer; k integer; l integer; m integer; p_month integer; p_day integer;
begin
  a := p_year % 19; b := p_year / 100; c := p_year % 100; d := b / 4; e := b % 4;
  f := (b + 8) / 25; g := (b - f + 1) / 3; h := (19*a + b - d - g + 15) % 30;
  i := c / 4; k := c % 4; l := (32 + 2*e + 2*i - h - k) % 7; m := (a + 11*h + 22*l) / 451;
  p_month := (h + l - 7*m + 114) / 31; p_day := ((h + l - 7*m + 114) % 31) + 1;
  return make_date(p_year,p_month,p_day);
end;
$$;
create or replace function alerting.is_us_market_open_v1(p_now timestamptz)
returns boolean language plpgsql stable set search_path = '' as $$
declare local_ts timestamp; local_date date; y integer; minutes integer; holidays date[] := array[]::date[]; yy integer;
begin
  local_ts := p_now at time zone 'America/New_York';
  local_date := local_ts::date;
  y := extract(year from local_date)::integer;
  if extract(isodow from local_date)::integer > 5 then return false; end if;
  for yy in y-1..y+1 loop
    holidays := holidays || array[
      alerting.observed_fixed(yy,1,1),
      alerting.nth_isodow(yy,1,1,3),
      alerting.nth_isodow(yy,2,1,3),
      alerting.easter_sunday(yy) - 2,
      alerting.last_isodow(yy,5,1),
      alerting.observed_fixed(yy,6,19),
      alerting.observed_fixed(yy,7,4),
      alerting.nth_isodow(yy,9,1,1),
      alerting.nth_isodow(yy,11,4,4),
      alerting.observed_fixed(yy,12,25)
    ];
  end loop;
  if local_date = any(holidays) then return false; end if;
  minutes := extract(hour from local_ts)::integer * 60 + extract(minute from local_ts)::integer;
  return minutes >= 570 and minutes < 960;
end;
$$;
create or replace function public.market_session_status_v1(p_asset_type text, p_now timestamptz default clock_timestamp())
returns text language sql stable set search_path = '' as $$
  select case when p_asset_type in ('equity','etf') then case when alerting.is_us_market_open_v1(p_now) then 'open' else 'closed' end else '24h' end;
$$;
create or replace function public.market_freshness_status_v1(p_asset_type text, p_observed_at timestamptz, p_instrument_created_at timestamptz, p_now timestamptz default clock_timestamp())
returns text language plpgsql stable set search_path = '' as $$
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

create or replace view public.latest_market_status
with (security_invoker = true) as
select
  i.id as instrument_id,
  o.close,
  o.observed_at,
  o.loaded_at,
  coalesce(o.currency_code, i.currency_code) as currency_code,
  case when o.observed_at is null then null else greatest(0, round(extract(epoch from (clock_timestamp() - o.observed_at))/60.0))::integer end as age_minutes,
  public.market_session_status_v1(i.asset_type, clock_timestamp()) as session_status,
  case public.market_freshness_status_v1(i.asset_type,o.observed_at,i.created_at,clock_timestamp()) when 'no_observation' then 'no_data' else public.market_freshness_status_v1(i.asset_type,o.observed_at,i.created_at,clock_timestamp()) end as data_status
from public.instruments i
left join lateral (
  select mo.close, mo.observed_at, mo.loaded_at, mo.currency_code
  from public.market_observations mo
  where mo.instrument_id = i.id and mo.interval_code = 'quote'
  order by mo.observed_at desc, mo.id desc
  limit 1
) o on true
where i.is_active = true;
grant select on public.latest_market_status to anon, authenticated;

create or replace function alerting.validate_alert_definition_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare op text; metric text; min_conf numeric; bad_count integer; instrument_currency text;
begin
  if jsonb_typeof(new.condition) <> 'object' then raise exception 'Alert condition must be a JSON object'; end if;
  if new.condition ->> 'condition_version' <> 'alert-trigger-v1' then raise exception 'Unsupported alert condition version'; end if;
  op := new.condition ->> 'operator';
  metric := new.condition ->> 'metric';
  if new.condition ? 'minimum_confidence' then
    if jsonb_typeof(new.condition -> 'minimum_confidence') <> 'number' then raise exception 'minimum_confidence must be numeric'; end if;
    min_conf := (new.condition ->> 'minimum_confidence')::numeric;
    if min_conf < 0 or min_conf > 100 then raise exception 'minimum_confidence must be between 0 and 100'; end if;
  end if;
  if new.watchlist_id is not null and not exists (select 1 from public.watchlists w where w.id=new.watchlist_id and w.owner_user_id=new.owner_user_id) then raise exception 'Alert watchlist must belong to alert owner'; end if;
  if new.alert_type = 'price_threshold' then
    if op not in ('crosses_above','crosses_below') or jsonb_typeof(new.condition -> 'threshold') <> 'number' or nullif(new.condition ->> 'currency_code','') is null then raise exception 'Invalid price_threshold condition'; end if;
    if new.instrument_id is not null then
      select btrim(i.currency_code) into instrument_currency from public.instruments i where i.id=new.instrument_id;
      if instrument_currency is distinct from new.condition ->> 'currency_code' then raise exception 'Price alert currency must match instrument currency'; end if;
    else
      select count(*) into bad_count from public.watchlist_items wi join public.instruments i on i.id=wi.instrument_id where wi.watchlist_id=new.watchlist_id and btrim(i.currency_code) <> new.condition ->> 'currency_code';
      if bad_count > 0 then raise exception 'All watchlist instruments must match price alert currency'; end if;
    end if;
  elsif new.alert_type = 'data_freshness' then
    if op <> 'enters_state' or jsonb_typeof(new.condition -> 'states') <> 'array' or jsonb_array_length(new.condition -> 'states') = 0 then raise exception 'Invalid data_freshness condition'; end if;
    select count(*) into bad_count from jsonb_array_elements_text(new.condition -> 'states') x where x not in ('due','stale','no_observation');
    if bad_count > 0 then raise exception 'Unsupported freshness state'; end if;
  elsif new.alert_type = 'market_assessment' then
    if metric = 'rating' and op in ('enters_value','changes') then
      if op='enters_value' then
        if jsonb_typeof(new.condition -> 'values') <> 'array' or jsonb_array_length(new.condition -> 'values')=0 then raise exception 'rating enters_value requires values'; end if;
        select count(*) into bad_count from jsonb_array_elements_text(new.condition -> 'values') x where x not in ('Buy','Hold','Sell');
        if bad_count>0 then raise exception 'Unsupported Market Assessment rating'; end if;
      end if;
    elsif metric='score' and op in ('crosses_above','crosses_below') and jsonb_typeof(new.condition -> 'threshold')='number' then
      if (new.condition ->> 'threshold')::numeric < 0 or (new.condition ->> 'threshold')::numeric > 100 then raise exception 'Market score threshold must be 0-100'; end if;
    else raise exception 'Invalid market_assessment condition'; end if;
  elsif new.alert_type = 'opportunity_assessment' then
    if metric='opportunity_score' and op in ('crosses_above','crosses_below') and jsonb_typeof(new.condition -> 'threshold')='number' then
      if (new.condition ->> 'threshold')::numeric < 0 or (new.condition ->> 'threshold')::numeric > 100 then raise exception 'Opportunity score threshold must be 0-100'; end if;
    elsif metric='opportunity_level' and op='enters_value' then
      if jsonb_typeof(new.condition -> 'values') <> 'array' or jsonb_array_length(new.condition -> 'values')=0 then raise exception 'Opportunity level requires values'; end if;
      select count(*) into bad_count from jsonb_array_elements_text(new.condition -> 'values') x where x not in ('emerging','watch','high','major','transformational');
      if bad_count>0 then raise exception 'Unsupported Opportunity level'; end if;
    elsif metric='commercial_readiness' and op='enters_value' then
      if jsonb_typeof(new.condition -> 'values') <> 'array' or jsonb_array_length(new.condition -> 'values')=0 then raise exception 'Commercial readiness requires values'; end if;
      select count(*) into bad_count from jsonb_array_elements_text(new.condition -> 'values') x where x not in ('early','watch','developing','actionable','mature');
      if bad_count>0 then raise exception 'Unsupported commercial readiness'; end if;
    else raise exception 'Invalid opportunity_assessment condition'; end if;
  elsif new.alert_type = 'market_convergence' then
    if metric='convergence_score' and op in ('crosses_above','crosses_below') and jsonb_typeof(new.condition -> 'threshold')='number' then
      if (new.condition ->> 'threshold')::numeric < 0 or (new.condition ->> 'threshold')::numeric > 100 then raise exception 'Convergence score threshold must be 0-100'; end if;
    elsif metric='convergence_label' and op in ('enters_value','changes') then
      if op='enters_value' then
        if jsonb_typeof(new.condition -> 'values') <> 'array' or jsonb_array_length(new.condition -> 'values')=0 then raise exception 'Convergence label requires values'; end if;
        select count(*) into bad_count from jsonb_array_elements_text(new.condition -> 'values') x where x not in ('very_strong_bullish','strong_bullish','moderate_bullish','neutral','mixed','conflict','moderate_bearish','strong_bearish','very_strong_bearish');
        if bad_count>0 then raise exception 'Unsupported convergence label'; end if;
      end if;
    else raise exception 'Invalid market_convergence condition'; end if;
  elsif new.alert_type = 'technical_score' then
    if metric not in ('overall_score','momentum_score','trend_score','volatility_score','volume_score') or op not in ('crosses_above','crosses_below') or jsonb_typeof(new.condition -> 'threshold') <> 'number' then raise exception 'Invalid technical_score condition'; end if;
    if (new.condition ->> 'threshold')::numeric < 0 or (new.condition ->> 'threshold')::numeric > 100 then raise exception 'Technical score threshold must be 0-100'; end if;
  else raise exception 'Unsupported alert type'; end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists alerts_validate_definition_v1 on public.alerts;
create trigger alerts_validate_definition_v1 before insert or update of owner_user_id,instrument_id,watchlist_id,theme_id,alert_type,condition,is_enabled on public.alerts for each row execute function alerting.validate_alert_definition_v1();

create or replace function alerting.scope_state_id_v1(p_alert_id uuid, p_instrument_id uuid, p_theme_id uuid)
returns uuid language sql stable set search_path = '' as $$
  select s.id from public.alert_evaluation_state s where s.alert_id=p_alert_id and ((p_instrument_id is not null and s.instrument_id=p_instrument_id) or (p_theme_id is not null and s.theme_id=p_theme_id)) limit 1;
$$;

create or replace function alerting.evaluate_one_v1(p_alert_id uuid, p_now timestamptz default clock_timestamp())
returns integer language plpgsql security definer set search_path = '' as $$
declare a public.alerts%rowtype; sc record; st public.alert_evaluation_state%rowtype; source_key text; source_table text; source_at timestamptz; current_value jsonb; current_conf numeric; methodology text; metric text; op text; threshold numeric; min_conf numeric := 0; current_text text; prior_text text; current_num numeric; prior_num numeric; current_truth boolean; should_trigger boolean; new_rearm integer; event_key text; event_inserted bigint; created_events integer := 0; status_value text; inst record; latest_obs record;
begin
  select * into a from public.alerts where id=p_alert_id and is_enabled=true;
  if not found then return 0; end if;
  metric := a.condition ->> 'metric'; op := a.condition ->> 'operator';
  if a.condition ? 'threshold' then threshold := (a.condition ->> 'threshold')::numeric; end if;
  if a.condition ? 'minimum_confidence' then min_conf := (a.condition ->> 'minimum_confidence')::numeric; end if;

  if a.theme_id is not null then
    for sc in select null::uuid as instrument_id, a.theme_id as theme_id loop
      source_key := null; source_table := null; source_at := null; current_value := null; current_conf := null; methodology := null;
      select oa.id::text, 'opportunity_assessments', oa.updated_at,
        case metric when 'opportunity_level' then jsonb_build_object('value',oa.opportunity_level) when 'opportunity_score' then jsonb_build_object('value',oa.opportunity_score) when 'commercial_readiness' then jsonb_build_object('value',oa.commercial_readiness) end,
        oa.opportunity_confidence, oa.methodology_version
      into source_key,source_table,source_at,current_value,current_conf,methodology
      from public.opportunity_assessments oa where oa.theme_id=sc.theme_id
      order by oa.assessment_date desc, oa.updated_at desc, oa.id desc limit 1;
      if source_key is null or (current_conf is not null and current_conf < min_conf) then continue; end if;
      select * into st from public.alert_evaluation_state s where s.alert_id=a.id and s.theme_id=sc.theme_id limit 1;
      if not found then
        insert into public.alert_evaluation_state(alert_id,theme_id,last_source_key,last_source_table,last_source_at,last_value,condition_true,last_evaluated_at,updated_at)
        values(a.id,sc.theme_id,source_key,source_table,source_at,current_value,false,p_now,p_now);
        continue;
      end if;
      if st.last_source_key is not distinct from source_key then update public.alert_evaluation_state set last_evaluated_at=p_now,updated_at=p_now where id=st.id; continue; end if;
      current_text := current_value ->> 'value'; prior_text := st.last_value ->> 'value'; should_trigger := false; current_truth := false;
      if op='enters_value' then current_truth := exists(select 1 from jsonb_array_elements_text(a.condition -> 'values') v where v=current_text); should_trigger := current_truth and not coalesce(st.condition_true,false);
      elsif op='crosses_above' then current_num:=current_text::numeric; prior_num:=nullif(prior_text,'')::numeric; current_truth:=current_num>threshold; should_trigger:=prior_num<=threshold and current_num>threshold;
      elsif op='crosses_below' then current_num:=current_text::numeric; prior_num:=nullif(prior_text,'')::numeric; current_truth:=current_num<threshold; should_trigger:=prior_num>=threshold and current_num<threshold;
      end if;
      new_rearm:=st.rearm_cycle; if coalesce(st.condition_true,false) and not current_truth then new_rearm:=new_rearm+1; end if;
      if should_trigger then
        event_key:=source_key||':'||coalesce(metric,'value')||':'||op;
        insert into public.alert_events(alert_id,theme_id,triggered_at,trigger_value,message,notification_status,event_key,metadata)
        values(a.id,sc.theme_id,p_now,case when current_text ~ '^-?[0-9]+(\.[0-9]+)?$' then current_text::numeric else null end,
          a.name||' triggered','not_requested',event_key,
          jsonb_build_object('condition_version','alert-trigger-v1','alert_type',a.alert_type,'operator',op,'metric',metric,'source_table',source_table,'source_row_id',source_key,'source_at',source_at,'prior_value',prior_text,'current_value',current_text,'threshold',threshold,'selected_values',a.condition -> 'values','confidence',current_conf,'methodology_version',methodology,'evaluator_version','alert-evaluator-v1','theme_id',sc.theme_id))
        on conflict(alert_id,event_key) do nothing returning id into event_inserted;
        if event_inserted is not null then created_events:=created_events+1; update public.alerts set last_triggered_at=p_now where id=a.id; end if;
      end if;
      update public.alert_evaluation_state set last_source_key=source_key,last_source_table=source_table,last_source_at=source_at,last_value=current_value,condition_true=current_truth,rearm_cycle=new_rearm,last_evaluated_at=p_now,last_triggered_at=case when should_trigger then p_now else last_triggered_at end,updated_at=p_now where id=st.id;
    end loop;
  else
    for sc in
      select a.instrument_id as instrument_id, null::uuid as theme_id where a.instrument_id is not null
      union all
      select wi.instrument_id, null::uuid from public.watchlist_items wi where a.watchlist_id is not null and wi.watchlist_id=a.watchlist_id
    loop
      source_key := null; source_table := null; source_at := null; current_value := null; current_conf := null; methodology := null;
      if a.alert_type='price_threshold' then
        select mo.id::text,'market_observations',mo.observed_at,jsonb_build_object('value',mo.close,'currency_code',btrim(coalesce(mo.currency_code,i.currency_code))),null::numeric,null::text
        into source_key,source_table,source_at,current_value,current_conf,methodology from public.market_observations mo join public.instruments i on i.id=mo.instrument_id where mo.instrument_id=sc.instrument_id and mo.interval_code='quote' and btrim(coalesce(mo.currency_code,i.currency_code))=a.condition ->> 'currency_code' order by mo.observed_at desc,mo.id desc limit 1;
      elsif a.alert_type='data_freshness' then
        select i.id,i.asset_type,i.created_at into inst from public.instruments i where i.id=sc.instrument_id;
        select mo.id,mo.observed_at into latest_obs from public.market_observations mo where mo.instrument_id=sc.instrument_id and mo.interval_code='quote' order by mo.observed_at desc,mo.id desc limit 1;
        status_value:=public.market_freshness_status_v1(inst.asset_type,latest_obs.observed_at,inst.created_at,p_now);
        source_key:=coalesce(latest_obs.id::text,'none')||':'||status_value; source_table:='market_observations+clock'; source_at:=coalesce(latest_obs.observed_at,p_now); current_value:=jsonb_build_object('value',status_value);
      elsif a.alert_type='market_assessment' then
        select g.assessment_id::text,'gpt_market_assessments',g.created_at,
          case metric when 'rating' then jsonb_build_object('value',g.rating) when 'score' then jsonb_build_object('value',g.score) end,
          g.confidence,g.methodology_version
        into source_key,source_table,source_at,current_value,current_conf,methodology
        from public.gpt_market_assessments g join public.gpt_market_runs r on r.run_id=g.run_id and r.status='succeeded' where g.instrument_id=sc.instrument_id order by g.assessment_date desc,g.created_at desc,g.assessment_id desc limit 1;
      elsif a.alert_type='market_convergence' then
        select c.id::text,'market_convergence_assessments',c.updated_at,
          case metric when 'convergence_label' then jsonb_build_object('value',c.convergence_label) when 'convergence_score' then jsonb_build_object('value',c.convergence_score) end,
          c.convergence_confidence,c.methodology_version
        into source_key,source_table,source_at,current_value,current_conf,methodology from public.market_convergence_assessments c where c.instrument_id=sc.instrument_id order by c.assessment_date desc,c.updated_at desc,c.id desc limit 1;
      elsif a.alert_type='technical_score' then
        select m.id::text,'market_scores',m.calculated_at,
          jsonb_build_object('value',case metric when 'overall_score' then m.overall_score when 'momentum_score' then m.momentum_score when 'trend_score' then m.trend_score when 'volatility_score' then m.volatility_score when 'volume_score' then m.volume_score end),
          m.confidence_score,m.methodology_version
        into source_key,source_table,source_at,current_value,current_conf,methodology from public.market_scores m where m.instrument_id=sc.instrument_id and m.score_status='complete' order by m.score_date desc,m.calculated_at desc,m.id desc limit 1;
      end if;
      if source_key is null or current_value is null or (current_conf is not null and current_conf < min_conf) then continue; end if;
      select * into st from public.alert_evaluation_state s where s.alert_id=a.id and s.instrument_id=sc.instrument_id limit 1;
      if not found then
        current_text:=current_value ->> 'value'; current_truth:=false;
        if op in ('enters_value','enters_state') then current_truth:=exists(select 1 from jsonb_array_elements_text(coalesce(a.condition -> 'values',a.condition -> 'states')) v where v=current_text);
        elsif op='crosses_above' then current_truth:=current_text::numeric>threshold;
        elsif op='crosses_below' then current_truth:=current_text::numeric<threshold;
        end if;
        insert into public.alert_evaluation_state(alert_id,instrument_id,last_source_key,last_source_table,last_source_at,last_value,condition_true,last_evaluated_at,updated_at)
        values(a.id,sc.instrument_id,source_key,source_table,source_at,current_value,current_truth,p_now,p_now);
        continue;
      end if;
      if st.last_source_key is not distinct from source_key then update public.alert_evaluation_state set last_evaluated_at=p_now,updated_at=p_now where id=st.id; continue; end if;
      current_text:=current_value ->> 'value'; prior_text:=st.last_value ->> 'value'; should_trigger:=false; current_truth:=false;
      if op in ('enters_value','enters_state') then current_truth:=exists(select 1 from jsonb_array_elements_text(coalesce(a.condition -> 'values',a.condition -> 'states')) v where v=current_text); should_trigger:=current_truth and not coalesce(st.condition_true,false);
      elsif op='changes' then current_truth:=false; should_trigger:=prior_text is distinct from current_text;
      elsif op='crosses_above' then current_num:=current_text::numeric; prior_num:=nullif(prior_text,'')::numeric; current_truth:=current_num>threshold; should_trigger:=prior_num<=threshold and current_num>threshold;
      elsif op='crosses_below' then current_num:=current_text::numeric; prior_num:=nullif(prior_text,'')::numeric; current_truth:=current_num<threshold; should_trigger:=prior_num>=threshold and current_num<threshold;
      end if;
      new_rearm:=st.rearm_cycle; if coalesce(st.condition_true,false) and not current_truth then new_rearm:=new_rearm+1; end if;
      if should_trigger then
        if a.alert_type='data_freshness' then event_key:=sc.instrument_id::text||':'||current_text||':'||new_rearm::text; else event_key:=source_key||':'||coalesce(metric,'value')||':'||op; end if;
        event_inserted:=null;
        insert into public.alert_events(alert_id,instrument_id,triggered_at,trigger_value,message,notification_status,event_key,metadata)
        values(a.id,sc.instrument_id,p_now,case when current_text ~ '^-?[0-9]+(\.[0-9]+)?$' then current_text::numeric else null end,
          a.name||' triggered for '||(select i.symbol from public.instruments i where i.id=sc.instrument_id),'not_requested',event_key,
          jsonb_build_object('condition_version','alert-trigger-v1','alert_type',a.alert_type,'operator',op,'metric',metric,'source_table',source_table,'source_row_id',source_key,'source_at',source_at,'prior_value',prior_text,'current_value',current_text,'threshold',threshold,'selected_values',coalesce(a.condition -> 'values',a.condition -> 'states'),'confidence',current_conf,'methodology_version',methodology,'evaluator_version','alert-evaluator-v1','instrument_id',sc.instrument_id,'watchlist_id',a.watchlist_id,'rearm_cycle',new_rearm))
        on conflict(alert_id,event_key) do nothing returning id into event_inserted;
        if event_inserted is not null then created_events:=created_events+1; update public.alerts set last_triggered_at=p_now where id=a.id; end if;
      end if;
      update public.alert_evaluation_state set last_source_key=source_key,last_source_table=source_table,last_source_at=source_at,last_value=current_value,condition_true=current_truth,rearm_cycle=new_rearm,last_evaluated_at=p_now,last_triggered_at=case when should_trigger and event_inserted is not null then p_now else last_triggered_at end,updated_at=p_now where id=st.id;
    end loop;
  end if;
  if a.watchlist_id is not null then delete from public.alert_evaluation_state s where s.alert_id=a.id and s.instrument_id is not null and not exists(select 1 from public.watchlist_items wi where wi.watchlist_id=a.watchlist_id and wi.instrument_id=s.instrument_id); end if;
  return created_events;
end;
$$;

create or replace function alerting.run_v1(p_reason text, p_alert_type text default null, p_instrument_id uuid default null, p_theme_id uuid default null, p_alert_id uuid default null, p_now timestamptz default clock_timestamp())
returns uuid language plpgsql security definer set search_path = '' as $$
declare run_id uuid; a record; considered integer:=0; events integer:=0; failures integer:=0; errors text:=''; n integer;
begin
  insert into public.alert_evaluator_runs(reason,alert_type,alert_id,instrument_id,theme_id,metadata) values(p_reason,p_alert_type,p_alert_id,p_instrument_id,p_theme_id,jsonb_build_object('requested_at',p_now)) returning id into run_id;
  for a in
    select al.id from public.alerts al
    where al.is_enabled=true
      and (p_alert_type is null or al.alert_type=p_alert_type)
      and (p_alert_id is null or al.id=p_alert_id)
      and (p_theme_id is null or al.theme_id=p_theme_id)
      and (p_instrument_id is null or al.instrument_id=p_instrument_id or exists(select 1 from public.watchlist_items wi where wi.watchlist_id=al.watchlist_id and wi.instrument_id=p_instrument_id))
  loop
    considered:=considered+1;
    begin
      n:=alerting.evaluate_one_v1(a.id,p_now); events:=events+n;
    exception when others then
      failures:=failures+1; errors:=errors||case when errors='' then '' else E'\n' end||a.id::text||': '||sqlerrm;
    end;
  end loop;
  update public.alert_evaluator_runs set finished_at=clock_timestamp(),status=case when failures=0 then 'succeeded' when failures<considered then 'partial' else 'failed' end,alerts_considered=considered,events_created=events,error_message=nullif(errors,'') where id=run_id;
  return run_id;
exception when others then
  if run_id is not null then update public.alert_evaluator_runs set finished_at=clock_timestamp(),status='failed',error_message=sqlerrm where id=run_id; end if;
  return run_id;
end;
$$;

revoke all on function alerting.run_v1(text,text,uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function alerting.run_v1(text,text,uuid,uuid,uuid,timestamptz) to service_role;
revoke all on function alerting.evaluate_one_v1(uuid,timestamptz) from public, anon, authenticated;

create or replace function alerting.after_alert_config_change_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    if new.is_enabled then perform alerting.run_v1('alert-baseline',null,null,null,new.id,clock_timestamp()); end if;
    return new;
  end if;
  if old.alert_type is distinct from new.alert_type or old.condition is distinct from new.condition or old.instrument_id is distinct from new.instrument_id or old.watchlist_id is distinct from new.watchlist_id or old.theme_id is distinct from new.theme_id or (old.is_enabled=false and new.is_enabled=true) then
    delete from public.alert_evaluation_state where alert_id=new.id;
    if new.is_enabled then perform alerting.run_v1('alert-rebaseline',null,null,null,new.id,clock_timestamp()); end if;
  end if;
  return new;
end;
$$;
drop trigger if exists alerts_after_config_change_v1 on public.alerts;
create trigger alerts_after_config_change_v1 after insert or update of instrument_id,watchlist_id,theme_id,alert_type,condition,is_enabled on public.alerts for each row execute function alerting.after_alert_config_change_v1();

create or replace function alerting.on_quote_v1()
returns trigger language plpgsql security definer set search_path = '' as $$ begin perform alerting.run_v1('quote-insert','price_threshold',new.instrument_id,null,null,clock_timestamp()); return new; end; $$;
drop trigger if exists alerting_quote_insert_v1 on public.market_observations;
create trigger alerting_quote_insert_v1 after insert on public.market_observations for each row when (new.interval_code='quote') execute function alerting.on_quote_v1();

create or replace function alerting.on_gpt_run_v1()
returns trigger language plpgsql security definer set search_path = '' as $$ begin if new.status='succeeded' and old.status is distinct from new.status then perform alerting.run_v1('gpt-market-run','market_assessment',null,null,null,clock_timestamp()); end if; return new; end; $$;
drop trigger if exists alerting_gpt_run_v1 on public.gpt_market_runs;
create trigger alerting_gpt_run_v1 after update of status on public.gpt_market_runs for each row execute function alerting.on_gpt_run_v1();

create or replace function alerting.on_opportunity_run_v1()
returns trigger language plpgsql security definer set search_path = '' as $$ begin if new.status='succeeded' and old.status is distinct from new.status then perform alerting.run_v1('opportunity-run','opportunity_assessment',null,null,null,clock_timestamp()); end if; return new; end; $$;
drop trigger if exists alerting_opportunity_run_v1 on public.opportunity_assessment_runs;
create trigger alerting_opportunity_run_v1 after update of status on public.opportunity_assessment_runs for each row execute function alerting.on_opportunity_run_v1();

create or replace function alerting.on_technical_run_v1()
returns trigger language plpgsql security definer set search_path = '' as $$ begin if new.status='succeeded' and old.status is distinct from new.status then perform alerting.run_v1('technical-run','technical_score',null,null,null,clock_timestamp()); end if; return new; end; $$;
drop trigger if exists alerting_technical_run_v1 on public.technical_engine_runs;
create trigger alerting_technical_run_v1 after update of status on public.technical_engine_runs for each row execute function alerting.on_technical_run_v1();

create or replace function alerting.on_convergence_run_v1()
returns trigger language plpgsql security definer set search_path = '' as $$ begin if new.status='succeeded' and old.status is distinct from new.status then perform alerting.run_v1('convergence-run','market_convergence',new.instrument_id,null,null,clock_timestamp()); end if; return new; end; $$;
drop trigger if exists alerting_convergence_run_v1 on public.market_convergence_runs;
create trigger alerting_convergence_run_v1 after update of status on public.market_convergence_runs for each row execute function alerting.on_convergence_run_v1();

select cron.unschedule(jobid) from cron.job where jobname='alert-freshness-v1';
select cron.schedule('alert-freshness-v1','*/15 * * * *',$$select alerting.run_v1('freshness-cron','data_freshness',null,null,null,clock_timestamp());$$);
