-- Pure reference fixtures and permission assertions, always rollback. No fake calls.
begin;
do $$
declare s jsonb; sessions jsonb; observations jsonb; r jsonb; pins jsonb; a text; w double precision; sr double precision; original jsonb; rejected boolean;
 stock text:='00000000-0000-4000-8000-000000000002';bench text:='00000000-0000-4000-8000-000000000003';provider text:='00000000-0000-4000-8000-000000000004';eid uuid:='00000000-0000-4000-8000-000000000001';
begin
 select jsonb_agg(jsonb_build_object('id',to_char(d,'DD'),'opens_at',to_char(d,'YYYY-MM-DD')||'T09:00:00Z','closes_at',to_char(d,'YYYY-MM-DD')||'T16:00:00Z') order by d)
 into sessions from generate_series('2026-09-02'::timestamp,'2026-09-23','1 day') d;
 select jsonb_agg(jsonb_build_object('id',(20+2*(ord-1)+j)::text,'instrument_id',case j when 0 then stock else bench end,
  'provider_id',provider,'currency','USD','interval_code','1day','session_id',ses->>'id','session_close',ses->>'closes_at','loaded_at',ses->>'closes_at',
  'close',(case j when 0 then 100+2*(ord-1) else 200+(ord-1) end)::text,'adjusted_close',(case j when 0 then 100+2*(ord-1) else 200+(ord-1) end)::text) order by ord,j)
 into observations from jsonb_array_elements(sessions) with ordinality t(ses,ord) cross join generate_series(0,1) j;
 s:=jsonb_build_object('contractVersion',1,'asOf','2026-09-23T17:00:00Z',
 'call',jsonb_build_object('id',eid,'assessment_id','00000000-0000-4000-8000-000000000100','instrument_id',stock,'benchmark_instrument_id',bench,'provider_id',provider,
 'currency','USD','methodology','shared-decision-lab-v1','cost_per_side','0.001','action','BUY','published_at','2026-09-01T18:00:00Z','source_cutoff','2026-09-01T17:00:00Z','model_identity','fixture-only','thesis','Synthetic evidence','risks','Synthetic risks','input_hash',repeat('a',64)),
 'reviews','[]'::jsonb,'outcomes','[]'::jsonb,'state',jsonb_build_object('call_id',eid,'version','0','evaluated_through',null),
 'instrumentExchange','FIXTURE','benchmarkExchange','FIXTURE','inputVersions',jsonb_build_object('calendar','00000000-0000-4000-8000-000000000008','stock','00000000-0000-4000-8000-000000000009','benchmark','00000000-0000-4000-8000-000000000010'),
 'calendar',jsonb_build_object('exchange','FIXTURE','complete',true,'coverageStart','2026-09-01T00:00:00Z','coverageEnd','2026-09-24T00:00:00Z','sessions',sessions,'provenance',jsonb_build_object('verified',true,'verifiedAt','2026-09-01T00:00:00Z','reference','synthetic-calendar','revision','1')),'observations',observations);
 sr:=110*0.999/(100*1.001)-1;
 foreach a in array array['BUY','HOLD','REDUCE','WAIT','AVOID','SELL'] loop
  s:=jsonb_set(s,'{call,action}',to_jsonb(a));w:=case when a in('BUY','HOLD') then 1 when a='REDUCE' then 0.5 else 0 end;
  r:=private.shared_action_reference_v1(s,eid,5);
  if r->>'status'<>'matured' or jsonb_array_length(r->'path')<>6 or abs((r#>>'{metrics,actionReturn}')::double precision-w*sr)>1e-12
   or abs((r#>>'{metrics,benchmarkReturn}')::double precision-(205*0.999/(200*1.001)-1))>1e-12 then raise exception 'ACTION_PARITY_FAILURE %',a;end if;
 end loop;
 r:=private.shared_action_reference_v1(s,eid,20);
 if jsonb_array_length(r->'path')<>21 then raise exception 'HORIZON_FAILURE';end if;
 r:=private.shared_action_reference_v1(s,eid,5);pins:=r->'path';
 if private.shared_action_reference_v1(s,eid,5,pins) is distinct from r then raise exception 'RETRY_FAILURE';end if;
 original:=s;
 -- Equivalent calendar renewal preserves original immutable evidence.
 s:=jsonb_set(s,'{inputVersions,calendar}','"00000000-0000-4000-8000-000000000088"');
 s:=jsonb_set(s,'{calendar,provenance,revision}','"renewed-equivalent"');
 if private.shared_action_reference_v1(s,eid,5,pins) is distinct from r then raise exception 'EQUIVALENT_RENEWAL_FAILURE';end if;
 s:=jsonb_set(s,'{inputVersions,stock}','"00000000-0000-4000-8000-000000000099"');
 if private.shared_action_reference_v1(s,eid,5,pins)->>'blocker'<>'PINNED_EVIDENCE_REVISED' then raise exception 'SOURCE_REVISION_FAILURE';end if;
 s:=original;
 s:=jsonb_set(s,'{calendar,sessions,1,opens_at}','"2026-09-03T10:00:00Z"');
 if private.shared_action_reference_v1(s,eid,5,pins)->>'blocker'<>'PINNED_EVIDENCE_REVISED' then raise exception 'SESSION_TIMING_REVISION_FAILURE';end if;
 s:=original;
 s:=jsonb_set(s,'{calendar,sessions}',sessions-0);
 select jsonb_agg(o) into observations from jsonb_array_elements(original->'observations') o where o->>'session_id'<>'02';
 s:=jsonb_set(s,'{observations}',observations);
 if private.shared_action_reference_v1(s,eid,5,pins)->>'blocker'<>'PINNED_CALENDAR_REVISED' then raise exception 'ENTRY_CALENDAR_REVISION_FAILURE';end if;
 s:=original;observations:=original->'observations';
 -- Independent drawdown oracle with a peak and subsequent trough.
 s:=jsonb_set(s,'{call,action}','"REDUCE"');
 s:=jsonb_set(jsonb_set(s,'{observations,2,close}','"120"'),'{observations,2,adjusted_close}','"120"');
 s:=jsonb_set(jsonb_set(s,'{observations,4,close}','"80"'),'{observations,4,adjusted_close}','"80"');
 if abs((private.shared_action_reference_v1(s,eid,5)#>>'{metrics,maxDrawdown}')::double precision-
 ((1+0.5*(80*0.999/(100*1.001)-1))/(1+0.5*(120*0.999/(100*1.001)-1))-1))>1e-12 then raise exception 'INDEPENDENT_DRAWDOWN_FAILURE';end if;
 s:=original;
 rejected:=false;
 begin perform private.shared_action_reference_v1(s,eid,6);exception when raise_exception then if SQLERRM<>'UNSUPPORTED_HORIZON' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'UNSUPPORTED_HORIZON_ACCEPTED';end if;
 s:=jsonb_set(s,'{observations,0,close}','"101"');s:=jsonb_set(s,'{observations,0,adjusted_close}','"101"');
 if private.shared_action_reference_v1(s,eid,5,pins)->>'blocker'<>'PINNED_EVIDENCE_REVISED' then raise exception 'REVISION_FAILURE';end if;
 s:=jsonb_set(s,'{observations}',observations-4);
 if private.shared_action_reference_v1(s,eid,5)->>'blocker'<>'MISSING_OR_DUPLICATE_PRICE' then raise exception 'GAP_FAILURE';end if;
 if has_function_privilege('authenticated','private.run_shared_action_evaluation_v1()','EXECUTE') or has_table_privilege('authenticated','private.shared_action_marks','SELECT')
 or has_function_privilege('anon','public.shared_ai_performance_v1(text,integer)','EXECUTE') then raise exception 'PRIVILEGE_FAILURE';end if;
 if has_function_privilege('authenticated','private.shared_action_read_blocker_v1(uuid,uuid,integer)','EXECUTE') then raise exception 'READ_HELPER_PRIVILEGE_FAILURE';end if;
 -- Guard must reject before any runner mutation at the default isolation level.
 rejected:=false;
 begin perform private.run_shared_action_evaluation_v1();exception when raise_exception then if SQLERRM<>'SERIALIZABLE_TRANSACTION_REQUIRED' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'RUNNER_ISOLATION_GUARD_FAILURE';end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d774a2c9-bfd6-403f-9b6a-0684600c90de","role":"authenticated","is_anonymous":false}',true);
do $rpc$
declare p jsonb; sc text; h integer; rejected boolean;
begin
 foreach sc in array array['all','watched'] loop
  foreach h in array array[5,20] loop
   p:=public.shared_ai_performance_v1(sc,h);
   if p->>'methodology'<>'shared-action-trial-v1' or (p->>'horizon')::integer<>h
    or (p#>>'{counts,events}')::integer<>(p#>>'{counts,matured}')::integer+(p#>>'{counts,pending}')::integer+(p#>>'{counts,blocked}')::integer
    or (p#>>'{overall,sampleSize}')::integer<>(p#>>'{counts,matured}')::integer
    or jsonb_array_length(p->'recent')>20 then raise exception 'AUTHENTICATED_RPC_CONTRACT_FAILURE';end if;
   if (p#>>'{overall,sampleSize}')::integer=0 and
    (p#>>'{overall,meanActionReturn}' is not null or p#>>'{overall,benchmarkBeatRate}' is not null or p#>>'{overall,maxDrawdown}' is not null
    or jsonb_array_length(p->'byModel')<>0 or jsonb_array_length(p->'byAction')<>0) then raise exception 'EMPTY_COHORT_NULL_FAILURE';end if;
  end loop;
 end loop;
 rejected:=false;
 begin perform public.shared_ai_performance_v1('all',6);exception when raise_exception then if SQLERRM<>'Invalid filter' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'RPC_INVALID_HORIZON_ACCEPTED';end if;
 perform set_config('request.jwt.claims','{"sub":"d774a2c9-bfd6-403f-9b6a-0684600c90de","role":"authenticated","is_anonymous":true}',true);
 rejected:=false;
 begin perform public.shared_ai_performance_v1('all',5);exception when raise_exception then if SQLERRM<>'Permanent sign-in required' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'RPC_ANONYMOUS_USER_ACCEPTED';end if;
end $rpc$;
reset role;
rollback;
