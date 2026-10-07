-- Apply after shared-evaluation-runner.sql and its existing validation migrations.
-- Additive event trials; never changes legacy calls/reviews/outcomes.
begin;
create table private.shared_action_marks (
 event_id uuid not null, horizon integer not null check(horizon in(5,20)), session_id text not null,
 evidence jsonb not null, primary key(event_id,horizon,session_id)
);
create table private.shared_action_trials (
 event_id uuid not null, call_id uuid not null references public.shared_decision_calls(id),
 horizon integer not null check(horizon in(5,20)), status text not null check(status in('pending','blocked','matured')),
 blocker text, result jsonb not null, evaluated_at timestamptz not null,
 primary key(event_id,horizon)
);
alter table private.shared_action_marks enable row level security;
alter table private.shared_action_trials enable row level security;
revoke all on private.shared_action_marks,private.shared_action_trials from public,anon,authenticated,service_role;
create trigger shared_action_marks_immutable before update or delete on private.shared_action_marks
 for each row execute function private.reject_prediction_change_v1();

create function private.shared_action_reference_v1(s jsonb,p_event uuid,p_horizon integer,p_pinned jsonb default '[]') returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare ev jsonb; ses jsonb; pair jsonb; first_pair jsonb; mark jsonb; old jsonb;
 path jsonb:='[]'; sessions jsonb; weight double precision; sr double precision; br double precision;
 peak double precision:=1; dd double precision:=0; val double precision; k text; blocker text;
begin
 perform private.validate_shared_snapshot_v1(s);
 if p_horizon is null or p_horizon not in(5,20) then raise exception 'UNSUPPORTED_HORIZON';end if;
 select e into ev from jsonb_array_elements(jsonb_build_array(s->'call')||(s->'reviews')) e where e->>'id'=p_event::text;
 if ev is null then raise exception 'SAVED_EVENT_REQUIRED';end if;
 weight:=case ev->>'action' when 'BUY' then 1 when 'HOLD' then 1 when 'REDUCE' then 0.5 else 0 end;
 select coalesce(jsonb_agg(v order by ord),'[]') into sessions from
 (select value v,ord from jsonb_array_elements(s#>'{calendar,sessions}') with ordinality t(value,ord)
 where (value->>'opens_at')::timestamptz>(ev->>'published_at')::timestamptz order by ord limit p_horizon+1) q;
 if jsonb_array_length(sessions)=0 then blocker:='CALENDAR_REQUIRED';end if;
 if jsonb_array_length(p_pinned)>0 and p_pinned#>'{0,session}' is distinct from sessions->0 then blocker:='PINNED_CALENDAR_REVISED';end if;
 for ses in select value from jsonb_array_elements(sessions) loop
  exit when blocker is not null;
  exit when (ses->>'closes_at')::timestamptz>(s->>'asOf')::timestamptz;
  pair:=private.shared_reference_pair_v1(s,ses);
  if pair is null then blocker:='MISSING_OR_DUPLICATE_PRICE';exit;end if;
  -- Persist original decimal values, observation IDs, load times, session and config IDs.
  select jsonb_build_object('stock',(select o from jsonb_array_elements(s->'observations') o where o->>'id'=pair#>>'{stock,id}'),
   'benchmark',(select o from jsonb_array_elements(s->'observations') o where o->>'id'=pair#>>'{benchmark,id}')) into pair;
  mark:=jsonb_build_object('session',ses,'pair',pair,'inputVersions',s->'inputVersions');
  select value into old from jsonb_array_elements(p_pinned) where value#>>'{session,id}'=ses->>'id';
  if old is not null and (old->'session' is distinct from mark->'session' or old->'pair' is distinct from mark->'pair'
   or old#>'{inputVersions,stock}' is distinct from mark#>'{inputVersions,stock}'
   or old#>'{inputVersions,benchmark}' is distinct from mark#>'{inputVersions,benchmark}') then blocker:='PINNED_EVIDENCE_REVISED';exit;end if;
  path:=path||jsonb_build_array(coalesce(old,mark));first_pair:=coalesce(first_pair,pair);
  foreach k in array array['stock','benchmark'] loop
   if abs((pair->k->>'adjusted_close')::double precision/(pair->k->>'close')::double precision-
    (first_pair->k->>'adjusted_close')::double precision/(first_pair->k->>'close')::double precision)>1e-6 then blocker:='CORPORATE_ACTION_REQUIRED';end if;
  end loop;
  exit when blocker is not null;
  sr:=(pair#>>'{stock,close}')::double precision*0.999/((first_pair#>>'{stock,close}')::double precision*1.001)-1;
  br:=(pair#>>'{benchmark,close}')::double precision*0.999/((first_pair#>>'{benchmark,close}')::double precision*1.001)-1;
  val:=1+weight*sr;peak:=greatest(peak,val);dd:=least(dd,val/peak-1);
 end loop;
 if blocker is null and exists(select 1 from jsonb_array_elements(p_pinned) p where not exists(select 1 from jsonb_array_elements(path) m where m#>>'{session,id}'=p#>>'{session,id}')) then blocker:='PINNED_CALENDAR_REVISED';end if;
 return jsonb_build_object('status',case when blocker is not null then 'blocked' when jsonb_array_length(path)=p_horizon+1 then 'matured' else 'pending' end,
 'blocker',blocker,'eventId',p_event,'horizon',p_horizon,'weight',weight,'path',path,
 'metrics',case when blocker is null and jsonb_array_length(path)=p_horizon+1 then jsonb_build_object('actionReturn',weight*sr,'stockReturn',sr,'benchmarkReturn',br,'excessStock',weight*sr-sr,'excessBenchmark',weight*sr-br,'maxDrawdown',dd) else null end);
end $$;

create function private.run_shared_action_evaluation_v1() returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare c record; e jsonb; s jsonb; h integer; r jsonb; pins jsonb; m jsonb; reason text; now_at timestamptz:=clock_timestamp();
begin
 if current_setting('transaction_isolation')<>'serializable' then raise exception 'SERIALIZABLE_TRANSACTION_REQUIRED';end if;
 if not exists(select 1 from private.shared_evaluator_release where enabled) then raise exception 'SHARED_EVALUATOR_ADAPTER_NOT_VERIFIED';end if;
 perform pg_advisory_xact_lock(hashtextextended('shared-action-evaluation',0));
 for c in select id,instrument_id from public.shared_decision_calls order by instrument_id,id loop
  perform pg_advisory_xact_lock(hashtextextended('shared-decision:'||c.instrument_id::text,0));
  for e in select to_jsonb(v) from (select id,action,published_at,model_identity from public.shared_decision_calls where id=c.id
   union all select id,action,published_at,model_identity from public.shared_decision_reviews where call_id=c.id) v loop
   foreach h in array array[5,20] loop
    begin
     s:=private.build_shared_evaluation_snapshot_v1(c.id,now_at);
     select coalesce(jsonb_agg(evidence order by (evidence#>>'{session,opens_at}')::timestamptz),'[]') into pins from private.shared_action_marks where event_id=(e->>'id')::uuid and horizon=h;
     r:=private.shared_action_reference_v1(s,(e->>'id')::uuid,h,pins);
     for m in select value from jsonb_array_elements(r->'path') loop
      insert into private.shared_action_marks values((e->>'id')::uuid,h,m#>>'{session,id}',m) on conflict do nothing;
     end loop;
    exception when serialization_failure or deadlock_detected then raise;
    when others then
     reason:=case when SQLSTATE='P0001' and SQLERRM ~ '^[A-Z0-9_]+$' then SQLERRM else 'ACTION_EVALUATION_REQUIRES_REVIEW' end;
     r:=jsonb_build_object('status','blocked','blocker',reason,'metrics',null);
    end;
    -- Results are refreshed only from immutable marks; revision blockers hide prior metrics.
    r:=r||jsonb_build_object('event',e,'callId',c.id);
    insert into private.shared_action_trials values((e->>'id')::uuid,c.id,h,r->>'status',r->>'blocker',r,now_at)
    on conflict(event_id,horizon) do update set status=excluded.status,blocker=excluded.blocker,result=excluded.result,evaluated_at=excluded.evaluated_at;
   end loop;
  end loop;
 end loop;
 return (select jsonb_build_object('events',count(distinct event_id),'matured',count(*) filter(where status='matured'),'pending',count(*) filter(where status='pending'),'blocked',count(*) filter(where status='blocked')) from private.shared_action_trials);
end $$;

create function private.shared_action_read_blocker_v1(p_call uuid,p_event uuid,p_horizon integer) returns text
language plpgsql stable security definer set search_path=pg_catalog as $$
declare s jsonb; pins jsonb; r jsonb;
begin
 s:=private.build_shared_evaluation_snapshot_v1(p_call,statement_timestamp());
 select coalesce(jsonb_agg(evidence order by (evidence#>>'{session,opens_at}')::timestamptz),'[]') into pins
 from private.shared_action_marks where event_id=p_event and horizon=p_horizon;
 r:=private.shared_action_reference_v1(s,p_event,p_horizon,pins);
 if r->>'status'='matured' then return null;end if;
 return coalesce(r->>'blocker','CHECKPOINT_NOT_REACHED');
exception when others then
 return case when SQLSTATE='P0001' and SQLERRM ~ '^[A-Z0-9_]+$' then SQLERRM else 'ACTION_EVIDENCE_UNVERIFIED' end;
end $$;
revoke all on function private.shared_action_read_blocker_v1(uuid,uuid,integer) from public,anon,authenticated,service_role;

create function public.shared_ai_performance_v1(p_scope text default 'all',p_horizon integer default 5) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare user_id uuid:=auth.uid();payload jsonb;
begin
 if user_id is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Permanent sign-in required';end if;
 if p_scope is null or p_scope not in('all','watched') or p_horizon is null or p_horizon not in(5,20) then raise exception 'Invalid filter';end if;
 with events as materialized (
  select c.id event_id,c.id call_id,c.instrument_id,c.action,c.model_identity,c.published_at from public.shared_decision_calls c
  union all select r.id,c.id,c.instrument_id,r.action,r.model_identity,r.published_at from public.shared_decision_reviews r join public.shared_decision_calls c on c.id=r.call_id
 ), cohort as materialized (
  select e.*,i.symbol,case when t.status='matured' and private.shared_action_read_blocker_v1(e.call_id,e.event_id,p_horizon) is not null then 'blocked' else t.status end status,t.result from events e join public.instruments i on i.id=e.instrument_id
  left join private.shared_action_trials t on t.event_id=e.event_id and t.horizon=p_horizon
  where p_scope='all' or exists(select 1 from public.watchlist_items wi join public.watchlists w on w.id=wi.watchlist_id where wi.instrument_id=e.instrument_id and w.owner_user_id=user_id)
 ), measured as materialized (
  select *, (result#>>'{metrics,actionReturn}')::numeric a,(result#>>'{metrics,stockReturn}')::numeric s,
   (result#>>'{metrics,benchmarkReturn}')::numeric b,(result#>>'{metrics,maxDrawdown}')::numeric d
  from cohort where status='matured'
 ), models as (
  select model_identity,count(*) n,avg(a) a,avg(a-b) x,avg((a>b)::integer) beat from measured group by model_identity
 ), actions as (
  select action,count(*) n,avg(a) a,avg(a-s) xs,avg(a-b) xb from measured group by action
 ), recent as (select * from measured order by published_at desc,event_id desc limit 20)
 select jsonb_build_object('contractVersion',1,'methodology','shared-action-trial-v1','generatedAt',clock_timestamp(),'horizon',p_horizon,
  'counts',jsonb_build_object('events',(select count(*) from cohort),'matured',(select count(*) from measured),'pending',(select count(*) from cohort where status is null or status='pending'),'blocked',(select count(*) from cohort where status='blocked')),
  'overall',(select jsonb_build_object('sampleSize',count(*),'meanActionReturn',avg(a)::text,'meanStockReturn',avg(s)::text,'meanBenchmarkReturn',avg(b)::text,'meanExcessStock',avg(a-s)::text,'meanExcessBenchmark',avg(a-b)::text,'benchmarkBeatRate',avg((a>b)::integer)::text,'stockBeatRate',avg((a>s)::integer)::text,'worstActionReturn',min(a)::text,'maxDrawdown',min(d)::text) from measured),
  'byModel',coalesce((select jsonb_agg(jsonb_build_object('modelIdentity',model_identity,'sampleSize',n,'meanActionReturn',a::text,'meanExcessBenchmark',x::text,'benchmarkBeatRate',beat::text) order by model_identity) from models),'[]'),
  'byAction',coalesce((select jsonb_agg(jsonb_build_object('action',action,'sampleSize',n,'meanActionReturn',a::text,'meanExcessStock',xs::text,'meanExcessBenchmark',xb::text) order by action) from actions),'[]'),
  'recent',coalesce((select jsonb_agg(jsonb_build_object('eventId',event_id,'callId',call_id,'symbol',symbol,'action',action,'modelIdentity',model_identity,'publishedAt',published_at,'entryAt',result#>>'{path,0,session,closes_at}','asOf',result#>>array['path',p_horizon::text,'session','closes_at'],'actionReturn',a::text,'stockReturn',s::text,'benchmarkReturn',b::text,'excessStock',(a-s)::text,'excessBenchmark',(a-b)::text,'maxDrawdown',d::text) order by published_at desc,event_id desc) from recent),'[]'),
  'limitations',jsonb_build_array('Overlapping event trials are correlated, not independent observations. Small samples do not establish reliable performance.','BUY/HOLD 100%, REDUCE 50%, WAIT/AVOID/SELL 0% equity; cash earns zero. REDUCE does not represent your holdings.','Entry at first session close whose open is strictly after publication; checkpoints after 5 or 20 further sessions. Equity and both full-exposure comparators include 0.1% costs each side.','Drawdown is the worst marked allocation-trial decline including cash and costs, not a portfolio equity curve.','Missing or revised prices, changed calendar facts/configurations and corporate actions block results; equivalent calendar trust renewals preserve pinned session facts; dividends are not accounted for. Legacy paper cycles use a separate methodology.')) into payload;
 return payload;
end $$;
revoke all on function private.shared_action_reference_v1(jsonb,uuid,integer,jsonb),private.run_shared_action_evaluation_v1() from public,anon,authenticated,service_role;
revoke all on function public.shared_ai_performance_v1(text,integer) from public,anon,service_role;
grant execute on function public.shared_ai_performance_v1(text,integer) to authenticated;
commit;
