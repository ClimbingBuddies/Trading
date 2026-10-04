-- Additive operational monitoring; never writes research, decisions, prices or notes.
begin;
create table private.trading_controller_attempts (
 id uuid primary key default gen_random_uuid(), morning_date date not null,
 stage text not null check(stage in ('opportunity','external','market','publication','evaluation','preflight')),
 spec_revision text not null check(spec_revision ~ '^[0-9a-f]{40}$'),
 started_at timestamptz not null default clock_timestamp(), finished_at timestamptz,
 state text not null default 'running' check(state in ('running','completed','partial','blocked','failed')),
 reason_code text check(reason_code ~ '^[A-Z0-9_]{1,100}$')
);
create index trading_controller_attempt_date on private.trading_controller_attempts(morning_date,stage,started_at desc);
create table private.trading_pipeline_mornings (
 morning_date date primary key, checked_at timestamptz not null, deadline timestamptz not null,
 state text not null, summary jsonb not null
);
create table private.trading_pipeline_incidents (
 id uuid primary key default gen_random_uuid(), incident_key text not null unique,
 morning_date date not null, code text not null, opened_at timestamptz not null default clock_timestamp(),
 last_seen_at timestamptz not null default clock_timestamp(), resolved_at timestamptz,
 detail jsonb not null
);
alter table private.trading_controller_attempts enable row level security;
alter table private.trading_pipeline_mornings enable row level security;
alter table private.trading_pipeline_incidents enable row level security;
revoke all on private.trading_controller_attempts,private.trading_pipeline_mornings,private.trading_pipeline_incidents from public,anon,authenticated,service_role;

-- Called by the existing privileged controller before work. The receipt is not a completion claim.
create function private.claim_trading_stage_v1(p_stage text,p_revision text) returns uuid
language plpgsql set search_path=pg_catalog as $$
declare ident uuid; day date:=(clock_timestamp() at time zone 'Australia/Perth')::date;
begin
 perform pg_advisory_xact_lock(hashtextextended('trading-controller:'||day::text,0));
 if exists(select 1 from private.trading_controller_attempts where morning_date=day and state='running'
 and started_at>clock_timestamp()-interval '45 minutes') then raise exception 'CONTROLLER_STAGE_ALREADY_RUNNING'; end if;
 if (select count(*) from private.trading_controller_attempts where morning_date=day and stage=p_stage)>=(case when p_stage='preflight' then 6 else 2 end)
 then raise exception 'STAGE_RETRY_BUDGET_EXHAUSTED'; end if;
 insert into private.trading_controller_attempts(morning_date,stage,spec_revision) values(day,p_stage,p_revision) returning id into ident;
 return ident;
end $$;
create function private.finish_trading_stage_v1(p_attempt uuid,p_state text,p_reason text default null) returns void
language plpgsql set search_path=pg_catalog as $$
begin
 if p_state='running' then raise exception 'TERMINAL_RECEIPT_REQUIRED'; end if;
 update private.trading_controller_attempts set state=p_state,reason_code=p_reason,finished_at=clock_timestamp()
 where id=p_attempt and state='running';
 if not found then raise exception 'ATTEMPT_ALREADY_FINISHED_OR_MISSING'; end if;
end $$;

-- Private diagnostic clock permits rollback-only tests. Public clients cannot choose a clock.
create function private.trading_pipeline_snapshot_v1(p_now timestamptz) returns jsonb
language plpgsql set search_path=pg_catalog as $$
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
      join private.shared_evaluator_release rel on rel.accepted_revision=er.spec_revision and rel.enabled
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
end $$;

create function private.reconcile_trading_watchdog_v1(p_now timestamptz) returns jsonb
language plpgsql set search_path=pg_catalog as $$
declare now_at timestamptz:=p_now; snap jsonb; problem jsonb; day date; keys text[]:='{}'; key text;
begin
 perform pg_advisory_xact_lock(hashtextextended('trading-watchdog',0));
 snap:=private.trading_pipeline_snapshot_v1(now_at); day:=(snap->>'morningDate')::date;
 insert into private.trading_pipeline_mornings values(day,now_at,(snap->>'deadline')::timestamptz,snap->>'state',snap)
 on conflict(morning_date) do update set checked_at=excluded.checked_at,state=excluded.state,summary=excluded.summary;
 if day>=date '2026-10-05' then
  for problem in select value from jsonb_array_elements(snap->'problems') loop
   key:=day::text||':'||(problem->>'code'); keys:=array_append(keys,key);
   insert into private.trading_pipeline_incidents(incident_key,morning_date,code,detail) values(key,day,problem->>'code',problem)
   on conflict(incident_key) do update set last_seen_at=now_at,detail=excluded.detail,resolved_at=null;
  end loop;
  -- Only a recheck of this morning resolves its incidents; preserve unresolved older days.
  update private.trading_pipeline_incidents set resolved_at=now_at where morning_date=day and resolved_at is null and not (incident_key=any(keys));
 end if;
 return snap;
end $$;

create function private.run_trading_watchdog_v1() returns jsonb
language sql set search_path=pg_catalog as $$ select private.reconcile_trading_watchdog_v1(clock_timestamp()); $$;

create function public.trading_pipeline_status_v1() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare snap jsonb; incidents jsonb; latest_ok timestamptz;
begin
 if auth.uid() is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Permanent sign-in required'; end if;
 select summary into snap from private.trading_pipeline_mornings order by morning_date desc limit 1;
 select max(checked_at) into latest_ok from private.trading_pipeline_mornings where state='COMPLETE';
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'date',morning_date,'code',code,'openedAt',opened_at,'message',detail->>'message','nextAction',detail->>'nextAction') order by opened_at desc),'[]') into incidents
 from (select * from private.trading_pipeline_incidents where resolved_at is null order by opened_at desc limit 20) x;
 return jsonb_build_object('contractVersion',1,'snapshot',snap,'lastCompletedMorningAt',latest_ok,'incidents',incidents);
end $$;
revoke all on function private.claim_trading_stage_v1(text,text),private.finish_trading_stage_v1(uuid,text,text),private.trading_pipeline_snapshot_v1(timestamptz),private.reconcile_trading_watchdog_v1(timestamptz),private.run_trading_watchdog_v1() from public,anon,authenticated,service_role;
revoke all on function public.trading_pipeline_status_v1() from public,anon,service_role;
grant execute on function public.trading_pipeline_status_v1() to authenticated;
commit;
