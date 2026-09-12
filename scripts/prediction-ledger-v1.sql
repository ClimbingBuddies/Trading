-- Deploy with Supabase apply_migration(name: personal_prediction_ledger_v1).
-- Standalone additive schema: no dependency on the undeployed Decision Lab v1 tables.
create schema if not exists private;

create table public.personal_prediction_tracking (
  owner_user_id uuid primary key references auth.users(id),
  started_at timestamptz not null default clock_timestamp()
);
create table public.personal_prediction_plans (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.personal_prediction_tracking(owner_user_id),
  assessment_id uuid not null references public.gpt_market_assessments(assessment_id),
  instrument_id uuid not null references public.instruments(id),
  symbol text not null, instrument_name text not null, currency text not null,
  published_at timestamptz not null default clock_timestamp(), source_cutoff timestamptz not null,
  source_rating text not null, action text not null check(action in ('BUY','HOLD','AVOID')),
  horizon_sessions integer not null check(horizon_sessions in (5,20)),
  entry_rule text not null default 'NEXT_COMPLETE_DAILY_CLOSE',
  exit_rule text not null default 'FIXED_SESSION_HORIZON',
  entry_deadline timestamptz not null,
  thesis text not null, risks text not null, model_identity text not null,
  source_snapshot jsonb not null,
  benchmark_instrument_id uuid references public.instruments(id), benchmark_symbol text,
  provider_id uuid references public.data_providers(id),
  cost_per_side numeric not null default 0.001 check(cost_per_side=0.001),
  methodology text not null default 'ai-rating-fixed-horizon-v1',
  unique(owner_user_id,assessment_id,horizon_sessions), unique(id,owner_user_id),
  check(source_cutoff<=published_at), check(entry_deadline>published_at),
  check(entry_rule='NEXT_COMPLETE_DAILY_CLOSE'), check(exit_rule='FIXED_SESSION_HORIZON')
);
create index personal_prediction_plans_owner_date on public.personal_prediction_plans(owner_user_id,published_at desc);
create table public.personal_prediction_results (
  id uuid primary key default gen_random_uuid(),
  prediction_id uuid not null, owner_user_id uuid not null,
  evaluated_at timestamptz not null default clock_timestamp(),
  status text not null check(status in ('PENDING_ENTRY','OPEN','COMPLETE','NOT_ENTERED','INCOMPLETE')),
  entry_at timestamptz, exit_at timestamptz, entry_price numeric, exit_price numeric,
  net_return numeric, benchmark_return numeric, reason text,
  observations jsonb not null default '[]',
  foreign key(prediction_id,owner_user_id) references public.personal_prediction_plans(id,owner_user_id),
  unique(prediction_id,status),
  check(entry_price is null or entry_price>0), check(exit_price is null or exit_price>0),
  check(status<>'COMPLETE' or (entry_price is not null and exit_price is not null and net_return is not null))
);
create index personal_prediction_results_owner_date on public.personal_prediction_results(owner_user_id,evaluated_at desc);

create function private.reject_prediction_change_v1() returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'Published prediction evidence cannot be changed or removed'; end $$;
create trigger prediction_plan_immutable before update or delete on public.personal_prediction_plans
for each row execute function private.reject_prediction_change_v1();
create trigger prediction_result_immutable before update or delete on public.personal_prediction_results
for each row execute function private.reject_prediction_change_v1();
create trigger prediction_start_immutable before update or delete on public.personal_prediction_tracking
for each row execute function private.reject_prediction_change_v1();

alter table public.personal_prediction_tracking enable row level security;
alter table public.personal_prediction_plans enable row level security;
alter table public.personal_prediction_results enable row level security;
create policy prediction_tracking_owner on public.personal_prediction_tracking for select to authenticated
using (owner_user_id=(select auth.uid()) and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
create policy prediction_plans_owner on public.personal_prediction_plans for select to authenticated
using (owner_user_id=(select auth.uid()) and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
create policy prediction_results_owner on public.personal_prediction_results for select to authenticated
using (owner_user_id=(select auth.uid()) and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
revoke all on public.personal_prediction_tracking,public.personal_prediction_plans,public.personal_prediction_results from public,anon,authenticated;
grant select on public.personal_prediction_tracking,public.personal_prediction_plans,public.personal_prediction_results to authenticated;

-- Only a permanent signed-in owner can enrol their own watchlist. No supplied user ID.
create function public.start_personal_prediction_tracking_v1() returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
  if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'Sign in to start your personal track record';
  end if;
  insert into public.personal_prediction_tracking(owner_user_id) values(auth.uid()) on conflict do nothing;
end $$;
revoke all on function public.start_personal_prediction_tracking_v1() from public,anon;
grant execute on function public.start_personal_prediction_tracking_v1() to authenticated;

-- No retrospective publication: assessment AND run completion must postdate enrolment.
-- Include all supported ratings; no confidence threshold that hides losing/neutral calls.
create function private.publish_personal_predictions_v1() returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare n integer; now_at timestamptz:=clock_timestamp();
begin
  insert into public.personal_prediction_plans(owner_user_id,assessment_id,instrument_id,symbol,instrument_name,currency,
    published_at,source_cutoff,source_rating,action,horizon_sessions,entry_deadline,thesis,risks,model_identity,
    source_snapshot,benchmark_instrument_id,benchmark_symbol,provider_id)
  select distinct t.owner_user_id,a.assessment_id,i.id,i.symbol,i.instrument_name,trim(i.currency_code),
    now_at,r.analysis_cutoff_time,a.rating,
    case lower(a.rating) when 'buy' then 'BUY' when 'strong buy' then 'BUY' when 'hold' then 'HOLD' else 'AVOID' end,
    h.sessions,now_at+interval '7 days',coalesce(a.summary,''),coalesce(a.key_risks,a.bear_case,''),coalesce(a.model_version,r.model_name,'Unspecified'),
    to_jsonb(a)||jsonb_build_object('run_completed_at',r.completed_at,'analysis_cutoff_time',r.analysis_cutoff_time),
    b.id,b.symbol,dp.id
  from public.personal_prediction_tracking t
  join public.watchlists w on w.owner_user_id=t.owner_user_id
  join public.watchlist_items wi on wi.watchlist_id=w.id
  join public.instruments i on i.id=wi.instrument_id and i.is_active and i.asset_type in ('equity','etf')
  join public.gpt_market_assessments a on a.instrument_id=i.id and a.technical_engine_input_used=false
  join public.gpt_market_runs r on r.run_id=a.run_id
  cross join (values(5),(20)) h(sessions)
  left join lateral (select p.id from public.data_providers p where p.provider_code='tiingo' and p.is_active
    and exists(select 1 from public.provider_instruments pi where pi.provider_id=p.id and pi.instrument_id=i.id and pi.is_active)
    and (select count(*) from public.data_providers p2 join public.provider_instruments pi2 on pi2.provider_id=p2.id
      where p2.provider_code='tiingo' and p2.is_active and pi2.instrument_id=i.id and pi2.is_active)=1) dp on true
  -- QQQ is the available USD comparison, explicitly named rather than labelled the whole market.
  left join lateral (select bi.id,bi.symbol from public.instruments bi where bi.symbol='QQQ' and bi.is_active
    and trim(bi.currency_code)=trim(i.currency_code) and bi.id<>i.id order by bi.id limit 1) b on true
  where r.analysis_mode='scheduled' and r.status in ('succeeded','partial') and r.completed_at between t.started_at and now_at
    and a.created_at between greatest(t.started_at,wi.added_at) and now_at
    and r.analysis_cutoff_time between now_at-interval '24 hours' and now_at
    and r.analysis_cutoff_time<=r.completed_at
    and lower(a.rating) in ('buy','strong buy','hold','sell','strong sell')
    and i.currency_code is not null
  on conflict(owner_user_id,assessment_id,horizon_sessions) do nothing;
  get diagnostics n=row_count;
  return n;
end $$;

-- Daily evidence is date-labelled (UTC midnight), not an executable midnight quote.
-- Restrict to completed dates strictly AFTER publication day. Never use intraday/future bars.
create function private.evaluate_personal_predictions_v1() returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.personal_prediction_plans; en record; ex record; br record;
  now_at timestamptz:=clock_timestamp(); n integer:=0; total integer; gap boolean; evidence jsonb;
begin
  for p in select * from public.personal_prediction_plans where action='BUY' order by published_at loop
    if exists(select 1 from public.personal_prediction_results x where x.prediction_id=p.id and x.status in ('COMPLETE','NOT_ENTERED')) then continue; end if;
    if p.provider_id is null then
      insert into public.personal_prediction_results(prediction_id,owner_user_id,status,reason)
      values(p.id,p.owner_user_id,'INCOMPLETE','Canonical daily-price provider was unavailable at publication.') on conflict do nothing;
      continue;
    end if;
    select mo.id,mo.observed_at,mo.close,mo.adjusted_close into en from public.market_observations mo
    where mo.instrument_id=p.instrument_id and mo.provider_id=p.provider_id and mo.interval_code='1day'
      and mo.observed_at::date>(p.published_at at time zone 'UTC')::date
      and mo.observed_at<date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC'
      and mo.observed_at<=p.entry_deadline and mo.loaded_at<=least(now_at,p.entry_deadline) and mo.close>0
    order by mo.observed_at,mo.id limit 1;
    if en.id is null then
      -- Missing evidence is not proof that an entry condition failed.
      insert into public.personal_prediction_results(prediction_id,owner_user_id,status,reason)
      values(p.id,p.owner_user_id,case when now_at>p.entry_deadline then 'INCOMPLETE' else 'PENDING_ENTRY' end,
        case when now_at>p.entry_deadline then 'Entry window passed without a complete daily price. Outcome is unknown.' else 'Waiting for the next completed daily close.' end) on conflict do nothing;
      continue;
    end if;
    -- Pin the first observed entry once; later price corrections must not change its price or date.
    insert into public.personal_prediction_results(prediction_id,owner_user_id,status,entry_at,entry_price,observations)
    values(p.id,p.owner_user_id,'OPEN',en.observed_at,en.close,jsonb_build_array(to_jsonb(en))) on conflict do nothing;
    select x.entry_at,x.entry_price,x.observations into br from public.personal_prediction_results x where x.prediction_id=p.id and x.status='OPEN';
    if br.entry_at<>en.observed_at or br.entry_price<>en.close then
      insert into public.personal_prediction_results(prediction_id,owner_user_id,status,reason)
      values(p.id,p.owner_user_id,'INCOMPLETE','Entry evidence changed after it was recorded; review required.') on conflict do nothing;
      continue;
    end if;
    select v.* into ex from (
      select distinct on (mo.observed_at::date) mo.id,mo.observed_at,mo.close,mo.adjusted_close
      from public.market_observations mo where mo.instrument_id=p.instrument_id and mo.provider_id=p.provider_id
        and mo.interval_code='1day' and mo.observed_at>en.observed_at and mo.loaded_at<=now_at and mo.close>0
        and mo.observed_at<date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC'
      order by mo.observed_at::date,mo.id
    ) v order by v.observed_at offset (p.horizon_sessions-1) limit 1;
    if ex.id is null then
      if now_at>en.observed_at+make_interval(days=>p.horizon_sessions*2+7) then
        insert into public.personal_prediction_results(prediction_id,owner_user_id,status,reason)
        values(p.id,p.owner_user_id,'INCOMPLETE','Exit prices are overdue; return withheld.') on conflict do nothing;
      end if;
      continue;
    end if;
    -- Compare the session sequence against the fixed benchmark, not just elapsed days.
    -- A missing stock bar must not silently push the exit to a later, favourable day.
    if p.benchmark_instrument_id is null or (select count(distinct bm.observed_at::date)
      from public.market_observations bm where bm.instrument_id=p.benchmark_instrument_id
        and bm.provider_id=p.provider_id and bm.interval_code='1day' and bm.loaded_at<=now_at and bm.close>0
        and bm.observed_at between en.observed_at and ex.observed_at)<>p.horizon_sessions+1 or exists(
      select 1 from public.market_observations bm where bm.instrument_id=p.benchmark_instrument_id
        and bm.provider_id=p.provider_id and bm.interval_code='1day'
        and bm.observed_at between en.observed_at and ex.observed_at and bm.loaded_at<=now_at
        and not exists(select 1 from public.market_observations sm where sm.instrument_id=p.instrument_id
          and sm.provider_id=p.provider_id and sm.interval_code='1day' and sm.observed_at=bm.observed_at and sm.loaded_at<=now_at)
    ) then
      insert into public.personal_prediction_results(prediction_id,owner_user_id,status,reason)
      values(p.id,p.owner_user_id,'INCOMPLETE','Matching market-session evidence is unavailable; return withheld.') on conflict do nothing;
      continue;
    end if;
    -- Refuse suspicious gaps or split-adjustment changes instead of inventing a return.
    select count(*),coalesce(bool_or(d>4),false),jsonb_agg(to_jsonb(q)) into total,gap,evidence from (
      select mo.id,mo.observed_at,mo.close,mo.adjusted_close,
        mo.observed_at::date-lag(mo.observed_at::date) over(order by mo.observed_at,mo.id) d
      from public.market_observations mo where mo.instrument_id=p.instrument_id and mo.provider_id=p.provider_id
        and mo.interval_code='1day' and mo.observed_at between en.observed_at and ex.observed_at and mo.loaded_at<=now_at
    ) q;
    if gap or total<>p.horizon_sessions+1 or en.adjusted_close is null or ex.adjusted_close is null
      or abs(en.adjusted_close/en.close-ex.adjusted_close/ex.close)>0.000001 then
      insert into public.personal_prediction_results(prediction_id,owner_user_id,status,reason)
      values(p.id,p.owner_user_id,'INCOMPLETE','Price gaps, duplicate sessions or corporate actions need review; return withheld.') on conflict do nothing;
      continue;
    end if;
    select min(mo.close) filter(where mo.observed_at=en.observed_at) buy,
      min(mo.close) filter(where mo.observed_at=ex.observed_at) sell,
      count(*) rows_count,
      min(mo.adjusted_close/mo.close) adjustment_min,max(mo.adjusted_close/mo.close) adjustment_max,
      count(mo.adjusted_close) adjusted_count into br
    from public.market_observations mo where mo.instrument_id=p.benchmark_instrument_id and mo.provider_id=p.provider_id
      and mo.interval_code='1day' and mo.observed_at in(en.observed_at,ex.observed_at) and mo.loaded_at<=now_at and mo.close>0;
    insert into public.personal_prediction_results(prediction_id,owner_user_id,status,entry_at,exit_at,entry_price,exit_price,net_return,benchmark_return,reason,observations)
    values(p.id,p.owner_user_id,'COMPLETE',en.observed_at,ex.observed_at,en.close,ex.close,
      (ex.close*(1-p.cost_per_side))/(en.close*(1+p.cost_per_side))-1,
      case when br.rows_count=2 and br.adjusted_count=2 and abs(br.adjustment_max-br.adjustment_min)<=0.000001 then br.sell/br.buy-1 end,
      case when br.rows_count<>2 or br.adjusted_count<>2 or abs(br.adjustment_max-br.adjustment_min)>0.000001 then 'Matching benchmark evidence unavailable; no outperformance claim.' end,evidence)
    on conflict do nothing;
    n:=n+1;
  end loop;
  return n;
end $$;
revoke all on function private.reject_prediction_change_v1(),private.publish_personal_predictions_v1(),private.evaluate_personal_predictions_v1() from public,anon,authenticated;

-- The cron job starts empty. Only authenticated owners explicitly enrolled above participate.
select cron.schedule('personal-prediction-ledger-v1','*/15 * * * *',
  'select private.publish_personal_predictions_v1(); select private.evaluate_personal_predictions_v1();');

