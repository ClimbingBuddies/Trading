-- Separate controller source provenance from the approved evaluator release.
-- No approval, calculation, stored receipt or outcome is rewritten.
begin;
do $guard$
begin
 if not pg_try_advisory_xact_lock(hashtextextended('trading-watchdog',0)) then raise exception 'Trading watchdog running'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('shared-evaluation-runner',0)) then raise exception 'Shared evaluation running'; end if;
 if exists(select 1 from private.shared_evaluation_runs where status='running') then raise exception 'Unresolved shared evaluation'; end if;
 if md5(replace(pg_get_functiondef('private.run_shared_evaluation_v1(uuid,text,text)'::regprocedure),chr(13),''))<>'012417b1cd996a75e83139fa277e517b'
 or md5(replace(pg_get_functiondef('private.trading_pipeline_core_snapshot_v1(timestamptz)'::regprocedure),chr(13),''))<>'a31c65572116c60459b1b17cae1639cc'
 then raise exception 'Evaluator provenance baseline drift'; end if;
 if exists(select 1 from pg_attribute where attrelid='private.shared_evaluation_runs'::regclass
   and attname='evaluator_revision' and not attisdropped) then
  raise exception 'Evaluator provenance column already exists; review retained recovery state'; end if;
end $guard$;
alter table private.shared_evaluation_runs add column evaluator_revision text
 constraint shared_evaluation_runs_evaluator_revision_check check(evaluator_revision ~ '^[0-9a-f]{40,64}$');
comment on column private.shared_evaluation_runs.evaluator_revision is
 'Database-captured enabled evaluator approval at execution. Null for legacy or unapproved attempts; never inferred from controller source.';
CREATE OR REPLACE FUNCTION private.run_shared_evaluation_v1(p_request uuid, p_spec_revision text, p_origin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare run private.shared_evaluation_runs%rowtype; item record; result jsonb; reason text; succeeded int:=0; blocked int:=0;
 approved_revision text; release_enabled boolean;
begin
 if current_setting('transaction_isolation')<>'serializable' then raise exception 'SERIALIZABLE_TRANSACTION_REQUIRED'; end if;
 perform pg_advisory_xact_lock(hashtextextended('shared-evaluation-runner',0));
 select * into run from private.shared_evaluation_runs where id=p_request;
 if found then
  if run.spec_revision is distinct from p_spec_revision or run.origin is distinct from p_origin then raise exception 'RUN_RETRY_PAYLOAD_MISMATCH'; end if;
  return to_jsonb(run);
 end if;
 -- Replay above preserves its original provenance even if approval later changes.
 -- Lock is outside item subtransactions and lasts until the caller commits.
 select accepted_revision,enabled into approved_revision,release_enabled
 from private.shared_evaluator_release where singleton for share;
 if not coalesce(release_enabled and approved_revision ~ '^[0-9a-f]{40,64}$',false) then
  approved_revision:=null;
 end if;
 insert into private.shared_evaluation_runs(id,spec_revision,origin,evaluator_revision)
 values(p_request,p_spec_revision,p_origin,approved_revision);
 for item in select id,instrument_id from public.shared_decision_calls c where not exists(select 1 from public.shared_decision_outcomes o where o.call_id=c.id and o.kind in('EXIT','CANCELLED')) order by c.instrument_id loop
  begin
   if approved_revision is null then raise exception 'SHARED_EVALUATOR_ADAPTER_NOT_VERIFIED'; end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION private.trading_pipeline_core_snapshot_v1(p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare day date:=(p_now at time zone 'Australia/Perth')::date; nyday date;
 deadline timestamptz; calendar private.shared_market_calendars%rowtype; session_day jsonb;
 market_due boolean; problems jsonb:='[]'; instruments jsonb:='[]'; item record; ass record;
 opportunity public.opportunity_assessment_runs%rowtype; opinion public.opinion_reviews%rowtype;
 attempt private.trading_controller_attempts%rowtype;
 checked int:=0; published int:=0; evaluated int:=0; supported int:=0; blocked int:=0;
 reason text; calreason text; cycle_uuid uuid; bundle jsonb; used record; eval_ok boolean;
 market_run_ids uuid[]:='{}'; last_research timestamptz; latest_finish timestamptz;
begin
 deadline:=(day+time '10:15') at time zone 'Australia/Perth';
 nyday:=(((day+time '09:30') at time zone 'Australia/Perth') at time zone 'America/New_York')::date;
 select * into calendar from private.shared_market_calendars where exchange_code='NASDAQ'
 and verified_at<=p_now and coverage_start<=((nyday::timestamp) at time zone 'America/New_York')
 and coverage_end>p_now order by verified_at desc limit 1;
 if calendar.id is null or calendar.valid_until<=p_now then calreason:='CALENDAR_VERIFICATION_REQUIRED';
 elsif calendar.valid_until<=p_now+interval '48 hours' then calreason:='CALENDAR_VERIFICATION_EXPIRING'; end if;
 if calendar.id is not null then select value into session_day from jsonb_array_elements(calendar.days) where value->>'date'=nyday::text; end if;
 market_due:=extract(isodow from nyday)<6 and (session_day is null or session_day->>'status'='OPEN');
 -- Missing trust never converts a trading day into a successful holiday skip.
 if calreason is not null then problems:=problems||jsonb_build_array(jsonb_build_object('code',calreason,'message','Trading calendar needs official-source verification','nextAction','Verify the official exchange calendar and import a new immutable revision','expiresAt',calendar.valid_until)); end if;
 select * into opportunity from public.opportunity_assessment_runs where assessment_date=day and started_at<=p_now order by started_at desc limit 1;
 if p_now>=deadline and (opportunity.run_id is null or opportunity.status<>'succeeded' or opportunity.completed_at is null or opportunity.completed_at>p_now or opportunity.themes_completed<opportunity.themes_requested)
 then problems:=problems||jsonb_build_array(jsonb_build_object('code','OPPORTUNITY_INCOMPLETE','message','Daily opportunity research has not completed','nextAction','Inspect the Opportunity receipt and safely resume its existing run')); end if;
 if market_due then
  select * into opinion from public.opinion_reviews where review_date=nyday and triggered_by='scheduled-external-opinion-review' and started_at<=p_now order by started_at desc limit 1;
  if p_now>=deadline and (opinion.id is null or opinion.completed_at is null or opinion.completed_at>p_now or opinion.status not in ('succeeded','partial')) then
   problems:=problems||jsonb_build_array(jsonb_build_object('code','EXTERNAL_REVIEW_INCOMPLETE','message','External research prerequisite has not completed','nextAction','Resume or truthfully finalise the same-date external review')); end if;
 end if;
 for item in select i.* from public.instruments i where exists(select 1 from public.watchlist_items w where w.instrument_id=i.id)
 or exists(select 1 from public.shared_decision_calls c where c.instrument_id=i.id and not exists(select 1 from public.shared_decision_outcomes o where o.call_id=c.id and o.kind in ('EXIT','CANCELLED'))) order by i.symbol loop
  reason:=null; cycle_uuid:=null; eval_ok:=false;
  select null::uuid assessment_id,null::uuid run_id,null::timestamptz created_at,null::timestamptz completed_at,null::timestamptz analysis_cutoff_time into ass;
  if not item.is_active or not exists(select 1 from private.shared_decision_config cfg where cfg.instrument_id=item.id and cfg.enabled) then reason:='INSTRUMENT_NOT_CONFIGURED'; blocked:=blocked+1;
  else
   supported:=supported+1;
   if market_due then
    select a.assessment_id,a.run_id,a.created_at,r.completed_at,r.analysis_cutoff_time into ass
    from public.gpt_market_assessments a join public.gpt_market_runs r using(run_id)
    where a.instrument_id=item.id and not a.technical_engine_input_used and r.analysis_mode='scheduled'
    and r.status in ('succeeded','partial') and r.completed_at<=p_now and a.created_at<=p_now
    and r.analysis_cutoff_time>=deadline-interval '24 hours' and r.analysis_cutoff_time<=r.completed_at
    and (r.analysis_cutoff_time at time zone 'America/New_York')::date=nyday
    order by a.created_at desc limit 1;
    if ass.assessment_id is null then reason:='FRESH_RESEARCH_MISSING';
    else
     checked:=checked+1; market_run_ids:=array_append(market_run_ids,ass.run_id);
     select * into used from private.shared_decision_assessment_usage where assessment_id=ass.assessment_id;
     if used.assessment_id is null then
      begin bundle:=private.shared_decision_input_v1(ass.assessment_id); reason:='PUBLICATION_MISSING';
      exception when others then reason:=case when SQLSTATE='P0001' and SQLERRM ~ '^[A-Z0-9_]{1,100}$' then SQLERRM else 'INPUT_VALIDATION_FAILED' end; end;
     else
      published:=published+1; cycle_uuid:=used.call_id;
      select exists(select 1 from private.shared_evaluation_run_items eri join private.shared_evaluation_runs er on er.id=eri.run_id
      join private.shared_evaluator_release rel on rel.enabled and
       (rel.accepted_revision=er.evaluator_revision or
        -- Legacy receipts retain the pre-repair exact-match rule, without backfill.
        (er.evaluator_revision is null and rel.accepted_revision=er.spec_revision))
      where eri.call_id=cycle_uuid and eri.status='evaluated' and er.origin='scheduled' and er.completed_at<=p_now
      and er.started_at>=coalesce((select published_at from public.shared_decision_reviews where id=used.event_id),(select published_at from public.shared_decision_calls where id=used.event_id))
      and (er.started_at at time zone 'Australia/Perth')::date=day) into eval_ok;
      if eval_ok then evaluated:=evaluated+1; else reason:='EVALUATION_MISSING'; end if;
     end if;
    end if;
   end if;
  end if;
  instruments:=instruments||jsonb_build_array(jsonb_build_object('symbol',item.symbol,'supported',reason is distinct from 'INSTRUMENT_NOT_CONFIGURED','assessmentId',ass.assessment_id,'callId',cycle_uuid,'evaluated',eval_ok,'reason',reason));
 end loop;
 if market_due and p_now>=deadline and (checked<supported or published<supported or evaluated<supported or supported=0) then
  problems:=problems||jsonb_build_array(jsonb_build_object('code','DECISION_PIPELINE_INCOMPLETE','message','Expected Decision Lab research, calls or evaluations are missing','nextAction','Review per-share blockers; resume eligible supported shares without backdating')); end if;
 select * into attempt from private.trading_controller_attempts where morning_date=day and started_at<=p_now order by started_at desc limit 1;
 if day>=date '2026-10-05' and p_now>=deadline and attempt.id is null then problems:=problems||jsonb_build_array(jsonb_build_object('code','CONTROLLER_NOT_SEEN','message','No controller invocation receipt was saved this morning','nextAction','Check the local computer, app, quota, project folder and task history')); end if;
 if exists(select 1 from private.trading_controller_attempts where morning_date=day and state='running' and started_at<p_now-interval '45 minutes') then
  problems:=problems||jsonb_build_array(jsonb_build_object('code','CONTROLLER_STALLED','message','A controller attempt has not finished within 45 minutes','nextAction','Inspect the original run before any safe retry; do not race active work')); end if;
 select max(created_at) into last_research from public.gpt_market_assessments where created_at<=p_now;
 select max(completed_at) into latest_finish from public.gpt_market_runs where status in ('succeeded','partial') and completed_at<=p_now;
 return jsonb_build_object('contractVersion',1,'morningDate',day,'marketSession',nyday,'marketDue',market_due,'deadline',deadline,'checkedAt',p_now,
 'state',case when day<date '2026-10-05' then 'SETUP' when p_now<deadline then 'PENDING' when jsonb_array_length(problems)>0 then 'ATTENTION' when blocked>0 then 'PARTIAL' else 'COMPLETE' end,
 'lastResearchAt',last_research,'lastResearchRunCompletedAt',latest_finish,'controllerLastSeenAt',attempt.started_at,
 'nextExpectedAt',case when p_now<deadline then deadline else ((day+1+time '10:15') at time zone 'Australia/Perth') end,
 'counts',jsonb_build_object('supported',supported,'blocked',blocked,'researched',checked,'published',published,'evaluated',evaluated),
 'marketRunIds',to_jsonb(market_run_ids),'opportunityRunId',opportunity.run_id,'opinionReviewId',opinion.id,
 'problems',problems,'instruments',instruments,'calendarExpiresAt',calendar.valid_until);
end $function$
;
-- CREATE OR REPLACE preserves the existing postgres-only ACLs.
commit;
