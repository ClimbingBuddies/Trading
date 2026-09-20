-- Uses existing real price rows but synthetic calls ONLY inside rollback.
begin isolation level serializable;
do $test$
declare stock uuid; benchmark uuid; provider uuid; assessments uuid[]; v_call uuid;
 days jsonb; sessions jsonb; envelope jsonb; snap jsonb; token uuid; expected jsonb;
 proposal jsonb; bad jsonb; receipt jsonb; again jsonb; rows jsonb; rejected boolean;
begin
 select id into stock from public.instruments where symbol='AVGO' and exchange_code='NASDAQ';
 select id into benchmark from public.instruments where symbol='QQQ' and exchange_code='NASDAQ';
 select id into provider from public.data_providers where provider_code='tiingo';
 select array_agg(assessment_id order by created_at) into assessments from public.gpt_market_assessments a where instrument_id=stock
 and not exists(select 1 from private.shared_decision_assessment_usage u where u.assessment_id=a.assessment_id);
 if stock is null or benchmark is null or provider is null or cardinality(assessments)<3 then raise exception 'FIXTURE_PREREQUISITES_MISSING'; end if;
 select jsonb_agg(case when extract(isodow from d) in(6,7) then jsonb_build_object('date',d::date,'status','CLOSED','reason','Rollback weekend')
 else jsonb_build_object('date',d::date,'status','OPEN','opens_at',d::date::text||'T13:30:00Z','closes_at',d::date::text||'T20:00:00Z') end order by d) into days
 from generate_series('2026-09-15'::date,'2026-09-22'::date,interval '1 day') d;
 select jsonb_agg(jsonb_build_object('id','NASDAQ:'||(v->>'date'),'opens_at',v->>'opens_at','closes_at',v->>'closes_at') order by v->>'date') into sessions from jsonb_array_elements(days) v where v->>'status'='OPEN';
 insert into private.shared_market_calendars(exchange_code,revision,time_zone,coverage_start,coverage_end,verified_at,valid_until,reference,manifest_hash,days,sessions)
 values('NASDAQ','rollback-writer-fixture','America/New_York','2026-09-15T04:00:00Z','2026-09-23T04:00:00Z',now()-interval '1 minute',now()+interval '1 day','Rollback-only fixture, no live trust',repeat('0',64),days,sessions);
 insert into private.shared_market_input_config(instrument_id,provider_id,exchange_code,revision,timestamp_convention,verified_at,reference)
 select i,provider,'NASDAQ','rollback-writer-fixture','UTC_SESSION_DATE',now()-interval '1 minute','Rollback-only verified source fixture' from unnest(array[stock,benchmark]) i;
 insert into public.shared_decision_calls(instrument_id,assessment_id,published_at,source_cutoff,action,thesis,risks,model_identity,input_hash,provider_id,benchmark_instrument_id,currency)
 values(stock,assessments[1],'2026-09-15T22:00:00Z','2026-09-15T21:00:00Z','BUY','Rollback-only synthetic original call','Rollback-only synthetic risk evidence','fixture',repeat('0',64),provider,benchmark,'USD') returning id into v_call;
 insert into public.shared_decision_reviews(call_id,assessment_id,published_at,source_cutoff,action,thesis,risks,model_identity,input_hash)
 values(v_call,assessments[2],'2026-09-16T22:00:00Z','2026-09-16T21:00:00Z','HOLD','Rollback-only synthetic hold review','Rollback-only synthetic risk evidence','fixture',repeat('0',64)),
 (v_call,assessments[3],'2026-09-17T22:00:00Z','2026-09-17T21:00:00Z','SELL','Rollback-only synthetic sell review','Rollback-only synthetic risk evidence','fixture',repeat('0',64));
 envelope:=private.shared_evaluation_snapshot_v1(v_call);snap:=envelope->'snapshot';token:=(envelope->>'snapshotToken')::uuid;
 perform private.validate_shared_snapshot_v1(snap);
 expected:=private.shared_paper_reference_v1(snap);
 if expected->>'state'<>'Closed' or jsonb_array_length(expected->'added')<>5 then raise exception 'REAL_PRICE_FIXTURE_INCOMPLETE: %',expected;end if;
 select jsonb_agg(jsonb_build_object('call_id',v_call,'kind',e->>'kind','as_of',e->>'asOf','price',e->>'price','net_return',e->>'netReturn','benchmark_return',e->>'benchmarkReturn','reason',e->>'reason',
 'evidence',jsonb_build_object('adapterVersion',1,'engine',e,'calendarReference',snap#>>'{calendar,provenance,reference}','calendarRevision',snap#>>'{calendar,provenance,revision}')) order by ord) into rows
 from jsonb_array_elements(expected->'added') with ordinality t(e,ord);
 proposal:=jsonb_build_object('adapterVersion',1,'callId',v_call,'expectedVersion',snap#>>'{state,version}','evaluatedThrough',snap->>'asOf','state',expected->>'state','added',rows,'proposalHash',repeat('1',64),'snapshotHash',repeat('2',64),'baseOutcomesHash',repeat('3',64));
 rejected:=false;
 begin perform private.commit_shared_evaluation_v1(v_call,token,proposal);
 exception when raise_exception then if sqlerrm<>'SHARED_EVALUATOR_ADAPTER_NOT_VERIFIED' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'RELEASE_GATE_FAILED';end if;
 update private.shared_evaluator_release set enabled=true;
 rejected:=false;bad:=jsonb_set(proposal,'{added,0,price}','"999"');
 begin perform private.commit_shared_evaluation_v1(v_call,token,bad);
 exception when raise_exception then if sqlerrm<>'OUTCOME_COLUMN_MISMATCH' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'TAMPERED_PRICE_ACCEPTED';end if;
 rejected:=false;bad:=jsonb_set(proposal,'{added}','[]');
 begin perform private.commit_shared_evaluation_v1(v_call,token,bad);
 exception when raise_exception then if sqlerrm<>'EXPECTED_OUTCOMES_MISMATCH' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'OMITTED_OUTCOMES_ACCEPTED';end if;
 rejected:=false;
 begin
  update private.shared_decision_evaluation_state set version=version+1 where shared_decision_evaluation_state.call_id=v_call;
  perform private.commit_shared_evaluation_v1(v_call,token,proposal);
 exception when raise_exception then if sqlerrm<>'SNAPSHOT_CHANGED' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'STALE_VERSION_ACCEPTED';end if;
 rejected:=false;bad:=jsonb_set(proposal,'{added,1,evidence,engine,netReturn}',to_jsonb(proposal#>>'{added,1,evidence,engine,netReturn}'));
 begin perform private.commit_shared_evaluation_v1(v_call,token,bad);
 exception when raise_exception then if sqlerrm<>'RETURN_SHAPE_MISMATCH' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'NUMERIC_STRING_RETURN_ACCEPTED';end if;
 rejected:=false;bad:=jsonb_set(proposal,'{added,0,evidence,engine,netReturn}','null');
 begin perform private.commit_shared_evaluation_v1(v_call,token,bad);
 exception when raise_exception then if sqlerrm<>'RETURN_SHAPE_MISMATCH' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'UNEXPECTED_NULL_RETURN_ACCEPTED';end if;
 receipt:=private.commit_shared_evaluation_v1(v_call,token,proposal);
 again:=private.commit_shared_evaluation_v1(v_call,token,proposal);
 if receipt is distinct from again or receipt->>'status'<>'COMMITTED' then raise exception 'RECEIPT_REPLAY_FAILED';end if;
 if (select count(*) from public.shared_decision_outcomes o where o.call_id=v_call)<>5 then raise exception 'OUTCOME_COUNT_FAILED';end if;
 if exists(select 1 from private.shared_outcome_write_permits where transaction_id=txid_current()) then raise exception 'PERMIT_LEAK';end if;
 rejected:=false;
 begin insert into public.shared_decision_outcomes(call_id,kind,as_of,price) values(v_call,'ENTRY',now(),999);
 exception when raise_exception then if sqlerrm<>'SHARED_EVALUATOR_ADAPTER_NOT_VERIFIED' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'DIRECT_WRITE_GATE_FAILED';end if;
 perform private.validate_shared_snapshot_v1(private.build_shared_evaluation_snapshot_v1(v_call,date_trunc('milliseconds',clock_timestamp())));
 again:=private.evaluate_shared_call_v1(v_call);
 if again->>'status'<>'COMMITTED' or (select count(*) from public.shared_decision_outcomes o where o.call_id=v_call)<>5 then raise exception 'TERMINAL_WRAPPER_REPLAY_FAILED';end if;
 if has_function_privilege('authenticated','private.commit_shared_evaluation_v1(uuid,uuid,jsonb)','EXECUTE') or has_table_privilege('service_role','private.shared_outcome_write_permits','INSERT') then raise exception 'PRIVILEGE_BOUNDARY_FAILED';end if;
 perform set_config('test.shared_writer_call',v_call::text,true);
end $test$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"d774a2c9-bfd6-403f-9b6a-0684600c90de","role":"authenticated","is_anonymous":false}',true);
do $read$
declare detail jsonb;
begin
 detail:=public.shared_decision_detail_v1(current_setting('test.shared_writer_call')::uuid);
 if detail#>>'{item,state}'<>'CLOSED' or detail#>>'{item,dataStatus}'<>'READY' or detail#>>'{item,performance,netReturn}' is null or detail#>>'{item,original,action}'<>'BUY' then raise exception 'POPULATED_DETAIL_PROJECTION_FAILED';end if;
end $read$;
reset role;
rollback;
select 'PASS: real-source snapshot, Buy/Hold/Sell write, release gate, tampering, omissions, stale version, replay, direct-write denial, permit cleanup, persisted validation, privileges; all fixtures rolled back' result;
