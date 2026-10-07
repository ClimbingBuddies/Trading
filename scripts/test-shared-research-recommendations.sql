-- Synthetic assessments/recommendations only inside this rollback transaction.
begin;
do $fixture$
declare stock uuid; ass_template jsonb; ev_template jsonb; run uuid; ass uuid; rec uuid; first_rec uuid;
 cutoff timestamptz; bundle jsonb; hash text; before_events bigint; receipt uuid; bad_receipt uuid; mismatch_receipt uuid; ev_id uuid;
 owner uuid; other uuid:=gen_random_uuid(); rejected boolean; j integer; ids uuid[]:='{}';
begin
 select i.id,to_jsonb(a) into stock,ass_template from public.instruments i join public.gpt_market_assessments a on a.instrument_id=i.id
 where i.exchange_code='ASX' and i.is_active and i.asset_type='equity'
 and exists(select 1 from public.watchlist_items wi where wi.instrument_id=i.id)
 and not exists(select 1 from private.shared_decision_config c where c.instrument_id=i.id and c.enabled)
 order by i.symbol,a.created_at desc limit 1;
 select to_jsonb(e) into ev_template from public.gpt_market_evidence e
 where e.assessment_id=(ass_template->>'assessment_id')::uuid limit 1;
 select w.owner_user_id into owner from public.watchlist_items wi join public.watchlists w on w.id=wi.watchlist_id where wi.instrument_id=stock limit 1;
 if stock is null or ev_template is null or owner is null then raise exception 'RESEARCH_FIXTURE_PREREQUISITES_MISSING';end if;
 insert into private.shared_research_source_receipts(source_url,summary,content_hash)
 values('https://example.com/rollback-only-source','Synthetic rollback-only source evidence collected before cutoff.',repeat('c',64)) returning id into receipt;
 insert into private.shared_research_source_receipts(source_url,summary,content_hash)
 values('https://example.com/different-source','Synthetic rollback-only source evidence collected before cutoff.',repeat('e',64)) returning id into mismatch_receipt;
 cutoff:=clock_timestamp();
 select count(*) into before_events from (select id from public.shared_decision_calls union all select id from public.shared_decision_reviews) e;
 for j in 1..2 loop
  insert into public.gpt_market_runs(analysis_cutoff_time,status,model_name,prompt_version,analysis_mode,tickers_requested,tickers_completed,completed_at,notes)
  values(cutoff,'succeeded','rollback-model','rollback-v1','manual',1,1,clock_timestamp(),'Rollback-only research fixture') returning run_id into run;
  ass:=gen_random_uuid();ids:=array_append(ids,ass);
  insert into public.gpt_market_assessments select (jsonb_populate_record(null::public.gpt_market_assessments,
   ass_template||jsonb_build_object('assessment_id',ass,'run_id',run,'assessment_date',(cutoff at time zone 'America/New_York')::date,
   'created_at',clock_timestamp(),'technical_engine_input_used',false,'methodology_version','independent-market-ai-v1'))).*;
  ev_id:=gen_random_uuid();
  insert into public.gpt_market_evidence select (jsonb_populate_record(null::public.gpt_market_evidence,
   ev_template||jsonb_build_object('evidence_id',ev_id,'assessment_id',ass,'instrument_opinion_id',null,
   'source_url','https://example.com/rollback-only-source','evidence_text','Synthetic rollback-only source evidence collected before cutoff.'))).*;
  rejected:=false;
  begin perform private.shared_research_input_v1(ass);exception when raise_exception then if SQLERRM<>'DIRECT_SOURCE_CUTOFF_PROOF_REQUIRED' then raise;end if;rejected:=true;end;
  if not rejected then raise exception 'MISSING_CUTOFF_PROOF_ACCEPTED';end if;
  rejected:=false;
  begin
   insert into private.shared_research_source_receipts(source_url,summary,content_hash)
   values('https://example.com/rollback-only-source','Synthetic rollback-only source evidence collected before cutoff.',repeat('d',64)) returning id into bad_receipt;
   insert into private.shared_research_evidence_links values(ev_id,bad_receipt);
   perform private.shared_research_input_v1(ass);
  exception when raise_exception then if SQLERRM<>'DIRECT_SOURCE_CUTOFF_PROOF_REQUIRED' then raise;end if;rejected:=true;end;
  if not rejected then raise exception 'FUTURE_CUTOFF_PROOF_ACCEPTED';end if;
  rejected:=false;
  begin
   insert into private.shared_research_evidence_links values(ev_id,mismatch_receipt);
   perform private.shared_research_input_v1(ass);
  exception when raise_exception then if SQLERRM<>'DIRECT_SOURCE_CUTOFF_PROOF_REQUIRED' then raise;end if;rejected:=true;end;
  if not rejected then raise exception 'MISMATCHED_SOURCE_PROOF_ACCEPTED';end if;
  insert into private.shared_research_evidence_links values(ev_id,receipt);
  bundle:=private.shared_research_input_v1(ass);
  if bundle#>>'{assessment,analysis_mode}'<>'manual' or bundle->>'includedInPerformance'<>'false' then raise exception 'MANUAL_COMPLETED_INPUT_FAILURE';end if;
  hash:=encode(sha256(convert_to(bundle::text,'UTF8')),'hex');
  rejected:=false;
  begin perform private.publish_shared_research_v1(ass,'WAIT','Rollback-only saved research thesis.','Rollback-only saved research risks.','rollback-model',repeat('0',64),'No verified ASX benchmark and session attribution.');
  exception when raise_exception then if SQLERRM<>'INPUT_HASH_MISMATCH' then raise;end if;rejected:=true;end;
  if not rejected then raise exception 'INPUT_HASH_TAMPER_ACCEPTED';end if;
  rec:=private.publish_shared_research_v1(ass,'WAIT','Rollback-only saved research thesis.','Rollback-only saved research risks.','rollback-model',hash,'No verified ASX benchmark and session attribution.');
  if j=1 then first_rec:=rec;end if;
  if private.publish_shared_research_v1(ass,'WAIT','Rollback-only saved research thesis.','Rollback-only saved research risks.','rollback-model',hash,'No verified ASX benchmark and session attribution.')<>rec then raise exception 'EXACT_RETRY_FAILURE';end if;
  if (select snapshot from private.shared_research_evidence where recommendation_id=rec) is distinct from bundle then raise exception 'FROZEN_BUNDLE_MISMATCH';end if;
  rejected:=false;
  begin perform private.publish_shared_research_v1(ass,'BUY','Rollback-only saved research thesis.','Rollback-only saved research risks.','rollback-model',hash,'No verified ASX benchmark and session attribution.');
  exception when raise_exception then if SQLERRM<>'ASSESSMENT_RETRY_PAYLOAD_MISMATCH' then raise;end if;rejected:=true;end;
  if not rejected then raise exception 'DIVERGENT_RETRY_ACCEPTED';end if;
 end loop;
 if before_events<>(select count(*) from (select id from public.shared_decision_calls union all select id from public.shared_decision_reviews) e) then raise exception 'RESEARCH_ENTERED_PERFORMANCE_EVENTS';end if;
 rejected:=false;
 begin update public.shared_research_recommendations set action='BUY' where id=rec;exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'RECOMMENDATION_MUTATION_ACCEPTED';end if;
 rejected:=false;
 begin update private.shared_research_evidence set snapshot='{}' where recommendation_id=rec;exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'PRIVATE_BUNDLE_MUTATION_ACCEPTED';end if;
 rejected:=false;
 begin update private.shared_research_source_receipts set summary='Changed source provenance must remain immutable.' where id=receipt;exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'SOURCE_RECEIPT_MUTATION_ACCEPTED';end if;
 rejected:=false;
 begin delete from private.shared_research_evidence_links where evidence_id=ev_id;exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'SOURCE_LINK_DELETE_ACCEPTED';end if;
 if has_table_privilege('authenticated','public.shared_research_recommendations','INSERT') or has_table_privilege('authenticated','private.shared_research_evidence','SELECT')
 or has_function_privilege('service_role','private.publish_shared_research_v1(uuid,text,text,text,text,text,text)','EXECUTE') then raise exception 'WRITER_OR_EVIDENCE_PRIVILEGE_FAILURE';end if;
 perform set_config('test.research_stock',stock::text,true);perform set_config('test.research_latest',rec::text,true);perform set_config('test.research_first',first_rec::text,true);
 perform set_config('test.research_owner',owner::text,true);perform set_config('test.research_other',other::text,true);
end $fixture$;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.research_owner'),'role','authenticated','is_anonymous',false)::text,true);
do $read$
declare p jsonb; item jsonb; rejected boolean;
begin
 p:=public.shared_research_recommendations_v1('watched');
 select v into item from jsonb_array_elements(p->'items') v where v#>>'{instrument,id}'=current_setting('test.research_stock');
 if item is null or item#>>'{latest,id}'<>current_setting('test.research_latest')
 or item->>'includedInPerformance'<>'false' or item->>'measurementStatus'<>'NOT_MEASURABLE'
 or not exists(select 1 from jsonb_array_elements(item->'history') v where v->>'id'=current_setting('test.research_first')) then raise exception 'WATCHED_LATEST_HISTORY_FAILURE';end if;
 if p::text like '%owner_user_id%' or p::text like '%raw_payload%' then raise exception 'PRIVATE_BUNDLE_LEAK';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.research_other'),'role','authenticated','is_anonymous',false)::text,true);
 p:=public.shared_research_recommendations_v1('watched');
 if jsonb_array_length(p->'items')<>0 then raise exception 'WATCHED_OWNER_SCOPE_FAILURE';end if;
 p:=public.shared_research_recommendations_v1('all');
 if not exists(select 1 from jsonb_array_elements(p->'items') v where v#>>'{latest,id}'=current_setting('test.research_latest')) then raise exception 'SHARED_ALL_SCOPE_FAILURE';end if;
 rejected:=false;
 begin perform public.shared_research_recommendations_v1('invalid');exception when raise_exception then if SQLERRM<>'Invalid filter' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'INVALID_SCOPE_ACCEPTED';end if;
 perform set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":true}',true);
 rejected:=false;
 begin perform public.shared_research_recommendations_v1('all');exception when raise_exception then if SQLERRM<>'Permanent sign-in required' then raise;end if;rejected:=true;end;
 if not rejected then raise exception 'ANONYMOUS_RESEARCH_ACCEPTED';end if;
end $read$;
reset role;
do $archive$
declare stock uuid:=current_setting('test.research_stock')::uuid; ass uuid; provider uuid; benchmark uuid;
 latest_at timestamptz; p jsonb; original_count bigint;
begin
 select published_at into latest_at from public.shared_research_recommendations where id=current_setting('test.research_latest')::uuid;
 select assessment_id into ass from public.shared_research_recommendations where id=current_setting('test.research_first')::uuid;
 select id into provider from public.data_providers where provider_code='tiingo';
 select id into benchmark from public.instruments where symbol='QQQ' and exchange_code='NASDAQ' limit 1;
 select count(*) into original_count from public.shared_research_recommendations where instrument_id=stock;
 insert into public.shared_decision_calls(instrument_id,assessment_id,published_at,source_cutoff,action,thesis,risks,model_identity,input_hash,provider_id,benchmark_instrument_id,currency)
 values(stock,ass,latest_at-interval '1 second',latest_at-interval '1 hour','WAIT','Rollback-only older measured path fixture.','Rollback-only fixture has no actual performance.','rollback-model',repeat('a',64),provider,benchmark,'AUD');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.research_owner'),'role','authenticated','is_anonymous',false)::text,true);
 p:=public.shared_research_recommendations_v1('all');
 if not exists(select 1 from jsonb_array_elements(p->'items') v where v#>>'{latest,id}'=current_setting('test.research_latest')) then raise exception 'OLDER_CALL_WRONGLY_ARCHIVES_RESEARCH';end if;
 select assessment_id into ass from public.shared_research_recommendations where id=current_setting('test.research_latest')::uuid;
 insert into public.shared_decision_calls(instrument_id,assessment_id,published_at,source_cutoff,action,thesis,risks,model_identity,input_hash,provider_id,benchmark_instrument_id,currency)
 values(stock,ass,clock_timestamp(),latest_at-interval '1 hour','WAIT','Rollback-only newer measured path fixture.','Rollback-only fixture has no actual performance.','rollback-model',repeat('b',64),provider,benchmark,'AUD');
 p:=public.shared_research_recommendations_v1('all');
 if exists(select 1 from jsonb_array_elements(p->'items') v where v#>>'{instrument,id}'=stock::text) then raise exception 'NEWER_CALL_ARCHIVE_FAILURE';end if;
 if original_count<>(select count(*) from public.shared_research_recommendations where instrument_id=stock)
 or not exists(select 1 from private.shared_research_evidence where recommendation_id=current_setting('test.research_latest')::uuid) then raise exception 'ARCHIVE_DELETED_IMMUTABLE_RESEARCH';end if;
end $archive$;
rollback;
select 'PASS: rollback-only research publication, exact retries, immutable bundles, manual runs, watched-owner isolation, shared latest/history and performance exclusion' result;
