-- Uses existing real price rows but synthetic calls ONLY inside rollback.
begin isolation level serializable;
do $test$
declare stock uuid; benchmark uuid; provider uuid; assessments uuid[]; v_call uuid;
 days jsonb; sessions jsonb; envelope jsonb; snap jsonb; token uuid; expected jsonb;
 proposal jsonb; bad jsonb; receipt jsonb; again jsonb; rows jsonb; rejected boolean; request_id uuid:=gen_random_uuid();
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
 receipt:=private.run_shared_evaluation_v1(request_id,repeat('a',40),'manual_verification');
 if receipt->>'status'<>'blocked' or receipt->>'blocked_count'<>'1' or not exists(select 1 from private.shared_decision_evaluation_state es where es.call_id=v_call and es.data_status='UNVERIFIED' and es.last_attempt_at is not null) then raise exception 'FAILED_RUN_HEALTH_NOT_RECORDED';end if;
 request_id:=gen_random_uuid();
 update private.shared_evaluator_release set enabled=true;
 receipt:=private.run_shared_evaluation_v1(request_id,repeat('a',40),'manual_verification');
 again:=private.run_shared_evaluation_v1(request_id,repeat('a',40),'manual_verification');
 if receipt is distinct from again or receipt->>'status'<>'succeeded' or receipt->>'evaluated_count'<>'1' then raise exception 'RUNNER_REPLAY_FAILED: %',receipt;end if;
 if (select count(*) from public.shared_decision_outcomes o where o.call_id=v_call)<>5 then raise exception 'RUNNER_OUTCOME_COUNT_FAILED';end if;
 if not exists(select 1 from private.shared_evaluation_run_items where run_id=request_id and status='evaluated') then raise exception 'RUNNER_ITEM_AUDIT_MISSING';end if;
 rejected:=false;
 begin perform private.run_shared_evaluation_v1(request_id,repeat('b',40),'manual_verification');
 exception when raise_exception then if sqlerrm<>'RUN_RETRY_PAYLOAD_MISMATCH' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'RUNNER_CHANGED_RETRY_ACCEPTED';end if;
end $test$;
rollback;
select 'PASS: controller entry point evaluated one rollback-only cycle, five outcomes, durable item receipt and identical replay; no scheduled invocation claimed' result;
