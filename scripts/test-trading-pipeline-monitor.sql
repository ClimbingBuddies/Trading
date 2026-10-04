-- Only operational tables are exercised. Every fixture is rolled back.
begin;
do $$
declare snap jsonb; ident uuid; hit boolean:=false; initial_calls bigint; initial_notes bigint;
begin
 select count(*) into initial_calls from public.shared_decision_calls;
 select count(*) into initial_notes from public.shared_decision_private_notes;
 snap:=private.trading_pipeline_snapshot_v1('2026-10-06T02:14:59Z');
 if snap->>'state'<>'PENDING' then raise exception 'FAIL premature missed-run alarm'; end if;
 snap:=private.trading_pipeline_snapshot_v1('2026-10-06T02:15:00Z');
 if snap->>'state'<>'ATTENTION' or not exists(select 1 from jsonb_array_elements(snap->'problems') j where j->>'code'='CONTROLLER_NOT_SEEN') then raise exception 'FAIL missing invocation undetected'; end if;
 if (snap->>'marketSession')<>'2026-10-05' or not (snap->>'marketDue')::boolean then raise exception 'FAIL Perth/NY session'; end if;
 snap:=private.trading_pipeline_snapshot_v1('2026-10-05T02:15:00Z');
 if (snap->>'marketDue')::boolean or exists(select 1 from jsonb_array_elements(snap->'problems') j where j->>'code'='DECISION_PIPELINE_INCOMPLETE') then raise exception 'FAIL weekend fabricated obligation'; end if;
 if has_function_privilege('anon','public.trading_pipeline_status_v1()','execute') or has_function_privilege('authenticated','private.run_trading_watchdog_v1()','execute') then raise exception 'FAIL privilege boundary'; end if;
 begin perform public.trading_pipeline_status_v1(); exception when others then hit:=SQLERRM='Permanent sign-in required'; end;
 if not hit then raise exception 'FAIL unauthenticated status access'; end if;
 ident:=private.claim_trading_stage_v1('evaluation',repeat('a',40));
 hit:=false;
 begin perform private.claim_trading_stage_v1('evaluation',repeat('a',40)); exception when others then hit:=SQLERRM='CONTROLLER_STAGE_ALREADY_RUNNING'; end;
 if not hit then raise exception 'FAIL overlapping claim'; end if;
 perform private.finish_trading_stage_v1(ident,'blocked','FIXTURE');
 ident:=private.claim_trading_stage_v1('evaluation',repeat('a',40));
 perform private.finish_trading_stage_v1(ident,'blocked','FIXTURE');
 hit:=false;
 begin perform private.claim_trading_stage_v1('evaluation',repeat('a',40)); exception when others then hit:=SQLERRM='STAGE_RETRY_BUDGET_EXHAUSTED'; end;
 if not hit then raise exception 'FAIL unbounded retries'; end if;
 for n in 1..6 loop
  ident:=private.claim_trading_stage_v1('preflight',repeat('a',40));
  perform private.finish_trading_stage_v1(ident,'completed',null);
 end loop;
 hit:=false;
 begin perform private.claim_trading_stage_v1('preflight',repeat('a',40)); exception when others then hit:=SQLERRM='STAGE_RETRY_BUDGET_EXHAUSTED'; end;
 if not hit then raise exception 'FAIL unbounded preflight receipts'; end if;
 perform private.reconcile_trading_watchdog_v1('2026-10-06T02:15:00Z');
 if (select count(*) from private.trading_pipeline_incidents where incident_key='2026-10-06:CONTROLLER_NOT_SEEN' and resolved_at is null)<>1 then raise exception 'FAIL missing run did not produce saved alert'; end if;
 perform private.reconcile_trading_watchdog_v1('2026-10-06T02:30:00Z');
 if (select count(*) from private.trading_pipeline_incidents where incident_key='2026-10-06:CONTROLLER_NOT_SEEN')<>1 then raise exception 'FAIL repeated alert'; end if;
 insert into private.trading_controller_attempts(morning_date,stage,spec_revision,started_at,finished_at,state)
 values('2026-10-06','preflight',repeat('a',40),'2026-10-06T02:31:00Z','2026-10-06T02:32:00Z','completed');
 perform private.reconcile_trading_watchdog_v1('2026-10-06T02:45:00Z');
 if not exists(select 1 from private.trading_pipeline_incidents where incident_key='2026-10-06:CONTROLLER_NOT_SEEN' and resolved_at='2026-10-06T02:45:00Z') then raise exception 'FAIL recovery not recorded'; end if;
 if exists(select incident_key from private.trading_pipeline_incidents group by incident_key having count(*)>1) then raise exception 'FAIL duplicate incidents'; end if;
 if (select count(*) from public.shared_decision_calls)<>initial_calls or (select count(*) from public.shared_decision_private_notes)<>initial_notes then raise exception 'FAIL monitor changed AI or private data'; end if;
end $$;
rollback;
