-- Transactional integration test: all fixture rows are rolled back.
begin;
do $$
declare call_id uuid; ass uuid; stock uuid; provider uuid; benchmark uuid; owner_id uuid;
begin
 select a.assessment_id,a.instrument_id into ass,stock from public.gpt_market_assessments a
 join public.instruments i on i.id=a.instrument_id where i.currency_code='USD' and i.symbol<>'QQQ' limit 1;
 select id into provider from public.data_providers where provider_code='tiingo';
 select id into benchmark from public.instruments where symbol='QQQ' and currency_code='USD' limit 1;
 select id into owner_id from auth.users where is_anonymous=false limit 1;
 if ass is null or stock is null or provider is null or benchmark is null or owner_id is null then
  raise exception 'Test prerequisites missing';
 end if;
 insert into public.shared_decision_calls(instrument_id,assessment_id,source_cutoff,action,thesis,risks,model_identity,input_hash,provider_id,benchmark_instrument_id,currency)
 values(stock,ass,clock_timestamp(),'WAIT','Transactional test fixture only.','Fixture is rolled back and never published.','test',repeat('0',64),provider,benchmark,'USD') returning id into call_id;
 perform set_config('test.shared_call',call_id::text,true);
 perform set_config('test.owner',owner_id::text,true);
 perform set_config('test.request',gen_random_uuid()::text,true);
end $$;

set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.owner'),'role','authenticated','is_anonymous',false)::text,true);
do $$
declare first_id uuid; again_id uuid;
begin
 if not exists(select 1 from public.shared_decision_calls where id=current_setting('test.shared_call')::uuid) then raise exception 'Owner cannot read shared call'; end if;
 first_id:=public.append_shared_decision_private_note(current_setting('test.shared_call')::uuid,'NOTE','A private test note',current_setting('test.request')::uuid);
 again_id:=public.append_shared_decision_private_note(current_setting('test.shared_call')::uuid,'NOTE','A private test note',current_setting('test.request')::uuid);
 if first_id<>again_id then raise exception 'Idempotency failed'; end if;
 if (select count(*) from public.shared_decision_private_notes where call_id=current_setting('test.shared_call')::uuid)<>1 then raise exception 'Owner note visibility failed'; end if;
 begin
  perform public.append_shared_decision_private_note(current_setting('test.shared_call')::uuid,'NOTE','Different note with same request',current_setting('test.request')::uuid);
  raise exception 'Expected request mismatch rejection';
 exception when raise_exception then
  if sqlerrm<>'Request identifier already used' then raise; end if;
 end;
 begin
  update public.shared_decision_calls set action='BUY' where id=current_setting('test.shared_call')::uuid;
  raise exception 'Authenticated update unexpectedly allowed';
 exception when insufficient_privilege then null;
 end;
end $$;

-- Simulate a different signed-in subject: shared call visible, private note invisible.
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','is_anonymous',false)::text,true);
do $$ begin
 if not exists(select 1 from public.shared_decision_calls where id=current_setting('test.shared_call')::uuid) then raise exception 'Other user cannot read shared call'; end if;
 if exists(select 1 from public.shared_decision_private_notes where call_id=current_setting('test.shared_call')::uuid) then raise exception 'Private note leaked'; end if;
end $$;

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.owner'),'role','authenticated','is_anonymous',true)::text,true);
do $$ begin
 if exists(select 1 from public.shared_decision_calls where id=current_setting('test.shared_call')::uuid) then raise exception 'Anonymous session can read shared call'; end if;
 begin
  perform public.append_shared_decision_private_note(current_setting('test.shared_call')::uuid,'NOTE','Anonymous note must fail',gen_random_uuid());
  raise exception 'Anonymous note unexpectedly allowed';
 exception when raise_exception then
  if sqlerrm<>'Permanent sign-in required' then raise; end if;
 end;
end $$;

reset role;
do $$ begin
 begin
  update public.shared_decision_calls set action='BUY' where id=current_setting('test.shared_call')::uuid;
  raise exception 'Immutability trigger did not reject update';
 exception when raise_exception then
  if sqlerrm='Immutability trigger did not reject update' then raise; end if;
 end;
 if has_table_privilege('anon','public.shared_decision_calls','SELECT') then raise exception 'Anon table grant exists'; end if;
 if has_table_privilege('authenticated','public.shared_decision_calls','INSERT') then raise exception 'Client publication grant exists'; end if;
 if has_table_privilege('authenticated','private.shared_decision_evidence','SELECT') then raise exception 'Raw evidence exposed'; end if;
end $$;
rollback;
select 'PASS: shared access, private isolation, note retry, mismatch rejection, client write denial, anonymous denial, immutable call, private evidence; fixtures rolled back' as result;
