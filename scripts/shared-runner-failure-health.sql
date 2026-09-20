create or replace function private.run_shared_evaluation_v1(p_request uuid,p_spec_revision text,p_origin text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare run private.shared_evaluation_runs%rowtype; item record; result jsonb; reason text; succeeded int:=0; blocked int:=0;
begin
 if current_setting('transaction_isolation')<>'serializable' then raise exception 'SERIALIZABLE_TRANSACTION_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('shared-evaluation-runner',0));
 select * into run from private.shared_evaluation_runs where id=p_request;
 if found then
  if run.spec_revision is distinct from p_spec_revision or run.origin is distinct from p_origin then raise exception 'RUN_RETRY_PAYLOAD_MISMATCH'; end if;
  return to_jsonb(run);
 end if;
 insert into private.shared_evaluation_runs(id,spec_revision,origin) values(p_request,p_spec_revision,p_origin);
 for item in select id,instrument_id from public.shared_decision_calls c where not exists(select 1 from public.shared_decision_outcomes o where o.call_id=c.id and o.kind in('EXIT','CANCELLED')) order by c.instrument_id loop
  begin
   result:=private.evaluate_shared_call_v1(item.id);
   insert into private.shared_evaluation_run_items(run_id,call_id,status,receipt) values(p_request,item.id,'evaluated',result);
   succeeded:=succeeded+1;
  exception when serialization_failure or deadlock_detected then raise;
  when others then
   reason:=case when SQLSTATE='P0001' and SQLERRM ~ '^[A-Z0-9_]+$' then SQLERRM else 'EVALUATION_FAILED_REQUIRES_REVIEW' end;
   perform pg_advisory_xact_lock(hashtextextended('shared-decision:'||item.instrument_id::text,0));
   update private.shared_decision_evaluation_state set version=version+1,last_attempt_at=clock_timestamp(),
    data_status=case when reason in('VERIFIED_CALENDAR_REQUIRED','MATCHING_VERIFIED_EXCHANGE_REQUIRED') then 'CALENDAR_REQUIRED' else 'UNVERIFIED' end,
    blocker_code=reason where call_id=item.id;
   insert into private.shared_evaluation_run_items(run_id,call_id,status,blocker_code) values(p_request,item.id,'blocked',reason);
   blocked:=blocked+1;
  end;
 end loop;
 update private.shared_evaluation_runs set completed_at=clock_timestamp(),evaluated_count=succeeded,blocked_count=blocked,
 reason=case when succeeded+blocked=0 then 'NO_SHARED_CALLS_TO_EVALUATE' else null end,
 status=case when succeeded=0 then 'blocked' when blocked>0 then 'partial' else 'succeeded' end where id=p_request returning * into run;
 return to_jsonb(run);
end $$;
