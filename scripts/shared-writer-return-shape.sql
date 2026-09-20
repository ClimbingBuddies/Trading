create or replace function private.commit_shared_evaluation_v1(p_call uuid,p_token uuid,p_proposal jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare c record; saved record; current_snapshot jsonb; expected jsonb; expected_rows jsonb;
 item jsonb; e jsonb; proposed_engine jsonb; n integer; k text; asof timestamptz;
 row_value public.shared_decision_outcomes%rowtype; v_receipt jsonb; health text;
begin
 if not exists(select 1 from private.shared_evaluator_release where enabled) then raise exception 'SHARED_EVALUATOR_ADAPTER_NOT_VERIFIED'; end if;
 if current_setting('transaction_isolation')<>'serializable' then raise exception 'SERIALIZABLE_TRANSACTION_REQUIRED'; end if;
 select * into c from public.shared_decision_calls where id=p_call;
 if not found then raise exception 'CALL_NOT_FOUND'; end if;
 perform pg_advisory_xact_lock(hashtextextended('shared-decision:'||c.instrument_id::text,0));
 select * into saved from private.shared_evaluation_snapshots where id=p_token and call_id=p_call for update;
 if not found then raise exception 'SNAPSHOT_TOKEN_NOT_FOUND'; end if;
 if saved.receipt is not null then
  if saved.proposal is distinct from p_proposal then raise exception 'RETRY_PAYLOAD_MISMATCH'; end if;
  return saved.receipt;
 end if;
 asof:=(saved.snapshot->>'asOf')::timestamptz;
 if asof>clock_timestamp() or saved.created_at<clock_timestamp()-interval '5 minutes' then raise exception 'SNAPSHOT_EXPIRED'; end if;
 current_snapshot:=private.build_shared_evaluation_snapshot_v1(p_call,asof);
 if current_snapshot is distinct from saved.snapshot then raise exception 'SNAPSHOT_CHANGED'; end if;
 if p_proposal->>'callId' is distinct from p_call::text or p_proposal->>'expectedVersion' is distinct from saved.snapshot->'state'->>'version'
 or p_proposal->>'evaluatedThrough' is distinct from saved.snapshot->>'asOf'
 or p_proposal->>'adapterVersion' is distinct from '1'
 or coalesce(p_proposal->>'proposalHash','') !~ '^[0-9a-f]{64}$'
 or coalesce(p_proposal->>'snapshotHash','') !~ '^[0-9a-f]{64}$'
 or coalesce(p_proposal->>'baseOutcomesHash','') !~ '^[0-9a-f]{64}$'
 then raise exception 'PROPOSAL_IDENTITY_MISMATCH'; end if;
 -- Token's complete source JSON is compared above; JS hashes are receipt identity,
 -- not authority. No cross-language JSON-number serialization assumption is made.
 perform private.validate_shared_snapshot_v1(saved.snapshot);
 expected:=private.shared_paper_reference_v1(saved.snapshot);
 expected_rows:=expected->'added';
 if p_proposal->>'state' is distinct from expected->>'state' or jsonb_typeof(p_proposal->'added') is distinct from 'array'
 or jsonb_array_length(p_proposal->'added')<>jsonb_array_length(expected_rows) then raise exception 'EXPECTED_OUTCOMES_MISMATCH'; end if;
 n:=0;
 for item in select value from jsonb_array_elements(p_proposal->'added') loop
  e:=expected_rows->n; n:=n+1; proposed_engine:=item->'evidence'->'engine';
  if item->>'call_id' is distinct from p_call::text or item->>'kind' is distinct from e->>'kind'
  or (item->>'as_of')::timestamptz is distinct from (e->>'asOf')::timestamptz
  or item->>'reason' is distinct from e->>'reason'
  or item->'evidence'->>'adapterVersion' is distinct from '1'
  or item->'evidence'->>'calendarReference' is distinct from saved.snapshot->'calendar'->'provenance'->>'reference'
  or item->'evidence'->>'calendarRevision' is distinct from saved.snapshot->'calendar'->'provenance'->>'revision'
  or (proposed_engine-'netReturn'-'benchmarkReturn') is distinct from (e-'netReturn'-'benchmarkReturn')
  then raise exception 'OUTCOME_EVIDENCE_MISMATCH'; end if;
  -- Only numeric return rounding may differ across JS/Postgres IEEE arithmetic.
  foreach k in array array['netReturn','benchmarkReturn'] loop
   if (e ? k) is distinct from (proposed_engine ? k) or (e ? k and jsonb_typeof(proposed_engine->k) is distinct from 'number') then raise exception 'RETURN_SHAPE_MISMATCH'; end if;
   if (e->>k is null)<>(proposed_engine->>k is null) then raise exception 'RETURN_NULL_MISMATCH'; end if;
   if e->>k is not null and (coalesce(proposed_engine->>k,'') in('NaN','Infinity','-Infinity')
    or abs((proposed_engine->>k)::numeric-(e->>k)::numeric)>0.000000000001) then raise exception 'RETURN_CALCULATION_MISMATCH'; end if;
  end loop;
  if (item->>'price')::numeric is distinct from (e->>'price')::numeric
  or (item->>'net_return')::numeric is distinct from (proposed_engine->>'netReturn')::numeric
  or (item->>'benchmark_return')::numeric is distinct from (proposed_engine->>'benchmarkReturn')::numeric
  then raise exception 'OUTCOME_COLUMN_MISMATCH'; end if;
  -- Reject arbitrary extra JSON in public evidence. Sources remain private.
  if item->'evidence' is distinct from jsonb_build_object('adapterVersion',1,'engine',proposed_engine,
   'calendarReference',saved.snapshot->'calendar'->'provenance'->>'reference','calendarRevision',saved.snapshot->'calendar'->'provenance'->>'revision')
  then raise exception 'UNAPPROVED_PUBLIC_EVIDENCE'; end if;
  row_value.id:=gen_random_uuid(); row_value.call_id:=p_call; row_value.kind:=item->>'kind';
  row_value.as_of:=(item->>'as_of')::timestamptz; row_value.recorded_at:=asof;
  row_value.price:=(item->>'price')::numeric; row_value.net_return:=(item->>'net_return')::numeric;
  row_value.benchmark_return:=(item->>'benchmark_return')::numeric; row_value.reason:=item->>'reason';row_value.evidence:=item->'evidence';
  insert into private.shared_outcome_write_permits values(txid_current(),to_jsonb(row_value)-'id');
  insert into public.shared_decision_outcomes select (row_value).*;
 end loop;
 health:=case expected->>'state' when 'Missing data' then 'MISSING_DATA' when 'Calendar required' then 'CALENDAR_REQUIRED' else 'READY' end;
 update private.shared_decision_evaluation_state set version=version+1,evaluated_through=asof,last_attempt_at=asof,
 data_status=health,blocker_code=case when health='READY' then null else health end
 where call_id=p_call and version=(saved.snapshot->'state'->>'version')::bigint and (evaluated_through is null or evaluated_through<=asof);
 if not found then raise exception 'VERSION_CONFLICT'; end if;
 v_receipt:=jsonb_build_object('status','COMMITTED','callId',p_call,'proposalHash',p_proposal->>'proposalHash',
 'version',((saved.snapshot->'state'->>'version')::bigint+1)::text,'evaluatedThrough',saved.snapshot->>'asOf');
 update private.shared_evaluation_snapshots set proposal=p_proposal,receipt=v_receipt where id=p_token;
 return v_receipt;
end $$;
