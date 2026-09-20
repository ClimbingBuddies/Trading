-- Invalidate snapshots whenever an appended review changes the call's inputs.
-- Publication and evaluation must take the same instrument advisory lock.
create or replace function private.invalidate_shared_evaluation_v1() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare instrument uuid;
begin
 select instrument_id into instrument from public.shared_decision_calls where id=new.call_id;
 perform pg_advisory_xact_lock(hashtextextended('shared-decision:'||instrument::text,0));
 insert into private.shared_decision_evaluation_state(call_id,version,data_status,blocker_code)
 values(new.call_id,1,'UNVERIFIED','NEW_REVIEW_REQUIRES_EVALUATION')
 on conflict(call_id) do update set version=private.shared_decision_evaluation_state.version+1,
 data_status='UNVERIFIED',blocker_code='NEW_REVIEW_REQUIRES_EVALUATION';
 return new;
end $$;
revoke all on function private.invalidate_shared_evaluation_v1() from public,anon,authenticated,service_role;
create trigger shared_review_invalidates_evaluation after insert on public.shared_decision_reviews
 for each row execute function private.invalidate_shared_evaluation_v1();
