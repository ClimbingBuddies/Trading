-- Independent SQL reference for the deterministic Node paper engine. No writes.
begin;
create or replace function private.shared_reference_add_v1(p_outcomes jsonb,p_value jsonb,p_asof text) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare k text:=p_value->>'kind'; key_text text:=k||':'||(p_value->>'sessionId');
begin
 if exists(select 1 from jsonb_array_elements(p_outcomes) o where o->>'key'=key_text
 or (k in('ENTRY','EXIT','CANCELLED','CHECKPOINT_5','CHECKPOINT_20') and o->>'kind'=k)) then return p_outcomes; end if;
 return p_outcomes||jsonb_build_array(p_value||jsonb_build_object('key',key_text,'recordedAt',p_asof));
end $$;
create or replace function private.shared_reference_pair_v1(p_snapshot jsonb,p_session jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare stock jsonb; benchmark jsonb; stock_count int; benchmark_count int; mapped jsonb; row_value jsonb;
begin
 select count(*),jsonb_agg(o)->0 into stock_count,stock from jsonb_array_elements(p_snapshot->'observations') o
 where o->>'instrument_id'=p_snapshot#>>'{call,instrument_id}' and o->>'provider_id'=p_snapshot#>>'{call,provider_id}'
 and o->>'session_id'=p_session->>'id' and (o->>'loaded_at')::timestamptz<=(p_snapshot->>'asOf')::timestamptz;
 select count(*),jsonb_agg(o)->0 into benchmark_count,benchmark from jsonb_array_elements(p_snapshot->'observations') o
 where o->>'instrument_id'=p_snapshot#>>'{call,benchmark_instrument_id}' and o->>'provider_id'=p_snapshot#>>'{call,provider_id}'
 and o->>'session_id'=p_session->>'id' and (o->>'loaded_at')::timestamptz<=(p_snapshot->>'asOf')::timestamptz;
 if stock_count<>1 or benchmark_count<>1 then return null; end if;
 mapped:='[]'::jsonb;
 for row_value in select value from jsonb_array_elements(jsonb_build_array(stock,benchmark)) loop
  if row_value->>'currency' is distinct from p_snapshot#>>'{call,currency}'
   or row_value->>'close' is null or row_value->>'adjusted_close' is null
   or (row_value->>'close')::double precision<=0 or (row_value->>'adjusted_close')::double precision<=0
   or (row_value->>'close') in('NaN','Infinity','-Infinity') or (row_value->>'adjusted_close') in('NaN','Infinity','-Infinity')
   or (row_value->>'loaded_at')::timestamptz<(p_session->>'closes_at')::timestamptz then return null; end if;
  mapped:=mapped||jsonb_build_array(jsonb_build_object('id',row_value->>'id','instrument',row_value->>'instrument_id',
   'provider',row_value->>'provider_id','sessionId',row_value->>'session_id','currency',row_value->>'currency',
   'close',(row_value->>'close')::double precision,'adjustedClose',(row_value->>'adjusted_close')::double precision,
   'loadedAt',row_value->>'loaded_at'));
 end loop;
 return jsonb_build_object('stock',mapped->0,'benchmark',mapped->1);
end $$;
create or replace function private.shared_paper_reference_v1(p_snapshot jsonb) returns jsonb
language plpgsql immutable set search_path=pg_catalog as $$
declare
 outcomes jsonb; initial_count int; added jsonb; events jsonb; sessions jsonb; now_at timestamptz:=(p_snapshot->>'asOf')::timestamptz;
 asof_text text:=p_snapshot->>'asOf'; done jsonb; buy jsonb; sell jsonb; entry_session jsonb; exit_session jsonb; entry jsonb;
 current_entry jsonb; evidence jsonb; pinned jsonb; measured jsonb; s jsonb; row_value jsonb;
 blocked boolean:=false; state_text text; idx int:=-1; cost double precision:=(p_snapshot#>>'{call,cost_per_side}')::double precision;
 stock_ratio double precision; benchmark_ratio double precision;
begin
 -- Input contract and chronology are separately validated by the trusted snapshot/writer.
 select coalesce(jsonb_agg(o->'evidence'->'engine' order by ord),'[]'::jsonb) into outcomes
 from jsonb_array_elements(p_snapshot->'outcomes') with ordinality t(o,ord);
 initial_count:=jsonb_array_length(outcomes);
 select coalesce(jsonb_agg(ses.value order by (ses.value->>'opens_at')::timestamptz),'[]'::jsonb) into sessions from jsonb_array_elements(p_snapshot#>'{calendar,sessions}') as ses(value);
 events:=jsonb_build_array(p_snapshot->'call')||coalesce(p_snapshot->'reviews','[]'::jsonb);
 select o into done from jsonb_array_elements(outcomes) o where o->>'kind' in('EXIT','CANCELLED') limit 1;
 if done is not null then
  state_text:=case when done->>'kind'='EXIT' then 'Closed' else 'Not entered' end;
 else
  select e into buy from jsonb_array_elements(events) with ordinality t(e,ord)
   where e->>'action'='BUY' and (e->>'published_at')::timestamptz<=now_at order by ord limit 1;
  if buy is null then state_text:='Watching';
  else
   select value into entry_session from jsonb_array_elements(sessions) where (value->>'opens_at')::timestamptz>(buy->>'published_at')::timestamptz order by (value->>'opens_at')::timestamptz limit 1;
   if entry_session is null then state_text:='Calendar required';
   else
    select o into entry from jsonb_array_elements(outcomes) o where o->>'kind'='ENTRY' limit 1;
    if entry is not null and (entry->>'sessionId'<>entry_session->>'id' or entry->>'asOf'<>entry_session->>'closes_at') then raise exception 'Calendar conflicts with pinned entry'; end if;
    select e into sell from jsonb_array_elements(events) with ordinality t(e,ord)
     where e->>'action'='SELL' and (e->>'published_at')::timestamptz>(buy->>'published_at')::timestamptz and (e->>'published_at')::timestamptz<=now_at order by ord limit 1;
    if sell is not null and (sell->>'published_at')::timestamptz<(entry_session->>'opens_at')::timestamptz then
     if entry is not null then raise exception 'Cancellation conflicts with pinned entry'; end if;
     outcomes:=private.shared_reference_add_v1(outcomes,jsonb_build_object('kind','CANCELLED','sessionId',entry_session->>'id','asOf',sell->>'published_at','eventId',sell->>'id','reason','Buy withdrawn before intended entry session opened'),asof_text);
     state_text:='Not entered';
    elsif (entry_session->>'closes_at')::timestamptz>now_at then state_text:='Awaiting entry';
    else
     current_entry:=private.shared_reference_pair_v1(p_snapshot,entry_session);
     if current_entry is null then
      outcomes:=private.shared_reference_add_v1(outcomes,jsonb_build_object('kind','DATA_GAP','sessionId',entry_session->>'id','asOf',entry_session->>'closes_at','reason','Intended entry price or benchmark missing/invalid; entry not shifted'),asof_text);blocked:=true;
     elsif entry is not null and entry->'evidence' is distinct from current_entry then
      outcomes:=private.shared_reference_add_v1(outcomes,jsonb_build_object('kind','DATA_GAP','sessionId',entry_session->>'id','asOf',entry_session->>'closes_at','reason','Pinned entry evidence changed; return withheld'),asof_text);blocked:=true;
     elsif entry is null then
      outcomes:=private.shared_reference_add_v1(outcomes,jsonb_build_object('kind','ENTRY','sessionId',entry_session->>'id','asOf',entry_session->>'closes_at','eventId',buy->>'id','price',current_entry#>'{stock,close}','evidence',current_entry),asof_text);
      entry:=outcomes->(jsonb_array_length(outcomes)-1);
     end if;
     if not blocked then
      if sell is not null then
       select value into exit_session from jsonb_array_elements(sessions) where (value->>'opens_at')::timestamptz>(sell->>'published_at')::timestamptz order by (value->>'opens_at')::timestamptz limit 1;
      end if;
      if sell is not null and exit_session is null then state_text:='Calendar required';
      else
       for s in select value from jsonb_array_elements(sessions)
        where (value->>'opens_at')::timestamptz>=(entry_session->>'opens_at')::timestamptz
         and (value->>'closes_at')::timestamptz<=now_at
         and (exit_session is null or (value->>'opens_at')::timestamptz<=(exit_session->>'opens_at')::timestamptz)
        order by (value->>'opens_at')::timestamptz loop
        idx:=idx+1;evidence:=private.shared_reference_pair_v1(p_snapshot,s);
        if evidence is null then
         outcomes:=private.shared_reference_add_v1(outcomes,jsonb_build_object('kind','DATA_GAP','sessionId',s->>'id','asOf',s->>'closes_at','reason','Missing or duplicate session prices; return withheld'),asof_text);blocked:=true;exit;
        end if;
        select o into pinned from jsonb_array_elements(outcomes) o where o->>'kind'='MARK' and o->>'sessionId'=s->>'id' limit 1;
        if pinned is not null and pinned->'evidence' is distinct from evidence then
         outcomes:=private.shared_reference_add_v1(outcomes,jsonb_build_object('kind','DATA_GAP','sessionId',s->>'id','asOf',s->>'closes_at','reason','Previously measured price evidence changed; return withheld'),asof_text);blocked:=true;exit;
        end if;
        stock_ratio:=(evidence#>>'{stock,adjustedClose}')::double precision/(evidence#>>'{stock,close}')::double precision;
        benchmark_ratio:=(evidence#>>'{benchmark,adjustedClose}')::double precision/(evidence#>>'{benchmark,close}')::double precision;
        if abs(stock_ratio-(entry#>>'{evidence,stock,adjustedClose}')::double precision/(entry->>'price')::double precision)>1e-6
         or abs(benchmark_ratio-(entry#>>'{evidence,benchmark,adjustedClose}')::double precision/(entry#>>'{evidence,benchmark,close}')::double precision)>1e-6 then
         outcomes:=private.shared_reference_add_v1(outcomes,jsonb_build_object('kind','DATA_GAP','sessionId',s->>'id','asOf',s->>'closes_at','reason','Corporate-action adjustment changed; return withheld'),asof_text);blocked:=true;exit;
        end if;
        measured:=jsonb_build_object('sessionId',s->>'id','asOf',s->>'closes_at','price',evidence#>'{stock,close}',
         'netReturn',(evidence#>>'{stock,close}')::double precision*(1-cost)/((entry->>'price')::double precision*(1+cost))-1,
         'benchmarkReturn',(evidence#>>'{benchmark,close}')::double precision/(entry#>>'{evidence,benchmark,close}')::double precision-1,'evidence',evidence);
        outcomes:=private.shared_reference_add_v1(outcomes,measured||jsonb_build_object('kind','MARK'),asof_text);
        if idx in(5,20) then outcomes:=private.shared_reference_add_v1(outcomes,measured||jsonb_build_object('kind','CHECKPOINT_'||idx::text),asof_text);end if;
        if exit_session->>'id'=s->>'id' then
         outcomes:=private.shared_reference_add_v1(outcomes,measured||jsonb_build_object('kind','EXIT','eventId',sell->>'id'),asof_text);exit;
        end if;
       end loop;
      end if;
     end if;
     if state_text is null then
      state_text:=case when blocked then 'Missing data' when exists(select 1 from jsonb_array_elements(outcomes) o where o->>'kind'='EXIT') then 'Closed' when sell is not null then 'Exit signal' else 'Open' end;
     end if;
    end if;
   end if;
  end if;
 end if;
 select coalesce(jsonb_agg(value order by ord),'[]'::jsonb) into added from jsonb_array_elements(outcomes) with ordinality t(value,ord) where ord>initial_count;
 return jsonb_build_object('state',state_text,'added',added);
end $$;
revoke all on function private.shared_reference_add_v1(jsonb,jsonb,text),private.shared_reference_pair_v1(jsonb,jsonb),private.shared_paper_reference_v1(jsonb) from public,anon,authenticated,service_role;
commit;
