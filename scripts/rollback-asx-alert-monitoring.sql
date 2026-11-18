-- Recovery under current project lock only; preserves every queue/event/result.
-- Restores the exact pre-release deployed functions. Frontend then reports ASX unverified.
begin;
select pg_advisory_xact_lock(hashtextextended('trading-watchdog',0));
select pg_advisory_xact_lock(hashtextextended('asx-alert-dispatch',0));
-- Reject changed entrypoints. Review remaining helper definitions before recovery.
-- Hash canonical LF definitions only.
do $$
declare expected record;
begin
 for expected in select * from (values
  ('alerting.evaluate_one_v1(uuid,timestamptz)','6c91bf098fc203982cbcd97d14777dc6'),
  ('alerting.run_v1(text,text,uuid,uuid,uuid,timestamptz)','91a2d5f4dbb888fc985fb649234d662d'),
  ('private.trading_pipeline_snapshot_v1(timestamptz)','6d4982e7e91c6f335e687668b3c4b01b'),
  ('private.run_trading_watchdog_v1()','fd0fa3bcbb3c96059d701a8c9a8cc1d3'),
  ('private.enqueue_asx_convergence_alert_v1()','226ff0578bc2e5095c37cdc0abf464c2')
 ) v(signature,hash) loop
  if md5(replace(pg_get_functiondef(expected.signature::regprocedure),chr(13),'')) is distinct from expected.hash
   then raise exception 'Recovery definition drift: %',expected.signature; end if;
 end loop;
 if not exists(select 1 from pg_trigger where tgname='enqueue_asx_convergence_alert'
   and tgrelid='market_convergence.asx_runs_v1'::regclass
   and tgfoid='private.enqueue_asx_convergence_alert_v1()'::regprocedure and tgenabled='O')
 then raise exception 'Recovery trigger drift'; end if;
end $$;
CREATE OR REPLACE FUNCTION alerting.run_v1(p_reason text, p_alert_type text DEFAULT NULL::text, p_instrument_id uuid DEFAULT NULL::uuid, p_theme_id uuid DEFAULT NULL::uuid, p_alert_id uuid DEFAULT NULL::uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare run_id uuid; a record; considered integer:=0; events integer:=0; failures integer:=0; errors text:=''; n integer;
begin
  insert into public.alert_evaluator_runs(reason,alert_type,alert_id,instrument_id,theme_id,metadata) values(p_reason,p_alert_type,p_alert_id,p_instrument_id,p_theme_id,jsonb_build_object('requested_at',p_now)) returning id into run_id;
  for a in
    select al.id from public.alerts al
    where al.is_enabled=true
      and (p_alert_type is null or al.alert_type=p_alert_type)
      and (p_alert_id is null or al.id=p_alert_id)
      and (p_theme_id is null or al.theme_id=p_theme_id)
      and (p_instrument_id is null or al.instrument_id=p_instrument_id or exists(select 1 from public.watchlist_items wi where wi.watchlist_id=al.watchlist_id and wi.instrument_id=p_instrument_id))
  loop
    considered:=considered+1;
    begin
      n:=alerting.evaluate_one_v1(a.id,p_now); events:=events+n;
    exception when others then
      failures:=failures+1; errors:=errors||case when errors='' then '' else E'\n' end||a.id::text||': '||sqlerrm;
    end;
  end loop;
  update public.alert_evaluator_runs set finished_at=clock_timestamp(),status=case when failures=0 then 'succeeded' when failures<considered then 'partial' else 'failed' end,alerts_considered=considered,events_created=events,error_message=nullif(errors,'') where id=run_id;
  return run_id;
exception when others then
  if run_id is not null then update public.alert_evaluator_runs set finished_at=clock_timestamp(),status='failed',error_message=sqlerrm where id=run_id; end if;
  return run_id;
end;
$function$
;
drop trigger if exists enqueue_asx_convergence_alert on market_convergence.asx_runs_v1;
CREATE OR REPLACE FUNCTION alerting.evaluate_one_v1(p_alert_id uuid, p_now timestamp with time zone DEFAULT clock_timestamp())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.alerts%rowtype; sc record; st public.alert_evaluation_state%rowtype; source_key text; source_table text; source_at timestamptz; current_value jsonb; current_conf numeric; methodology text; metric text; op text; threshold numeric; min_conf numeric := 0; current_text text; prior_text text; current_num numeric; prior_num numeric; current_truth boolean; should_trigger boolean; new_rearm integer; v_event_key text; event_inserted bigint; created_events integer := 0; status_value text; inst record; latest_obs record;
begin
  select * into a from public.alerts where id=p_alert_id and is_enabled=true;
  if not found then return 0; end if;
  metric := a.condition ->> 'metric'; op := a.condition ->> 'operator';
  if a.condition ? 'threshold' then threshold := (a.condition ->> 'threshold')::numeric; end if;
  if a.condition ? 'minimum_confidence' then min_conf := (a.condition ->> 'minimum_confidence')::numeric; end if;

  if a.theme_id is not null then
    for sc in select null::uuid as instrument_id, a.theme_id as theme_id loop
      source_key := null; source_table := null; source_at := null; current_value := null; current_conf := null; methodology := null;
      select oa.id::text, 'opportunity_assessments', oa.updated_at,
        case metric when 'opportunity_level' then jsonb_build_object('value',oa.opportunity_level) when 'opportunity_score' then jsonb_build_object('value',oa.opportunity_score) when 'commercial_readiness' then jsonb_build_object('value',oa.commercial_readiness) end,
        oa.opportunity_confidence, oa.methodology_version
      into source_key,source_table,source_at,current_value,current_conf,methodology
      from public.opportunity_assessments oa where oa.theme_id=sc.theme_id
      order by oa.assessment_date desc, oa.updated_at desc, oa.id desc limit 1;
      if source_key is null or (current_conf is not null and current_conf < min_conf) then continue; end if;
      select * into st from public.alert_evaluation_state s where s.alert_id=a.id and s.theme_id=sc.theme_id limit 1;
      if not found then
        insert into public.alert_evaluation_state(alert_id,theme_id,last_source_key,last_source_table,last_source_at,last_value,condition_true,last_evaluated_at,updated_at)
        values(a.id,sc.theme_id,source_key,source_table,source_at,current_value,false,p_now,p_now);
        continue;
      end if;
      if st.last_source_key is not distinct from source_key then update public.alert_evaluation_state set last_evaluated_at=p_now,updated_at=p_now where id=st.id; continue; end if;
      current_text := current_value ->> 'value'; prior_text := st.last_value ->> 'value'; should_trigger := false; current_truth := false;
      if op='enters_value' then current_truth := exists(select 1 from jsonb_array_elements_text(a.condition -> 'values') v where v=current_text); should_trigger := current_truth and not coalesce(st.condition_true,false);
      elsif op='crosses_above' then current_num:=current_text::numeric; prior_num:=nullif(prior_text,'')::numeric; current_truth:=current_num>threshold; should_trigger:=prior_num<=threshold and current_num>threshold;
      elsif op='crosses_below' then current_num:=current_text::numeric; prior_num:=nullif(prior_text,'')::numeric; current_truth:=current_num<threshold; should_trigger:=prior_num>=threshold and current_num<threshold;
      end if;
      new_rearm:=st.rearm_cycle; if coalesce(st.condition_true,false) and not current_truth then new_rearm:=new_rearm+1; end if;
      if should_trigger then
        v_event_key:=source_key||':'||coalesce(metric,'value')||':'||op;
        event_inserted:=null;
        insert into public.alert_events(alert_id,theme_id,triggered_at,trigger_value,message,notification_status,event_key,metadata)
        values(a.id,sc.theme_id,p_now,case when current_text ~ '^-?[0-9]+(\\.[0-9]+)?$' then current_text::numeric else null end,
          a.name||' triggered','not_requested',v_event_key,
          jsonb_build_object('condition_version','alert-trigger-v1','alert_type',a.alert_type,'operator',op,'metric',metric,'source_table',source_table,'source_row_id',source_key,'source_at',source_at,'prior_value',prior_text,'current_value',current_text,'threshold',threshold,'selected_values',a.condition -> 'values','confidence',current_conf,'methodology_version',methodology,'evaluator_version','alert-evaluator-v1','theme_id',sc.theme_id))
        on conflict(alert_id,event_key) do nothing returning id into event_inserted;
        if event_inserted is not null then created_events:=created_events+1; update public.alerts set last_triggered_at=p_now where id=a.id; end if;
      end if;
      update public.alert_evaluation_state set last_source_key=source_key,last_source_table=source_table,last_source_at=source_at,last_value=current_value,condition_true=current_truth,rearm_cycle=new_rearm,last_evaluated_at=p_now,last_triggered_at=case when should_trigger and event_inserted is not null then p_now else last_triggered_at end,updated_at=p_now where id=st.id;
    end loop;
  else
    for sc in
      select a.instrument_id as instrument_id, null::uuid as theme_id where a.instrument_id is not null
      union all
      select wi.instrument_id, null::uuid from public.watchlist_items wi where a.watchlist_id is not null and wi.watchlist_id=a.watchlist_id
    loop
      source_key := null; source_table := null; source_at := null; current_value := null; current_conf := null; methodology := null;
      if a.alert_type='price_threshold' then
        select mo.id::text,'market_observations',mo.observed_at,jsonb_build_object('value',mo.close,'currency_code',btrim(coalesce(mo.currency_code,i.currency_code))),null::numeric,null::text
        into source_key,source_table,source_at,current_value,current_conf,methodology from public.market_observations mo join public.instruments i on i.id=mo.instrument_id where mo.instrument_id=sc.instrument_id and mo.interval_code='quote' and btrim(coalesce(mo.currency_code,i.currency_code))=a.condition ->> 'currency_code' order by mo.observed_at desc,mo.id desc limit 1;
      elsif a.alert_type='data_freshness' then
        select i.id,i.asset_type,i.created_at into inst from public.instruments i where i.id=sc.instrument_id;
        select mo.id,mo.observed_at into latest_obs from public.market_observations mo where mo.instrument_id=sc.instrument_id and mo.interval_code='quote' order by mo.observed_at desc,mo.id desc limit 1;
        status_value:=public.market_freshness_status_v1(inst.asset_type,latest_obs.observed_at,inst.created_at,p_now);
        source_key:=coalesce(latest_obs.id::text,'none')||':'||status_value; source_table:='market_observations+clock'; source_at:=coalesce(latest_obs.observed_at,p_now); current_value:=jsonb_build_object('value',status_value);
      elsif a.alert_type='market_assessment' then
        select g.assessment_id::text,'gpt_market_assessments',g.created_at,
          case metric when 'rating' then jsonb_build_object('value',g.rating) when 'score' then jsonb_build_object('value',g.score) end,
          g.confidence,g.methodology_version
        into source_key,source_table,source_at,current_value,current_conf,methodology
        from public.gpt_market_assessments g join public.gpt_market_runs r on r.run_id=g.run_id and r.status='succeeded' where g.instrument_id=sc.instrument_id order by g.assessment_date desc,g.created_at desc,g.assessment_id desc limit 1;
      elsif a.alert_type='market_convergence' then
        select c.id::text,'market_convergence_assessments',c.updated_at,
          case metric when 'convergence_label' then jsonb_build_object('value',c.convergence_label) when 'convergence_score' then jsonb_build_object('value',c.convergence_score) end,
          c.convergence_confidence,c.methodology_version
        into source_key,source_table,source_at,current_value,current_conf,methodology from public.market_convergence_assessments c where c.instrument_id=sc.instrument_id order by c.assessment_date desc,c.updated_at desc,c.id desc limit 1;
      elsif a.alert_type='technical_score' then
        select m.id::text,'market_scores',m.calculated_at,
          jsonb_build_object('value',case metric when 'overall_score' then m.overall_score when 'momentum_score' then m.momentum_score when 'trend_score' then m.trend_score when 'volatility_score' then m.volatility_score when 'volume_score' then m.volume_score end),
          m.confidence_score,m.methodology_version
        into source_key,source_table,source_at,current_value,current_conf,methodology from public.market_scores m where m.instrument_id=sc.instrument_id and m.score_status='complete' order by m.score_date desc,m.calculated_at desc,m.id desc limit 1;
      end if;
      if source_key is null or current_value is null or (current_conf is not null and current_conf < min_conf) then continue; end if;
      select * into st from public.alert_evaluation_state s where s.alert_id=a.id and s.instrument_id=sc.instrument_id limit 1;
      if not found then
        current_text:=current_value ->> 'value'; current_truth:=false;
        if op in ('enters_value','enters_state') then current_truth:=exists(select 1 from jsonb_array_elements_text(coalesce(a.condition -> 'values',a.condition -> 'states')) v where v=current_text);
        elsif op='crosses_above' then current_truth:=current_text::numeric>threshold;
        elsif op='crosses_below' then current_truth:=current_text::numeric<threshold;
        end if;
        insert into public.alert_evaluation_state(alert_id,instrument_id,last_source_key,last_source_table,last_source_at,last_value,condition_true,last_evaluated_at,updated_at)
        values(a.id,sc.instrument_id,source_key,source_table,source_at,current_value,current_truth,p_now,p_now);
        continue;
      end if;
      if st.last_source_key is not distinct from source_key then update public.alert_evaluation_state set last_evaluated_at=p_now,updated_at=p_now where id=st.id; continue; end if;
      current_text:=current_value ->> 'value'; prior_text:=st.last_value ->> 'value'; should_trigger:=false; current_truth:=false;
      if op in ('enters_value','enters_state') then current_truth:=exists(select 1 from jsonb_array_elements_text(coalesce(a.condition -> 'values',a.condition -> 'states')) v where v=current_text); should_trigger:=current_truth and not coalesce(st.condition_true,false);
      elsif op='changes' then current_truth:=false; should_trigger:=prior_text is distinct from current_text;
      elsif op='crosses_above' then current_num:=current_text::numeric; prior_num:=nullif(prior_text,'')::numeric; current_truth:=current_num>threshold; should_trigger:=prior_num<=threshold and current_num>threshold;
      elsif op='crosses_below' then current_num:=current_text::numeric; prior_num:=nullif(prior_text,'')::numeric; current_truth:=current_num<threshold; should_trigger:=prior_num>=threshold and current_num<threshold;
      end if;
      new_rearm:=st.rearm_cycle; if coalesce(st.condition_true,false) and not current_truth then new_rearm:=new_rearm+1; end if;
      if should_trigger then
        if a.alert_type='data_freshness' then v_event_key:=sc.instrument_id::text||':'||current_text||':'||new_rearm::text; else v_event_key:=source_key||':'||coalesce(metric,'value')||':'||op; end if;
        event_inserted:=null;
        insert into public.alert_events(alert_id,instrument_id,triggered_at,trigger_value,message,notification_status,event_key,metadata)
        values(a.id,sc.instrument_id,p_now,case when current_text ~ '^-?[0-9]+(\\.[0-9]+)?$' then current_text::numeric else null end,
          a.name||' triggered for '||(select i.symbol from public.instruments i where i.id=sc.instrument_id),'not_requested',v_event_key,
          jsonb_build_object('condition_version','alert-trigger-v1','alert_type',a.alert_type,'operator',op,'metric',metric,'source_table',source_table,'source_row_id',source_key,'source_at',source_at,'prior_value',prior_text,'current_value',current_text,'threshold',threshold,'selected_values',coalesce(a.condition -> 'values',a.condition -> 'states'),'confidence',current_conf,'methodology_version',methodology,'evaluator_version','alert-evaluator-v1','instrument_id',sc.instrument_id,'watchlist_id',a.watchlist_id,'rearm_cycle',new_rearm))
        on conflict(alert_id,event_key) do nothing returning id into event_inserted;
        if event_inserted is not null then created_events:=created_events+1; update public.alerts set last_triggered_at=p_now where id=a.id; end if;
      end if;
      update public.alert_evaluation_state set last_source_key=source_key,last_source_table=source_table,last_source_at=source_at,last_value=current_value,condition_true=current_truth,rearm_cycle=new_rearm,last_evaluated_at=p_now,last_triggered_at=case when should_trigger and event_inserted is not null then p_now else last_triggered_at end,updated_at=p_now where id=st.id;
    end loop;
  end if;
  if a.watchlist_id is not null then delete from public.alert_evaluation_state s where s.alert_id=a.id and s.instrument_id is not null and not exists(select 1 from public.watchlist_items wi where wi.watchlist_id=a.watchlist_id and wi.instrument_id=s.instrument_id); end if;
  return created_events;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.trading_pipeline_snapshot_v1(p_now timestamp with time zone)
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
end $function$
;
CREATE OR REPLACE FUNCTION private.run_trading_watchdog_v1()
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'pg_catalog'
AS $function$ select private.reconcile_trading_watchdog_v1(clock_timestamp()); $function$
;
commit;
