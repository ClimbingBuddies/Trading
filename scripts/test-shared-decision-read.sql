-- All fixtures transaction-local and rolled back. No external side effects.
begin;
do $$
declare a record; c uuid; v_user uuid; provider uuid; benchmark uuid; first_id uuid;
begin
 select id into v_user from auth.users where not is_anonymous limit 1;
 select id into provider from public.data_providers where provider_code='tiingo';
 select id into benchmark from public.instruments where symbol='QQQ' and currency_code='USD' limit 1;
 perform set_config('test.user',v_user::text,true);
 for a in select ass.assessment_id,ass.instrument_id from public.gpt_market_assessments ass join public.instruments i on i.id=ass.instrument_id where i.currency_code='USD' and i.id<>benchmark and not exists(select 1 from public.shared_decision_calls sc where sc.assessment_id=ass.assessment_id) limit 2 loop
  insert into public.shared_decision_calls(instrument_id,assessment_id,published_at,source_cutoff,action,thesis,risks,model_identity,input_hash,provider_id,benchmark_instrument_id,currency)
  values(a.instrument_id,a.assessment_id,now()-interval '2 days',now()-interval '3 days','BUY','Synthetic transaction-local thesis.','Synthetic transaction-local risk.','fixture',repeat('0',64),provider,benchmark,'USD') returning id into c;
  if first_id is null then first_id:=c; end if;
 end loop;
 if first_id is null then raise exception 'Fixture prerequisites missing'; end if;
 perform set_config('test.call',first_id::text,true);
end $$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.user'),'role','authenticated','is_anonymous',false)::text,true);
do $$
declare r jsonb; next_page jsonb; detail jsonb; total bigint;
begin
 r:=public.shared_decision_dashboard_v1(p_limit=>1);
 if jsonb_array_length(r->'items')<>1 or r->>'nextCursor' is null then raise exception 'Pagination did not return a cursor'; end if;
 next_page:=public.shared_decision_dashboard_v1(p_cursor=>r->>'nextCursor',p_limit=>1);
 if next_page->'items'->0->>'callId'=r->'items'->0->>'callId' then raise exception 'Pagination duplicated row'; end if;
 total:=(r->'counts'->>'watching')::bigint+(r->'counts'->>'awaitingEntry')::bigint+(r->'counts'->>'open')::bigint+(r->'counts'->>'exitSignal')::bigint+(r->'counts'->>'closed')::bigint+(r->'counts'->>'cancelled')::bigint;
 if total<>(r->'counts'->>'trackedCalls')::bigint then raise exception 'Counts mismatch'; end if;
 detail:=public.shared_decision_detail_v1(current_setting('test.call')::uuid);
 if detail->'item'->>'state'<>'AWAITING_ENTRY' then raise exception 'Wrong position state'; end if;
 if detail->'item'->>'dataStatus'<>'UNVERIFIED' or detail->'item'->'performance'<>'null'::jsonb then raise exception 'Unverified evaluation looked healthy'; end if;
 if detail::text like '%secret_fixture%' or detail::text like '%owner_user_id%' then raise exception 'Private evidence leaked'; end if;
 begin perform public.shared_decision_dashboard_v1(p_scope=>'invalid');raise exception 'Invalid filter accepted';
 exception when raise_exception then if sqlerrm<>'Invalid filter' then raise;end if;end;
end $$;
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":true}',true);
do $$ begin
 begin perform public.shared_decision_dashboard_v1(); raise exception 'Anonymous accepted';
 exception when raise_exception then if sqlerrm<>'Permanent sign-in required' then raise;end if;end;
end $$;
reset role;
rollback;
select 'PASS: shared read pagination, scoped count sum, state, unavailable returns, evidence isolation and anonymous rejection; fixtures rolled back' result;
