-- Projection-only synthetic fixtures. Every DDL/DML below is rolled back.
-- Caller separately records this query before execution and compares afterward:
-- select md5(pg_get_functiondef('private.shared_action_read_blocker_v1(uuid,uuid,integer)'::regprocedure));
-- execute_sql may wrap the entire batch, so session settings cannot survive rollback reliably.
begin;
create function pg_temp.action_status_assessment(p_stock uuid) returns uuid language plpgsql as $$
declare template jsonb; run uuid; ass uuid:=gen_random_uuid();
begin
 select to_jsonb(a) into template from public.gpt_market_assessments a where a.instrument_id=p_stock order by created_at desc limit 1;
 if template is null then raise exception 'ASSESSMENT_FIXTURE_REQUIRED';end if;
 insert into public.gpt_market_runs(analysis_cutoff_time,status,model_name,prompt_version,analysis_mode,tickers_requested,tickers_completed,completed_at)
 values(clock_timestamp()-interval '1 hour','succeeded','action-status-rollback-model','action-status-rollback-v1','manual',1,1,clock_timestamp()) returning run_id into run;
 insert into public.gpt_market_assessments select (jsonb_populate_record(null::public.gpt_market_assessments,
 template||jsonb_build_object('assessment_id',ass,'run_id',run,'created_at',clock_timestamp()))).*;
 return ass;
end $$;
do $fixtures$
declare owner uuid; watched uuid; unwatched uuid; provider uuid; benchmark uuid; s uuid; c uuid; j integer;
 c1 uuid:='ffffffff-ffff-4fff-8fff-fffffffffff1';c2 uuid:='dddddddd-dddd-4ddd-8ddd-ddddddddddd2';c3 uuid:='dddddddd-dddd-4ddd-8ddd-ddddddddddd3';
begin
 select w.owner_user_id into owner from public.watchlists w join public.watchlist_items wi on wi.watchlist_id=w.id group by w.owner_user_id order by count(distinct wi.instrument_id) desc limit 1;
 select i.id into watched from public.instruments i where i.symbol='AVGO' and exists(select 1 from public.watchlist_items wi join public.watchlists w on w.id=wi.watchlist_id where wi.instrument_id=i.id and w.owner_user_id=owner) limit 1;
 select i.id into unwatched from public.instruments i where i.symbol='NVDA' and not exists(select 1 from public.watchlist_items wi join public.watchlists w on w.id=wi.watchlist_id where wi.instrument_id=i.id and w.owner_user_id=owner) limit 1;
 select id into provider from public.data_providers where provider_code='tiingo';select id into benchmark from public.instruments where symbol='QQQ' and exchange_code='NASDAQ' limit 1;
 if watched is null or unwatched is null or owner is null then raise exception 'ACTION_STATUS_FIXTURE_PREREQUISITES_MISSING';end if;
 for j in 1..3 loop
  c:=case j when 1 then c1 when 2 then c2 else c3 end;s:=case j when 2 then unwatched else watched end;
  insert into public.shared_decision_calls(id,instrument_id,assessment_id,published_at,source_cutoff,action,thesis,risks,model_identity,input_hash,provider_id,benchmark_instrument_id,currency)
  values(c,s,pg_temp.action_status_assessment(s),'2026-01-01T10:00:00Z','2026-01-01T09:00:00Z','BUY','Rollback-only immutable action status original.','Rollback-only immutable risk evidence.','action-status-rollback-model',repeat('1',64),provider,benchmark,'USD');
 end loop;
 insert into public.shared_decision_reviews(id,call_id,assessment_id,published_at,source_cutoff,action,thesis,risks,model_identity,input_hash)
 values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',c1,pg_temp.action_status_assessment(watched),'2026-01-01T10:00:00Z','2026-01-01T09:00:00Z','HOLD','Rollback-only same-time review with smaller UUID.','Rollback-only immutable risk evidence.','action-status-rollback-model',repeat('2',64)),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',c2,pg_temp.action_status_assessment(unwatched),'2026-01-01T10:00:00Z','2026-01-01T09:00:00Z','REDUCE','Rollback-only same-time review with larger UUID.','Rollback-only immutable risk evidence.','action-status-rollback-model',repeat('3',64));
 perform set_config('test.action_status_owner',owner::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated','is_anonymous',false)::text,true);
end $fixtures$;
set local role authenticated;
do $reader$
declare p jsonb; item jsonb; rejected boolean; bad uuid[];
 c1 uuid:='ffffffff-ffff-4fff-8fff-fffffffffff1';c2 uuid:='dddddddd-dddd-4ddd-8ddd-ddddddddddd2';c3 uuid:='dddddddd-dddd-4ddd-8ddd-ddddddddddd3';
begin
 p:=public.shared_decision_action_status_v1(array[c2,c1,c2,c3],'all',5);
 if p->>'contractVersion'<>'1' or p->>'horizon'<>'5' or jsonb_array_length(p->'items')<>3
 or p#>>'{items,0,callId}'<>c2::text or p#>>'{items,0,eventId}'<>'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2'
 or p#>>'{items,1,eventId}'<>c1::text then raise exception 'REQUEST_ORDER_DEDUP_OR_UUID_TIE_FAILURE';end if;
 for item in select value from jsonb_array_elements(p->'items') loop
  if item->>'status'<>'pending' or item->>'actionReturn' is not null or item->>'asOf' is not null or item->>'blocker' is not null then raise exception 'MISSING_TRIAL_FABRICATED_RETURN';end if;
 end loop;
 p:=public.shared_decision_action_status_v1(array[c2,c1,c3],'watched',20);
 if jsonb_array_length(p->'items')<>2 or exists(select 1 from jsonb_array_elements(p->'items') x where x->>'callId'=c2::text) then raise exception 'WATCHED_OWNER_LEAK';end if;
 p:=public.shared_decision_action_status_v1('{}'::uuid[]);if jsonb_array_length(p->'items')<>0 then raise exception 'EMPTY_REQUEST_FAILURE';end if;
 p:=public.shared_decision_action_status_v1(array[gen_random_uuid()]);if jsonb_array_length(p->'items')<>0 then raise exception 'UNKNOWN_CALL_FABRICATED';end if;
 foreach bad slice 1 in array array[array[c1,null::uuid],array[null::uuid,null::uuid]] loop
  rejected:=false;begin perform public.shared_decision_action_status_v1(bad);exception when raise_exception then if SQLERRM<>'Invalid filter' then raise;end if;rejected:=true;end;if not rejected then raise exception 'NULL_MEMBER_ACCEPTED';end if;
 end loop;
 rejected:=false;begin perform public.shared_decision_action_status_v1(null);exception when raise_exception then if SQLERRM<>'Invalid filter' then raise;end if;rejected:=true;end;if not rejected then raise exception 'NULL_REQUEST_ACCEPTED';end if;
 rejected:=false;begin perform public.shared_decision_action_status_v1(array_fill(c1,array[101]));exception when raise_exception then if SQLERRM<>'Invalid filter' then raise;end if;rejected:=true;end;if not rejected then raise exception 'OVERSIZE_REQUEST_ACCEPTED';end if;
 p:=public.shared_decision_action_status_v1(array_fill(c1,array[100]));if jsonb_array_length(p->'items')<>1 then raise exception 'MAXIMUM_REQUEST_DEDUP_FAILURE';end if;
 rejected:=false;begin perform public.shared_decision_action_status_v1(array_fill(c1,array[2,2]));exception when raise_exception then if SQLERRM<>'Invalid filter' then raise;end if;rejected:=true;end;if not rejected then raise exception 'MULTIDIMENSIONAL_REQUEST_ACCEPTED';end if;
 rejected:=false;begin perform public.shared_decision_action_status_v1(array[c1],'invalid',5);exception when raise_exception then if SQLERRM<>'Invalid filter' then raise;end if;rejected:=true;end;if not rejected then raise exception 'INVALID_SCOPE_ACCEPTED';end if;
 rejected:=false;begin perform public.shared_decision_action_status_v1(array[c1],'all',6);exception when raise_exception then if SQLERRM<>'Invalid filter' then raise;end if;rejected:=true;end;if not rejected then raise exception 'INVALID_HORIZON_ACCEPTED';end if;
 rejected:=false;begin perform public.shared_decision_action_status_v1(array[c1],null,5);exception when raise_exception then if SQLERRM<>'Invalid filter' then raise;end if;rejected:=true;end;if not rejected then raise exception 'NULL_SCOPE_ACCEPTED';end if;
 rejected:=false;begin perform public.shared_decision_action_status_v1(array[c1],'all',null);exception when raise_exception then if SQLERRM<>'Invalid filter' then raise;end if;rejected:=true;end;if not rejected then raise exception 'NULL_HORIZON_ACCEPTED';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.action_status_owner'),'role','authenticated','is_anonymous',true)::text,true);
 rejected:=false;begin perform public.shared_decision_action_status_v1(array[c1]);exception when raise_exception then if SQLERRM<>'Permanent sign-in required' then raise;end if;rejected:=true;end;if not rejected then raise exception 'ANONYMOUS_REQUEST_ACCEPTED';end if;
 perform set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false}',true);
 rejected:=false;begin perform public.shared_decision_action_status_v1(array[c1]);exception when raise_exception then if SQLERRM<>'Permanent sign-in required' then raise;end if;rejected:=true;end;if not rejected then raise exception 'NULL_SUBJECT_ACCEPTED';end if;
end $reader$;
reset role;
do $newer_review$
declare c uuid:='dddddddd-dddd-4ddd-8ddd-ddddddddddd2'; stock uuid; p jsonb;
begin
 select instrument_id into stock from public.shared_decision_calls where id=c;
 insert into public.shared_decision_reviews(id,call_id,assessment_id,published_at,source_cutoff,action,thesis,risks,model_identity,input_hash)
 values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',c,pg_temp.action_status_assessment(stock),'2026-01-01T10:01:00Z','2026-01-01T09:01:00Z','REDUCE','Rollback-only newer review with smaller UUID.','Rollback-only immutable risk evidence.','action-status-rollback-model',repeat('4',64));
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.action_status_owner'),'role','authenticated','is_anonymous',false)::text,true);
 p:=public.shared_decision_action_status_v1(array[c]);
 if p#>>'{items,0,eventId}'<>'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' then raise exception 'LATEST_REVIEW_TIME_PRIORITY_FAILURE';end if;
end $newer_review$;
-- Isolated projection fixture: shadow only inside rollback, never real verified evidence.
create or replace function private.shared_action_read_blocker_v1(p_call uuid,p_event uuid,p_horizon integer) returns text
language plpgsql stable security definer set search_path=pg_catalog as $$ begin return null;end $$;
do $projection$
declare c uuid:='ffffffff-ffff-4fff-8fff-fffffffffff1';p jsonb;path jsonb; trial_result jsonb;
begin
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.action_status_owner'),'role','authenticated','is_anonymous',false)::text,true);
 select jsonb_agg(jsonb_build_object('session',jsonb_build_object('closes_at','2026-01-'||lpad((d+2)::text,2,'0')||'T16:00:00Z')) order by d) into path from generate_series(0,5) d;
 trial_result:=jsonb_build_object('metrics',jsonb_build_object('actionReturn',0.125),'path',path,'private_secret','Must never leak');
 insert into private.shared_action_trials values(c,c,5,'matured',null,trial_result,clock_timestamp());
 p:=public.shared_decision_action_status_v1(array[c]);
 if p#>>'{items,0,status}'<>'matured' or (p#>>'{items,0,actionReturn}')::numeric<>0.125 or p#>>'{items,0,asOf}'<>'2026-01-07T16:00:00.000Z' or p#>>'{items,0,blocker}' is not null then raise exception 'VERIFIED_PROJECTION_ARITHMETIC_FAILURE';end if;
 if p::text like '%private_secret%' or p::text like '%path%' or p::text like '%model_identity%' then raise exception 'RAW_EVIDENCE_PROJECTION_LEAK';end if;
 update private.shared_action_trials t set result=jsonb_set(t.result,'{metrics,actionReturn}','"0.125"') where event_id=c and horizon=5;
 p:=public.shared_decision_action_status_v1(array[c]);
 if p#>>'{items,0,status}'<>'blocked' or p#>>'{items,0,blocker}'<>'ACTION_RESULT_UNVERIFIED' or p#>>'{items,0,actionReturn}' is not null or p#>>'{items,0,asOf}' is not null then raise exception 'UNVERIFIED_DECIMAL_NOT_BLOCKED';end if;
 update private.shared_action_trials t set result=t.result- 'metrics',status='blocked',blocker='Private exception detail https://secret.example' where event_id=c and horizon=5;
 p:=public.shared_decision_action_status_v1(array[c]);if p#>>'{items,0,blocker}'<>'ACTION_EVIDENCE_UNVERIFIED' then raise exception 'UNSAFE_BLOCKER_EXPOSED';end if;
 update private.shared_action_trials set status='matured',blocker=null,result=jsonb_build_object('metrics',jsonb_build_object('actionReturn',0.125),'path',path) where event_id=c and horizon=5;
end $projection$;
create or replace function private.shared_action_read_blocker_v1(p_call uuid,p_event uuid,p_horizon integer) returns text
language plpgsql stable security definer set search_path=pg_catalog as $$ begin return 'PINNED_EVIDENCE_REVISED';end $$;
do $revision$
declare p jsonb;
begin
 p:=public.shared_decision_action_status_v1(array['ffffffff-ffff-4fff-8fff-fffffffffff1'::uuid]);
 if p#>>'{items,0,status}'<>'blocked' or p#>>'{items,0,blocker}'<>'PINNED_EVIDENCE_REVISED' or p#>>'{items,0,actionReturn}' is not null or p#>>'{items,0,asOf}' is not null then raise exception 'CURRENT_EVIDENCE_REVISION_NOT_WITHHELD';end if;
 if has_function_privilege('anon','public.shared_decision_action_status_v1(uuid[],text,integer)','EXECUTE') or has_function_privilege('service_role','public.shared_decision_action_status_v1(uuid[],text,integer)','EXECUTE') then raise exception 'READER_ACL_FAILURE';end if;
end $revision$;
rollback;
do $restore$ begin
 if exists(select 1 from public.gpt_market_runs where model_name='action-status-rollback-model') or exists(select 1 from public.shared_decision_calls where model_identity='action-status-rollback-model') then raise exception 'ACTION_STATUS_FIXTURE_NOT_ROLLED_BACK';end if;
end $restore$;
select 'PASS: authenticated scoped action projection, request validation/order/ties, pending nulls, verified decimal projection, safe blockers, revision withholding; all fixtures rolled back' result,
 md5(pg_get_functiondef('private.shared_action_read_blocker_v1(uuid,uuid,integer)'::regprocedure)) restored_read_blocker_hash;
