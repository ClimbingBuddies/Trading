-- Decision journal v3. Additive: original calls, updates and observations are immutable.
alter table public.personal_prediction_plans drop constraint prediction_timing_rules_v2;
alter table public.personal_prediction_plans add constraint prediction_timing_rules_v3 check(coalesce(
 (entry_rule='NEXT_COMPLETE_DAILY_CLOSE' and exit_rule='FIXED_SESSION_HORIZON' and holding_sessions is null and entry_delay_sessions=1)
 or (entry_rule='AI_SESSION_OFFSET' and exit_rule='AI_SELECTED_HOLD' and methodology='ai-session-timing-v2' and entry_delay_sessions between 1 and 5 and holding_sessions between 1 and horizon_sessions and entry_delay_sessions+holding_sessions<=horizon_sessions+1 and length(trim(timing_reason)) between 20 and 4000 and length(input_hash)=32)
 or (entry_rule='SIGNAL_NEXT_CLOSE' and exit_rule='AI_SELL_SIGNAL' and methodology='decision-journal-v3' and holding_sessions is null and entry_delay_sessions=1 and length(input_hash)=32),false));
create table public.personal_decision_events (
 id uuid primary key default gen_random_uuid(), prediction_id uuid not null, owner_user_id uuid not null,
 actor text not null check(actor in ('AI','USER')), action text not null check(action in ('BUY','WAIT','HOLD','SELL','REDUCE','AVOID','NOTE')),
 published_at timestamptz not null default clock_timestamp(), assessment_id uuid references public.gpt_market_assessments(assessment_id),
 note text not null check(length(trim(note)) between 3 and 12000), risks text, model_identity text, source_cutoff timestamptz,
 source_snapshot jsonb, request_id uuid, input_hash text,
 foreign key(prediction_id,owner_user_id) references public.personal_prediction_plans(id,owner_user_id),
 check(source_cutoff is null or source_cutoff<=published_at),
 check(actor<>'AI' or (assessment_id is not null and model_identity is not null and source_snapshot is not null and input_hash is not null)),
 unique(prediction_id,actor,assessment_id), unique(owner_user_id,request_id)
);
create index decision_events_owner on public.personal_decision_events(owner_user_id,prediction_id,published_at);
create table public.personal_decision_outcomes (
 id uuid primary key default gen_random_uuid(), prediction_id uuid not null, owner_user_id uuid not null,
 kind text not null check(kind in ('ENTRY','EXIT','MARK','CHECKPOINT_5','CHECKPOINT_20','DATA_GAP','CANCELLED')),
 as_of timestamptz not null, recorded_at timestamptz not null default clock_timestamp(),
 event_id uuid references public.personal_decision_events(id), price numeric, net_return numeric, benchmark_return numeric,
 reason text, evidence jsonb not null default '{}',
 foreign key(prediction_id,owner_user_id) references public.personal_prediction_plans(id,owner_user_id),
 unique(prediction_id,kind,as_of), check(price is null or price>0)
);
create unique index decision_once on public.personal_decision_outcomes(prediction_id,kind) where kind in ('ENTRY','EXIT','CHECKPOINT_5','CHECKPOINT_20','CANCELLED');
create index decision_outcomes_owner on public.personal_decision_outcomes(owner_user_id,prediction_id,as_of);
alter table public.personal_decision_events enable row level security;
alter table public.personal_decision_outcomes enable row level security;
create policy decision_events_owner_read on public.personal_decision_events for select to authenticated using(owner_user_id=(select auth.uid()) and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
create policy decision_outcomes_owner_read on public.personal_decision_outcomes for select to authenticated using(owner_user_id=(select auth.uid()) and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false));
revoke all on public.personal_decision_events,public.personal_decision_outcomes from public,anon,authenticated,service_role;
grant select on public.personal_decision_events,public.personal_decision_outcomes to authenticated;
create trigger decision_events_immutable before update or delete on public.personal_decision_events for each row execute function private.reject_prediction_change_v1();
create trigger decision_outcomes_immutable before update or delete on public.personal_decision_outcomes for each row execute function private.reject_prediction_change_v1();
-- Personal notes record the owner's decision separately; never drive the AI performance track.
create function public.append_personal_decision_note_v3(p_prediction uuid,p_action text,p_note text,p_request uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare ident uuid; owner_id uuid:=auth.uid();
begin
 if owner_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Permanent sign-in required'; end if;
 if p_action is null or p_action not in ('BUY','WAIT','HOLD','SELL','REDUCE','NOTE') or coalesce(length(trim(p_note)),0) not between 3 and 12000 or p_request is null then raise exception 'Choose a decision and provide a note'; end if;
 if not exists(select 1 from public.personal_prediction_plans where id=p_prediction and owner_user_id=owner_id) then raise exception 'Decision not found'; end if;
 insert into public.personal_decision_events(prediction_id,owner_user_id,actor,action,note,request_id)
 values(p_prediction,owner_id,'USER',p_action,p_note,p_request) on conflict(owner_user_id,request_id) do nothing returning id into ident;
 if ident is null then select id into ident from public.personal_decision_events where owner_user_id=owner_id and request_id=p_request and prediction_id=p_prediction and actor='USER' and action=p_action and note=p_note; end if;
 if ident is null then raise exception 'Request identifier already used'; end if;
 return ident;
end $$;
revoke all on function public.append_personal_decision_note_v3(uuid,text,text,uuid) from public,anon;
grant execute on function public.append_personal_decision_note_v3(uuid,text,text,uuid) to authenticated;
create function private.decision_input_v3(p_owner uuid,p_assessment uuid) returns jsonb
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
    and (exists(select 1 from public.watchlists w join public.watchlist_items wi on wi.watchlist_id=w.id
      where w.owner_user_id=p_owner and wi.instrument_id=i.id and wi.added_at<=ass.created_at) or exists(select 1 from public.personal_prediction_plans p where p.owner_user_id=p_owner and p.instrument_id=i.id and p.methodology='decision-journal-v3' and not exists(select 1 from public.personal_decision_outcomes o where o.prediction_id=p.id and o.kind in ('EXIT','CANCELLED'))))
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
    'provider_id',provider,'benchmark_instrument_id',benchmark,'benchmark_symbol','QQQ','methodology','decision-journal-v3');
  result:=result||jsonb_build_object('decision_history',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'prediction_id',e.prediction_id,'action',e.action,'published_at',e.published_at,'assessment_id',e.assessment_id,'note',e.note,'risks',e.risks,'model',e.model_identity) order by e.published_at,e.id) from public.personal_decision_events e join public.personal_prediction_plans p on p.id=e.prediction_id where e.owner_user_id=p_owner and p.instrument_id=a.instrument_id and e.actor='AI' and e.published_at<=a.analysis_cutoff_time),'[]'::jsonb));
  result:=result||jsonb_build_object('position_history',coalesce((select jsonb_agg(jsonb_build_object('prediction_id',o.prediction_id,'kind',o.kind,'as_of',o.as_of,'recorded_at',o.recorded_at,'price',o.price,'reason',o.reason) order by o.recorded_at) from public.personal_decision_outcomes o join public.personal_prediction_plans p on p.id=o.prediction_id where o.owner_user_id=p_owner and p.instrument_id=a.instrument_id and o.kind in ('ENTRY','EXIT','CANCELLED','DATA_GAP') and o.recorded_at<=a.analysis_cutoff_time),'[]'::jsonb));
  return result;
end $$;



create function private.publish_decision_v3(p_owner uuid,p_assessment uuid,p_action text,p_thesis text,p_risks text,p_model text,p_input_hash text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare bundle jsonb; ident uuid; instrument uuid; pub timestamptz:=clock_timestamp(); existing uuid;
begin
 if p_action is null or p_action not in ('BUY','WAIT','HOLD','SELL','REDUCE','AVOID') or coalesce(length(trim(p_thesis)),0) not between 20 and 8000
 or coalesce(length(trim(p_risks)),0) not between 20 and 8000 or coalesce(length(trim(p_model)),0) not between 2 and 200 then raise exception 'Invalid decision contract'; end if;
 select instrument_id into instrument from public.gpt_market_assessments where assessment_id=p_assessment;
 if instrument is null then raise exception 'Assessment not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||instrument::text,0));
 select e.prediction_id into existing from public.personal_decision_events e where e.owner_user_id=p_owner and e.assessment_id=p_assessment and e.actor='AI' limit 1;
 if existing is not null then return existing; end if;
 bundle:=private.decision_input_v3(p_owner,p_assessment);
 if p_input_hash is null or p_input_hash<>md5(bundle::text) then raise exception 'Evidence changed; regenerate decision'; end if;
 select p.id into ident from public.personal_prediction_plans p
 where p.owner_user_id=p_owner and p.instrument_id=instrument and p.methodology='decision-journal-v3'
 and not exists(select 1 from public.personal_decision_outcomes o where o.prediction_id=p.id and o.kind in ('EXIT','CANCELLED'))
 order by p.published_at desc limit 1;
 if ident is not null and exists(select 1 from public.personal_decision_events e where e.prediction_id=ident and e.actor='AI' and e.source_cutoff>=(bundle->'assessment'->>'analysis_cutoff_time')::timestamptz) then raise exception 'Update must use newer evidence'; end if;
 if ident is null then
  insert into public.personal_prediction_plans(owner_user_id,assessment_id,instrument_id,symbol,instrument_name,currency,published_at,source_cutoff,source_rating,action,horizon_sessions,entry_rule,exit_rule,entry_deadline,thesis,risks,model_identity,source_snapshot,benchmark_instrument_id,benchmark_symbol,provider_id,methodology,entry_delay_sessions,holding_sessions,timing_reason,input_hash)
  values(p_owner,p_assessment,instrument,bundle->'assessment'->>'symbol',bundle->'assessment'->>'instrument_name',bundle->'assessment'->>'currency',
  pub,(bundle->'assessment'->>'analysis_cutoff_time')::timestamptz,bundle->'assessment'->>'rating',
  case when p_action='BUY' then 'BUY' when p_action in ('SELL','AVOID','REDUCE') then 'AVOID' else 'HOLD' end,20,'SIGNAL_NEXT_CLOSE','AI_SELL_SIGNAL',pub+interval '14 days',
  p_thesis,p_risks,p_model,bundle,(bundle->>'benchmark_instrument_id')::uuid,bundle->>'benchmark_symbol',(bundle->>'provider_id')::uuid,
  'decision-journal-v3',1,null,null,p_input_hash) returning id into ident;
 end if;
 insert into public.personal_decision_events(prediction_id,owner_user_id,actor,action,published_at,assessment_id,note,risks,model_identity,source_cutoff,source_snapshot,input_hash)
 values(ident,p_owner,'AI',p_action,pub,p_assessment,p_thesis,p_risks,p_model,(bundle->'assessment'->>'analysis_cutoff_time')::timestamptz,bundle,p_input_hash);
 return ident;
end $$;

create function private.decision_candidates_v3() returns table(owner_user_id uuid,instrument_id uuid,symbol text,prediction_id uuid,assessment_id uuid,input_hash text,input jsonb,block_reason text)
language plpgsql security definer set search_path=pg_catalog as $$
declare c record; bundle jsonb;
begin
 for c in
 with universe as (
 select distinct w.owner_user_id,wi.instrument_id from public.watchlists w join public.watchlist_items wi on wi.watchlist_id=w.id join public.personal_prediction_tracking t on t.owner_user_id=w.owner_user_id
 union select p.owner_user_id,p.instrument_id from public.personal_prediction_plans p where p.methodology='decision-journal-v3'
 and not exists(select 1 from public.personal_decision_outcomes o where o.prediction_id=p.id and o.kind in ('EXIT','CANCELLED')))
 select u.*,i.symbol,a.assessment_id,p.id prediction_id from universe u join public.instruments i on i.id=u.instrument_id
 left join lateral(select ass.assessment_id from public.gpt_market_assessments ass join public.gpt_market_runs r on r.run_id=ass.run_id
 where ass.instrument_id=u.instrument_id and not ass.technical_engine_input_used and r.analysis_mode='scheduled' and r.status in ('succeeded','partial') and r.completed_at is not null order by ass.created_at desc,ass.assessment_id limit 1)a on true
 left join lateral(select p.id from public.personal_prediction_plans p where p.owner_user_id=u.owner_user_id and p.instrument_id=u.instrument_id and p.methodology='decision-journal-v3'
 and not exists(select 1 from public.personal_decision_outcomes o where o.prediction_id=p.id and o.kind in ('EXIT','CANCELLED')) order by p.published_at desc limit 1)p on true
 where not exists(select 1 from public.personal_decision_events e where e.owner_user_id=u.owner_user_id and e.assessment_id=a.assessment_id and e.actor='AI')
 loop
 owner_user_id:=c.owner_user_id; instrument_id:=c.instrument_id; symbol:=c.symbol; prediction_id:=c.prediction_id; assessment_id:=c.assessment_id;
 input_hash:=null; input:=null; block_reason:=null;
 begin bundle:=private.decision_input_v3(c.owner_user_id,c.assessment_id); input:=bundle; input_hash:=md5(bundle::text);
 exception when others then block_reason:=sqlerrm; end;
 return next;
 end loop;
end $$;
revoke all on function private.decision_input_v3(uuid,uuid),private.publish_decision_v3(uuid,uuid,text,text,text,text,text),private.decision_candidates_v3() from public,anon,authenticated,service_role;

-- Return measurements only when both complete tapes match and pinned entry prices remain unchanged.
create function private.measure_decision_v3(p public.personal_prediction_plans,en public.personal_decision_outcomes,p_at timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare tape jsonb; end_price numeric; benchmark_end numeric; n integer; bad boolean; actual_entry numeric; entry_adjust numeric; benchmark_entry numeric;
begin
 select count(*),coalesce(bool_or(x.bad),true),jsonb_agg(to_jsonb(x) order by x.observed_at),
 max(x.stock_close) filter(where x.observed_at=p_at),max(x.bench_close) filter(where x.observed_at=p_at),
 max(x.stock_close) filter(where x.observed_at=en.as_of),max(x.stock_adjust) filter(where x.observed_at=en.as_of),
 max(x.bench_close) filter(where x.observed_at=en.as_of)
 into n,bad,tape,end_price,benchmark_end,actual_entry,entry_adjust,benchmark_entry
 from (
 select b.id benchmark_id,b.observed_at,b.close bench_close,s.id stock_id,s.close stock_close,s.adjusted_close stock_adjust,
  (s.id is null or s.close is null or s.close<=0 or b.close is null or b.close<=0 or s.adjusted_close is null or b.adjusted_close is null
   or abs(s.adjusted_close/nullif(s.close,0)-(en.evidence->>'stock_ratio')::numeric)>0.000001
   or abs(b.adjusted_close/nullif(b.close,0)-(en.evidence->>'benchmark_ratio')::numeric)>0.000001
   or (b.observed_at at time zone 'UTC')::date-lag((b.observed_at at time zone 'UTC')::date) over(order by b.observed_at)>4) bad
 from public.market_observations b left join public.market_observations s on s.instrument_id=p.instrument_id and s.provider_id=p.provider_id and s.interval_code='1day' and s.observed_at=b.observed_at and s.loaded_at<=clock_timestamp()
 where b.instrument_id=p.benchmark_instrument_id and b.provider_id=p.provider_id and b.interval_code='1day'
 and b.observed_at between en.as_of and p_at and b.loaded_at<=clock_timestamp())x;
 if bad or n=0 or end_price is null or actual_entry is distinct from en.price or benchmark_entry is distinct from (en.evidence->>'benchmark_price')::numeric
 or n<>(select count(distinct b.observed_at) from public.market_observations b where b.instrument_id=p.benchmark_instrument_id and b.provider_id=p.provider_id and b.interval_code='1day' and b.observed_at between en.as_of and p_at and b.loaded_at<=clock_timestamp())
 or n<>(select count(*) from public.market_observations s where s.instrument_id=p.instrument_id and s.provider_id=p.provider_id and s.interval_code='1day' and s.observed_at between en.as_of and p_at and s.loaded_at<=clock_timestamp()) then return null; end if;
 return jsonb_build_object('price',end_price,'net_return',end_price*(1-p.cost_per_side)/(en.price*(1+p.cost_per_side))-1,
 'benchmark_return',benchmark_end/benchmark_entry-1,'observations',tape);
end $$;

create function private.evaluate_decisions_v3() returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.personal_prediction_plans; buy public.personal_decision_events; sell public.personal_decision_events; en public.personal_decision_outcomes;
 session_at timestamptz; exit_at timestamptz; last_at timestamptz; bar record; measure jsonb; target record; n integer:=0; now_at timestamptz:=clock_timestamp();
begin
 for p in select * from public.personal_prediction_plans where methodology='decision-journal-v3' order by published_at loop
 perform pg_advisory_xact_lock(hashtextextended(p.owner_user_id::text||p.instrument_id::text,0));
 if exists(select 1 from public.personal_decision_outcomes where prediction_id=p.id and kind in ('EXIT','CANCELLED')) then continue; end if;
 select * into buy from public.personal_decision_events where prediction_id=p.id and actor='AI' and action='BUY' order by published_at,id limit 1;
 if buy.id is null then continue; end if;
 select * into sell from public.personal_decision_events where prediction_id=p.id and actor='AI' and action='SELL' and published_at>buy.published_at order by published_at,id limit 1;
 select * into en from public.personal_decision_outcomes where prediction_id=p.id and kind='ENTRY';
 if en.id is null then
  select min(observed_at) into session_at from public.market_observations where instrument_id=p.benchmark_instrument_id and provider_id=p.provider_id and interval_code='1day'
   and (observed_at at time zone 'UTC')::date>(buy.published_at at time zone 'UTC')::date and observed_at<date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC'
   and observed_at<=buy.published_at+interval '14 days' and loaded_at<=least(now_at,buy.published_at+interval '14 days') and close>0;
  if sell.id is not null and ((sell.published_at at time zone 'UTC')::date=(buy.published_at at time zone 'UTC')::date or (session_at is not null and (sell.published_at at time zone 'UTC')::date<=(session_at at time zone 'UTC')::date)) then
   insert into public.personal_decision_outcomes(prediction_id,owner_user_id,kind,as_of,event_id,reason)
   values(p.id,p.owner_user_id,'CANCELLED',sell.published_at,sell.id,'Sell call arrived before a verifiable entry; no trade assumed.') on conflict do nothing;
   continue;
  end if;
  select s.id,s.close,s.adjusted_close,b.id benchmark_id,b.close benchmark_close,b.adjusted_close benchmark_adjusted into bar
   from public.market_observations s join public.market_observations b on b.instrument_id=p.benchmark_instrument_id and b.provider_id=p.provider_id and b.interval_code='1day' and b.observed_at=s.observed_at
   where s.instrument_id=p.instrument_id and s.provider_id=p.provider_id and s.interval_code='1day' and s.observed_at=session_at
   and s.loaded_at<=least(now_at,buy.published_at+interval '14 days') and b.loaded_at<=least(now_at,buy.published_at+interval '14 days')
   and s.close>0 and s.adjusted_close>0 and b.close>0 and b.adjusted_close>0;
  if bar.id is null or (select count(*) from public.market_observations where instrument_id=p.instrument_id and provider_id=p.provider_id and interval_code='1day' and observed_at=session_at and loaded_at<=least(now_at,buy.published_at+interval '14 days'))<>1 or (select count(*) from public.market_observations where instrument_id=p.benchmark_instrument_id and provider_id=p.provider_id and interval_code='1day' and observed_at=session_at and loaded_at<=least(now_at,buy.published_at+interval '14 days'))<>1 then
   if session_at is not null or now_at>buy.published_at+interval '14 days' then
    insert into public.personal_decision_outcomes(prediction_id,owner_user_id,kind,as_of,event_id,reason)
    values(p.id,p.owner_user_id,'DATA_GAP',coalesce(session_at,date_trunc('day',now_at)),buy.id,'Intended entry evidence missing; entry is not moved to a later session.') on conflict do nothing;
   end if;
   continue;
  end if;
  insert into public.personal_decision_outcomes(prediction_id,owner_user_id,kind,as_of,event_id,price,evidence)
  values(p.id,p.owner_user_id,'ENTRY',session_at,buy.id,bar.close,jsonb_build_object('stock_id',bar.id,'stock_ratio',bar.adjusted_close/bar.close,'benchmark_id',bar.benchmark_id,'benchmark_price',bar.benchmark_close,'benchmark_ratio',bar.benchmark_adjusted/bar.benchmark_close)) on conflict do nothing;
  select * into en from public.personal_decision_outcomes where prediction_id=p.id and kind='ENTRY';
 end if;
 exit_at:=null;
 if sell.id is not null then
  select min(observed_at) into exit_at from public.market_observations where instrument_id=p.benchmark_instrument_id and provider_id=p.provider_id and interval_code='1day'
   and (observed_at at time zone 'UTC')::date>(sell.published_at at time zone 'UTC')::date and observed_at>en.as_of
   and observed_at<date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC' and loaded_at<=now_at and close>0;
 end if;
 select max(observed_at) into last_at from public.market_observations where instrument_id=p.benchmark_instrument_id and provider_id=p.provider_id and interval_code='1day'
  and observed_at>=en.as_of and observed_at<=coalesce(exit_at,now_at) and observed_at<date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC' and loaded_at<=now_at and close>0;
 for target in
  select 'MARK'::text kind,last_at at_time
  union all select 'EXIT',exit_at where exit_at is not null
  union all select 'CHECKPOINT_'||h.n,d.observed_at from (values(5),(20))h(n) cross join lateral (
   select distinct observed_at from public.market_observations where instrument_id=p.benchmark_instrument_id and provider_id=p.provider_id and interval_code='1day'
   and observed_at>en.as_of and observed_at<=coalesce(exit_at,now_at) and observed_at<date_trunc('day',now_at at time zone 'UTC') at time zone 'UTC' and loaded_at<=now_at and close>0
   order by observed_at offset h.n-1 limit 1)d
 loop
  if target.at_time is null then continue; end if;
  measure:=private.measure_decision_v3(p,en,target.at_time);
  if measure is null then
   insert into public.personal_decision_outcomes(prediction_id,owner_user_id,kind,as_of,reason) values(p.id,p.owner_user_id,'DATA_GAP',target.at_time,'Missing, revised, duplicate or corporate-action price evidence; return withheld.') on conflict do nothing;
  else
   insert into public.personal_decision_outcomes(prediction_id,owner_user_id,kind,as_of,event_id,price,net_return,benchmark_return,evidence)
   values(p.id,p.owner_user_id,target.kind,target.at_time,case when target.kind='EXIT' then sell.id else buy.id end,(measure->>'price')::numeric,(measure->>'net_return')::numeric,(measure->>'benchmark_return')::numeric,measure) on conflict do nothing;
   n:=n+1;
  end if;
 end loop;
 end loop;
 return n;
end $$;
revoke all on function private.measure_decision_v3(public.personal_prediction_plans,public.personal_decision_outcomes,timestamptz),private.evaluate_decisions_v3() from public,anon,authenticated,service_role;
create or replace function private.evaluate_personal_predictions_v1() returns integer
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.personal_prediction_plans; en record; ex record; br record;
  now_at timestamptz:=clock_timestamp(); n integer:=0; total integer; gap boolean; evidence jsonb; hold_sessions integer; entry_session timestamptz;
begin
  for p in select * from public.personal_prediction_plans where action='BUY' and methodology<>'decision-journal-v3' order by published_at loop
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
          and (mo.observed_at at time zone 'UTC')::date>(p.published_at at time zone 'UTC')::date
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
      and (mo.observed_at at time zone 'UTC')::date>(p.published_at at time zone 'UTC')::date
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
    if p.benchmark_instrument_id is null or (select count(distinct (bm.observed_at at time zone 'UTC')::date)
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
        (mo.observed_at at time zone 'UTC')::date-lag((mo.observed_at at time zone 'UTC')::date) over(order by mo.observed_at,mo.id) d
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


create or replace function private.publish_ai_timing_v2(p_owner uuid,p_assessment uuid,p_horizon integer,p_action text,
 p_entry_delay integer,p_holding integer,p_thesis text,p_risks text,p_timing_reason text,p_model text,p_input_hash text)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
begin raise exception 'Timing v2 publication retired; use private.publish_decision_v3'; end $$;
select cron.schedule('personal-prediction-ledger-v1','*/15 * * * *',
 'select private.evaluate_personal_predictions_v1(); select private.evaluate_decisions_v3();');

-- Recommendations can show the newest event without overwriting the original Decision Lab call.
create view public.personal_recommendation_views_v3 with(security_invoker=true) as
select p.id,p.owner_user_id,p.instrument_id,p.assessment_id,p.horizon_sessions,p.published_at,p.entry_deadline,p.action,p.thesis,p.risks,p.source_cutoff,p.entry_rule,p.entry_delay_sessions,p.holding_sessions,p.timing_reason,p.model_identity
from public.personal_prediction_plans p where p.methodology<>'decision-journal-v3'
union all
select e.id,e.owner_user_id,p.instrument_id,e.assessment_id,h.n,e.published_at,e.published_at+interval '14 days',e.action,e.note,coalesce(e.risks,''),e.source_cutoff,p.entry_rule,1,null::integer,null::text,e.model_identity
from public.personal_decision_events e join public.personal_prediction_plans p on p.id=e.prediction_id and p.owner_user_id=e.owner_user_id
cross join (values(5),(20))h(n) where e.actor='AI' and p.methodology='decision-journal-v3';
revoke all on public.personal_recommendation_views_v3 from public,anon,authenticated;
grant select on public.personal_recommendation_views_v3 to authenticated;
