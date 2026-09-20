begin;
do $test$
declare a record; ids uuid[]; c uuid; p uuid; b uuid; v bigint; cutoff timestamptz;
begin
 select ass.instrument_id,array_agg(ass.assessment_id order by ass.created_at) assessment_ids into a
 from public.gpt_market_assessments ass join public.instruments i on i.id=ass.instrument_id
 where i.currency_code='USD' and i.symbol<>'QQQ'
 and not exists(select 1 from private.shared_decision_assessment_usage u where u.assessment_id=ass.assessment_id)
 group by ass.instrument_id having count(*)>=3 limit 1;
 if a.instrument_id is null then raise exception 'Missing fixture prerequisites'; end if;
 ids:=a.assessment_ids;
 select id into p from public.data_providers where provider_code='tiingo';
 select id into b from public.instruments where symbol='QQQ' and currency_code='USD' limit 1;
 insert into public.shared_decision_calls(instrument_id,assessment_id,published_at,source_cutoff,action,thesis,risks,model_identity,input_hash,provider_id,benchmark_instrument_id,currency)
 values(a.instrument_id,ids[1],now()-interval '3 days',now()-interval '4 days','BUY','Transaction-only synthetic thesis','Transaction-only synthetic risks','test',repeat('0',64),p,b,'USD') returning id into c;
 insert into public.shared_decision_reviews(call_id,assessment_id,action,thesis,risks,source_cutoff,model_identity,input_hash)
 values(c,ids[2],'HOLD','Transaction-only synthetic thesis','Transaction-only synthetic risks',now()-interval '2 days','test',repeat('0',64));
 select version into v from private.shared_decision_evaluation_state where call_id=c;
 if v<>1 then raise exception 'Missing state not initialized'; end if;
 cutoff:=now()-interval '1 day';
 update private.shared_decision_evaluation_state set evaluated_through=cutoff,data_status='READY' where call_id=c;
 begin
  insert into public.shared_decision_reviews(call_id,assessment_id,action,thesis,risks,source_cutoff,model_identity,input_hash)
  values(c,ids[3],'SELL','Transaction-only synthetic thesis','Transaction-only synthetic risks',now()-interval '1 hour','test',repeat('0',64));
  if not exists(select 1 from private.shared_decision_evaluation_state where call_id=c and version=2 and data_status='UNVERIFIED' and evaluated_through=cutoff) then raise exception 'Version/status/watermark mismatch'; end if;
  raise exception 'ROLLBACK_PROBE';
 exception when raise_exception then if sqlerrm<>'ROLLBACK_PROBE' then raise;end if;
 end;
 if not exists(select 1 from private.shared_decision_evaluation_state where call_id=c and version=1 and data_status='READY') then raise exception 'Subtransaction did not roll back';end if;
 begin
  insert into public.shared_decision_outcomes(call_id,kind,as_of,price) values(c,'ENTRY',now(),100);
  raise exception 'Gate allowed unsafe outcome';
 exception when raise_exception then if sqlerrm<>'SHARED_EVALUATOR_ADAPTER_NOT_VERIFIED' then raise;end if;end;
 if has_function_privilege('authenticated','private.invalidate_shared_evaluation_v1()','EXECUTE') then raise exception 'Trigger callable by app';end if;
end $test$;
rollback;
select 'PASS: version initialization/increment, watermark preservation, review rollback, gate and privileges; fixtures rolled back' result;
