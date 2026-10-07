-- All fixture rows are transaction-local; actual published records remain intact.
begin;
do $coverage$
declare stock uuid; owner uuid; template jsonb; ass uuid; run uuid; cutoff timestamptz; saved_at timestamptz;
 rec1 uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1'; rec2 uuid:='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2';
 p jsonb; item jsonb; j integer; before_trials bigint; before_events bigint; rejected boolean;
begin
 select i.id,to_jsonb(a) into stock,template from public.instruments i join public.gpt_market_assessments a on a.instrument_id=i.id
 where exists(select 1 from public.watchlist_items wi where wi.instrument_id=i.id) order by i.symbol,a.created_at desc limit 1;
 select w.owner_user_id into owner from public.watchlist_items wi join public.watchlists w on w.id=wi.watchlist_id where wi.instrument_id=stock limit 1;
 if stock is null or owner is null then raise exception 'COVERAGE_FIXTURE_PREREQUISITES_MISSING';end if;
 select count(*) into before_trials from private.shared_action_trials;
 select count(*) into before_events from (select id from public.shared_decision_calls union all select id from public.shared_decision_reviews) e;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated','is_anonymous',false)::text,true);
 cutoff:=clock_timestamp();
 for j in 1..5 loop
  -- 1 saved scheduled; 2 unpublished manual; 3 incomplete scheduled;
  -- 4/5 published manual with equal cutoff/time and stable record-ID tie.
  insert into public.gpt_market_runs(analysis_cutoff_time,status,model_name,prompt_version,analysis_mode,tickers_requested,tickers_completed,completed_at,notes)
  values(cutoff,case when j=3 then 'running' else 'succeeded' end,'coverage-rollback-model','coverage-rollback-v1',case when j in(2,4,5) then 'manual' else 'scheduled' end,
   1,1,case when j=3 then null else clock_timestamp() end,'Coverage rollback-only fixture') returning run_id into run;
  ass:=gen_random_uuid();
  insert into public.gpt_market_assessments select (jsonb_populate_record(null::public.gpt_market_assessments,
   template||jsonb_build_object('assessment_id',ass,'run_id',run,'rating','Hold','assessment_date',(cutoff at time zone 'America/New_York')::date,
   'created_at',clock_timestamp(),'technical_engine_input_used',false,'methodology_version','independent-market-ai-v1'))).*;
  if j=1 then
   p:=public.watchlist_ai_recommendations_v1();select v into item from jsonb_array_elements(p->'items') v where v->>'instrument_id'=stock::text;
   if item->>'assessment_id'<>ass::text or item->>'source_kind'<>'SCHEDULED_ASSESSMENT' or item->>'ai_action' is not null then raise exception 'SCHEDULED_COVERAGE_FAILURE';end if;
   perform set_config('test.coverage_scheduled',ass::text,true);
  elsif j in(2,3) then
   p:=public.watchlist_ai_recommendations_v1();select v into item from jsonb_array_elements(p->'items') v where v->>'instrument_id'=stock::text;
   if item->>'assessment_id'<>current_setting('test.coverage_scheduled') then raise exception 'UNPUBLISHED_MANUAL_OR_INCOMPLETE_EXPOSED';end if;
  elsif j in(4,5) then
   if j=4 then saved_at:=clock_timestamp();end if;
   insert into public.shared_research_recommendations(id,assessment_id,instrument_id,published_at,source_cutoff,action,thesis,risks,model_identity,input_hash,measurement_blocker)
   values(case when j=4 then rec1 else rec2 end,ass,stock,saved_at,cutoff,'WAIT','Coverage rollback-only saved WAIT thesis.','Coverage rollback-only saved risk evidence.','coverage-rollback-model',repeat('f',64),'Coverage fixture remains research only and not measurable.');
   p:=public.watchlist_ai_recommendations_v1();select v into item from jsonb_array_elements(p->'items') v where v->>'instrument_id'=stock::text;
   if item->>'saved_record_id'<>(case when j=4 then rec1 else rec2 end)::text or item->>'source_kind'<>'RESEARCH_ONLY'
    or item->>'ai_action'<>'WAIT' or item->>'rating'<>'Hold' then raise exception 'SAVED_ACTION_TIMESTAMP_OR_RECORD_TIE_FAILURE';end if;
  end if;
 end loop;
 -- A later genuine research cutoff wins even with no saved action.
 cutoff:=clock_timestamp();
 insert into public.gpt_market_runs(analysis_cutoff_time,status,model_name,prompt_version,analysis_mode,tickers_requested,tickers_completed,completed_at)
 values(cutoff,'partial','coverage-rollback-model','coverage-rollback-v1','scheduled',1,1,clock_timestamp()) returning run_id into run;
 ass:=gen_random_uuid();
 insert into public.gpt_market_assessments select (jsonb_populate_record(null::public.gpt_market_assessments,
  template||jsonb_build_object('assessment_id',ass,'run_id',run,'rating','Hold','assessment_date',(cutoff at time zone 'America/New_York')::date,
  'created_at',clock_timestamp(),'technical_engine_input_used',false,'methodology_version','independent-market-ai-v1'))).*;
 p:=public.watchlist_ai_recommendations_v1();select v into item from jsonb_array_elements(p->'items') v where v->>'instrument_id'=stock::text;
 if item->>'assessment_id'<>ass::text or item->>'source_kind'<>'SCHEDULED_ASSESSMENT' then raise exception 'LATEST_CUTOFF_PRIORITY_FAILURE';end if;
 if p::text like '%owner_user_id%' or p::text like '%raw_payload%' or p::text like '%private_notes%' then raise exception 'UNSAFE_RECOMMENDATION_PROJECTION';end if;
 if before_trials<>(select count(*) from private.shared_action_trials) or before_events<>(select count(*) from (select id from public.shared_decision_calls union all select id from public.shared_decision_reviews) e) then raise exception 'COVERAGE_CHANGED_PERFORMANCE';end if;
 perform set_config('test.coverage_owner',owner::text,true);
end $coverage$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.coverage_owner'),'role','authenticated','is_anonymous',false)::text,true);
do $auth$
declare p jsonb; rejected boolean;
begin
 p:=public.watchlist_ai_recommendations_v1();if p->>'contractVersion'<>'1' then raise exception 'AUTHENTICATED_READER_FAILURE';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','is_anonymous',false)::text,true);
 p:=public.watchlist_ai_recommendations_v1();if jsonb_array_length(p->'items')<>0 then raise exception 'OWNER_SCOPE_LEAK';end if;
 perform set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":true}',true);
 rejected:=false;begin perform public.watchlist_ai_recommendations_v1();exception when raise_exception then if SQLERRM<>'Permanent sign-in required' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'ANONYMOUS_COVERAGE_ACCEPTED';end if;
end $auth$;
reset role;
rollback;
select 'PASS: owner-only recommendation coverage, unpublished manual/incomplete exclusion, cutoff/timestamp/record ties, WAIT action vs Hold rating, performance unchanged and auth rejection; rollback only' result;
