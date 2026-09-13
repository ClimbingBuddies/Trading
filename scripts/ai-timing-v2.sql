-- Additive production migration: ai_selected_prediction_timing_v2.
-- Existing fixed-rule plans/results remain immutable and readable.
alter table public.personal_prediction_plans
  add column entry_delay_sessions integer not null default 1,
  add column holding_sessions integer,
  add column timing_reason text,
  add column input_hash text;
alter table public.personal_prediction_plans drop constraint personal_prediction_plans_entry_rule_check;
alter table public.personal_prediction_plans drop constraint personal_prediction_plans_exit_rule_check;
alter table public.personal_prediction_plans add constraint prediction_timing_rules_v2 check (coalesce(
  (entry_rule='NEXT_COMPLETE_DAILY_CLOSE' and exit_rule='FIXED_SESSION_HORIZON' and holding_sessions is null and entry_delay_sessions=1)
  or (entry_rule='AI_SESSION_OFFSET' and exit_rule='AI_SELECTED_HOLD' and methodology='ai-session-timing-v2'
    and entry_delay_sessions between 1 and 5 and holding_sessions between 1 and horizon_sessions
    and entry_delay_sessions+holding_sessions<=horizon_sessions+1
    and length(trim(timing_reason)) between 20 and 4000 and length(input_hash)=32),false));

-- Stable, cutoff-bound prompt bundle. No technical/convergence/opportunity outputs.
create function private.ai_timing_input_v2(p_owner uuid,p_assessment uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare a record; provider uuid; benchmark uuid; bars jsonb; benchmarks jsonb; result jsonb;
begin
  select ass.*,r.analysis_cutoff_time,r.completed_at,i.symbol,i.instrument_name,trim(i.currency_code) currency
  into a from public.gpt_market_assessments ass join public.gpt_market_runs r on r.run_id=ass.run_id
  join public.instruments i on i.id=ass.instrument_id
  join public.personal_prediction_tracking t on t.owner_user_id=p_owner
  where ass.assessment_id=p_assessment and not ass.technical_engine_input_used
    and i.is_active and i.asset_type in ('equity','etf') and i.currency_code is not null
    and r.analysis_mode='scheduled' and r.status in ('succeeded','partial')
    and r.completed_at between t.started_at and clock_timestamp()
    and r.analysis_cutoff_time between clock_timestamp()-interval '24 hours' and r.completed_at
    and ass.created_at between t.started_at and clock_timestamp()
    and exists(select 1 from public.watchlists w join public.watchlist_items wi on wi.watchlist_id=w.id
      where w.owner_user_id=p_owner and wi.instrument_id=i.id and wi.added_at<=ass.created_at)
    and not exists(select 1 from public.gpt_market_assessments newer join public.gpt_market_runs nr on nr.run_id=newer.run_id
      where newer.instrument_id=i.id and not newer.technical_engine_input_used and newer.created_at>ass.created_at
      and nr.analysis_mode='scheduled' and nr.status in ('succeeded','partial') and nr.completed_at is not null);
  if a.assessment_id is null then raise exception 'Fresh published assessment and eligible owner watchlist required'; end if;
  select dp.id into provider from public.data_providers dp join public.provider_instruments pi on pi.provider_id=dp.id
    where dp.provider_code='tiingo' and dp.is_active and pi.is_active and pi.instrument_id=a.instrument_id;
  if provider is null or (select count(*) from public.data_providers dp join public.provider_instruments pi on pi.provider_id=dp.id
    where dp.provider_code='tiingo' and dp.is_active and pi.is_active and pi.instrument_id=a.instrument_id)<>1 then
    raise exception 'Unique canonical daily-price mapping required'; end if;
  select i.id into benchmark from public.instruments i join public.provider_instruments pi on pi.instrument_id=i.id
    where i.symbol='QQQ' and i.is_active and trim(i.currency_code)=a.currency and i.id<>a.instrument_id
      and pi.provider_id=provider and pi.is_active order by i.id limit 1;
  if benchmark is null then raise exception 'Matching currency benchmark coverage required'; end if;
  select jsonb_agg(to_jsonb(x) order by x.observed_at) into bars from (
    select id,observed_at,loaded_at,close,adjusted_close from public.market_observations
    where instrument_id=a.instrument_id and provider_id=provider and interval_code='1day' and close>0 and adjusted_close>0
      and loaded_at<=a.analysis_cutoff_time and observed_at<date_trunc('day',a.analysis_cutoff_time at time zone 'UTC') at time zone 'UTC'
    order by observed_at desc,id limit 60) x;
  select jsonb_agg(to_jsonb(x) order by x.observed_at) into benchmarks from (
    select id,observed_at,loaded_at,close,adjusted_close from public.market_observations
    where instrument_id=benchmark and provider_id=provider and interval_code='1day' and close>0 and adjusted_close>0
      and loaded_at<=a.analysis_cutoff_time and observed_at<date_trunc('day',a.analysis_cutoff_time at time zone 'UTC') at time zone 'UTC'
    order by observed_at desc,id limit 60) x;
  if coalesce(jsonb_array_length(bars),0)<20 or coalesce(jsonb_array_length(benchmarks),0)<20 then
    raise exception 'At least 20 complete share and benchmark daily observations required'; end if;
  if (bars->-1->>'observed_at')::timestamptz<clock_timestamp()-interval '4 days'
    or (benchmarks->-1->>'observed_at')::timestamptz<clock_timestamp()-interval '4 days' then
    raise exception 'Daily price evidence is stale'; end if;
  if exists(select 1 from jsonb_array_elements(bars) x group by x->>'observed_at' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(benchmarks) x group by x->>'observed_at' having count(*)>1) then
    raise exception 'Duplicate daily observations require review'; end if;
  result:=jsonb_build_object('assessment',to_jsonb(a),'prices',bars,'benchmark_prices',benchmarks,
    'provider_id',provider,'benchmark_instrument_id',benchmark,'benchmark_symbol','QQQ','methodology','ai-session-timing-v2');
  return result;
end $$;

-- Read-only work queue with explicit coverage failures; safe to repeat on every controller invocation.
create function private.ai_timing_candidates_v2() returns table(owner_user_id uuid,assessment_id uuid,horizon_sessions integer,input_hash text,input jsonb,block_reason text)
language plpgsql security definer set search_path=pg_catalog as $$
declare c record; bundle jsonb;
begin
  for c in select distinct t.owner_user_id,a.assessment_id,h.sessions,i.id instrument_id,i.symbol
    from public.personal_prediction_tracking t join public.watchlists w on w.owner_user_id=t.owner_user_id
    join public.watchlist_items wi on wi.watchlist_id=w.id join public.instruments i on i.id=wi.instrument_id
    left join lateral(select ass.assessment_id from public.gpt_market_assessments ass join public.gpt_market_runs r on r.run_id=ass.run_id
      where ass.instrument_id=i.id and not ass.technical_engine_input_used and r.analysis_mode='scheduled'
        and r.status in ('succeeded','partial') and r.completed_at is not null order by ass.created_at desc,ass.assessment_id limit 1) a on true
    cross join (values(5),(20)) h(sessions)
    where not exists(select 1 from public.personal_prediction_plans p where p.owner_user_id=t.owner_user_id
      and p.assessment_id=a.assessment_id and p.horizon_sessions=h.sessions)
  loop
    owner_user_id:=c.owner_user_id; assessment_id:=c.assessment_id; horizon_sessions:=c.sessions;
    input_hash:=null; input:=jsonb_build_object('instrument_id',c.instrument_id,'symbol',c.symbol); block_reason:=null;
    begin
      bundle:=private.ai_timing_input_v2(c.owner_user_id,c.assessment_id);
      input:=bundle; input_hash:=md5(bundle::text);
    exception when others then block_reason:=sqlerrm; end;
    return next;
  end loop;
end $$;

-- Controller supplies model judgement, never publication timestamps or prices.
create function private.publish_ai_timing_v2(p_owner uuid,p_assessment uuid,p_horizon integer,p_action text,
  p_entry_delay integer,p_holding integer,p_thesis text,p_risks text,p_timing_reason text,p_model text,p_input_hash text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare bundle jsonb; existing uuid; ident uuid; pub timestamptz:=clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text||p_assessment::text||p_horizon::text,0));
  select id into existing from public.personal_prediction_plans where owner_user_id=p_owner and assessment_id=p_assessment and horizon_sessions=p_horizon;
  if existing is not null then return existing; end if;
  if p_horizon is null or p_horizon not in (5,20) or p_action is null or p_action not in ('BUY','HOLD','AVOID')
    or p_entry_delay is null or p_entry_delay not between 1 and 5 or p_holding is null or p_holding not between 1 and p_horizon
    or p_entry_delay+p_holding>p_horizon+1 or coalesce(length(trim(p_thesis)),0) not between 20 and 8000
    or coalesce(length(trim(p_risks)),0) not between 20 and 8000 or coalesce(length(trim(p_timing_reason)),0) not between 20 and 4000
    or coalesce(length(trim(p_model)),0) not between 2 and 200 then raise exception 'Invalid AI timing contract'; end if;
  bundle:=private.ai_timing_input_v2(p_owner,p_assessment);
  if p_input_hash is null or p_input_hash<>md5(bundle::text) then raise exception 'Evidence changed; regenerate using current input bundle'; end if;
  insert into public.personal_prediction_plans(owner_user_id,assessment_id,instrument_id,symbol,instrument_name,currency,
    published_at,source_cutoff,source_rating,action,horizon_sessions,entry_rule,exit_rule,entry_deadline,
    thesis,risks,model_identity,source_snapshot,benchmark_instrument_id,benchmark_symbol,provider_id,methodology,
    entry_delay_sessions,holding_sessions,timing_reason,input_hash)
  values(p_owner,p_assessment,(bundle->'assessment'->>'instrument_id')::uuid,bundle->'assessment'->>'symbol',
    bundle->'assessment'->>'instrument_name',bundle->'assessment'->>'currency',pub,
    (bundle->'assessment'->>'analysis_cutoff_time')::timestamptz,bundle->'assessment'->>'rating',p_action,p_horizon,
    'AI_SESSION_OFFSET','AI_SELECTED_HOLD',pub+interval '14 days',p_thesis,p_risks,p_model,bundle,
    (bundle->>'benchmark_instrument_id')::uuid,bundle->>'benchmark_symbol',(bundle->>'provider_id')::uuid,
    'ai-session-timing-v2',p_entry_delay,p_holding,p_timing_reason,p_input_hash) returning id into ident;
  return ident;
end $$;
revoke all on function private.ai_timing_input_v2(uuid,uuid),private.ai_timing_candidates_v2(),
  private.publish_ai_timing_v2(uuid,uuid,integer,text,integer,integer,text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.ai_timing_input_v2(uuid,uuid),private.ai_timing_candidates_v2(),
  private.publish_ai_timing_v2(uuid,uuid,integer,text,integer,integer,text,text,text,text,text) to service_role;
-- Stop automatic fixed-plan publication. Only the controller publishes model-selected plans now.
create or replace function private.publish_personal_predictions_v1() returns integer
language sql security definer set search_path=pg_catalog as $$select 0$$;

create or replace function private.evaluate_personal_predictions_v1() returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.personal_prediction_plans; en record; ex record; br record;
  now_at timestamptz:=clock_timestamp(); n integer:=0; total integer; gap boolean; evidence jsonb; hold_sessions integer; entry_session timestamptz;
begin
  for p in select * from public.personal_prediction_plans where action='BUY' order by published_at loop
    hold_sessions:=coalesce(p.holding_sessions,p.horizon_sessions);
    if exists(select 1 from public.personal_prediction_results x where x.prediction_id=p.id and x.status in ('COMPLETE','NOT_ENTERED')) then continue; end if;
    if p.provider_id is null then
      insert into public.personal_prediction_results(prediction_id,owner_user_id,status,reason)
      values(p.id,p.owner_user_id,'INCOMPLETE','Canonical daily-price provider was unavailable at publication.') on conflict do nothing;
      continue;
    end if;
    if p.entry_rule='AI_SESSION_OFFSET' then
      -- Count benchmark sessions, never shift entry because a stock bar is missing.
      select d.observed_at into entry_session from (
        select distinct mo.observed_at from public.market_observations mo
        where mo.instrument_id=p.benchmark_instrument_id and mo.provider_id=p.provider_id and mo.interval_code='1day'
          and mo.observed_at::date>(p.published_at at time zone 'UTC')::date
          and mo.observed_at<date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC'
          and mo.observed_at<=p.entry_deadline and mo.loaded_at<=least(now_at,p.entry_deadline) and mo.close>0
      ) d order by d.observed_at offset (p.entry_delay_sessions-1) limit 1;
      select mo.id,mo.observed_at,mo.close,mo.adjusted_close into en from public.market_observations mo
        where mo.instrument_id=p.instrument_id and mo.provider_id=p.provider_id and mo.interval_code='1day'
          and mo.observed_at=entry_session and mo.loaded_at<=least(now_at,p.entry_deadline) and mo.close>0
        order by mo.id limit 1;
    else
    select mo.id,mo.observed_at,mo.close,mo.adjusted_close into en from public.market_observations mo
    where mo.instrument_id=p.instrument_id and mo.provider_id=p.provider_id and mo.interval_code='1day'
      and mo.observed_at::date>(p.published_at at time zone 'UTC')::date
      and mo.observed_at<date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC'
      and mo.observed_at<=p.entry_deadline and mo.loaded_at<=least(now_at,p.entry_deadline) and mo.close>0
    order by mo.observed_at,mo.id limit 1;
    end if;
    if en.id is null then
      -- Missing evidence is not proof that an entry condition failed.
      insert into public.personal_prediction_results(prediction_id,owner_user_id,status,reason)
      values(p.id,p.owner_user_id,case when now_at>p.entry_deadline then 'INCOMPLETE' else 'PENDING_ENTRY' end,
        case when now_at>p.entry_deadline then 'Entry window passed without a complete daily price. Outcome is unknown.' else 'Waiting for the published entry session.' end) on conflict do nothing;
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
    select mo.id,mo.observed_at,mo.close,mo.adjusted_close into ex
      from public.market_observations mo
      where mo.instrument_id=p.instrument_id and mo.provider_id=p.provider_id and mo.interval_code='1day' and mo.close>0 and mo.loaded_at<=now_at
      and mo.observed_at=(select d.observed_at from (
        select distinct bm.observed_at from public.market_observations bm
        where bm.instrument_id=p.benchmark_instrument_id and bm.provider_id=p.provider_id and bm.interval_code='1day'
          and bm.observed_at>en.observed_at and bm.loaded_at<=now_at and bm.close>0
          and bm.observed_at<date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC'
      ) d order by d.observed_at offset (hold_sessions-1) limit 1)
      order by mo.id limit 1;
    if ex.id is null then
      if now_at>en.observed_at+make_interval(days=>hold_sessions*2+7) then
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
        and bm.observed_at between en.observed_at and ex.observed_at)<>hold_sessions+1 or exists(
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
    if gap or total<>hold_sessions+1 or en.adjusted_close is null or ex.adjusted_close is null
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

revoke insert,update,delete on public.personal_prediction_plans,public.personal_prediction_results from service_role;