-- Preserve deployed core monitoring; add separately labelled current ASX health.
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
  order by al.id
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
-- Existing alert entrypoint delegates to the same serialized evaluator.
CREATE OR REPLACE FUNCTION alerting.evaluate_one_scoped_v1(p_alert_id uuid, p_now timestamp with time zone, p_instrument_id uuid, p_assessment_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.alerts%rowtype; sc record; st public.alert_evaluation_state%rowtype; source_key text; source_table text; source_at timestamptz; current_value jsonb; current_conf numeric; methodology text; metric text; op text; threshold numeric; min_conf numeric := 0; current_text text; prior_text text; current_num numeric; prior_num numeric; current_truth boolean; should_trigger boolean; new_rearm integer; v_event_key text; event_inserted bigint; created_events integer := 0; status_value text; inst record; latest_obs record;
begin
  if p_assessment_id is not null then
    select * into a from public.alerts where id=p_alert_id and is_enabled=true for update nowait;
  else
    select * into a from public.alerts where id=p_alert_id and is_enabled=true for update;
  end if;
  if not found then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('alert-rule:'||p_alert_id::text,0));
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
        values(a.id,sc.theme_id,p_now,case when current_text ~ '^-?[0-9]+([.][0-9]+)?$' then current_text::numeric else null end,
          a.name||' triggered','not_requested',v_event_key,
          jsonb_build_object('condition_version','alert-trigger-v1','alert_type',a.alert_type,'operator',op,'metric',metric,'source_table',source_table,'source_row_id',source_key,'source_at',source_at,'prior_value',prior_text,'current_value',current_text,'threshold',threshold,'selected_values',a.condition -> 'values','confidence',current_conf,'methodology_version',methodology,'evaluator_version','alert-evaluator-v1','theme_id',sc.theme_id))
        on conflict(alert_id,event_key) do nothing returning id into event_inserted;
        if event_inserted is not null then created_events:=created_events+1; update public.alerts set last_triggered_at=p_now where id=a.id; end if;
      end if;
      update public.alert_evaluation_state set last_source_key=source_key,last_source_table=source_table,last_source_at=source_at,last_value=current_value,condition_true=current_truth,rearm_cycle=new_rearm,last_evaluated_at=p_now,last_triggered_at=case when should_trigger and event_inserted is not null then p_now else last_triggered_at end,updated_at=p_now where id=st.id;
    end loop;
  else
    for sc in
      select a.instrument_id as instrument_id, null::uuid as theme_id where a.instrument_id is not null and (p_instrument_id is null or a.instrument_id=p_instrument_id)
      union all
      select wi.instrument_id, null::uuid from public.watchlist_items wi where a.watchlist_id is not null and wi.watchlist_id=a.watchlist_id and (p_instrument_id is null or wi.instrument_id=p_instrument_id)
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
        into source_key,source_table,source_at,current_value,current_conf,methodology from public.market_convergence_assessments c join public.instruments i on i.id=c.instrument_id
        where c.instrument_id=sc.instrument_id and c.created_at<=p_now
          and c.methodology_version=case when i.exchange_code='ASX' then 'market-convergence-asx-v1' else 'market-convergence-v1' end
          and (p_assessment_id is null or c.id=p_assessment_id)
          and (i.exchange_code is distinct from 'ASX' or exists(select 1 from market_convergence.asx_runs_v1 r where r.assessment_id=c.id and r.status='succeeded' and r.finished_at<=p_now))
        order by c.assessment_date desc,c.updated_at desc,c.id desc limit 1;
      elsif a.alert_type='technical_score' then
        select m.id::text,'market_scores',m.calculated_at,
          jsonb_build_object('value',case metric when 'overall_score' then m.overall_score when 'momentum_score' then m.momentum_score when 'trend_score' then m.trend_score when 'volatility_score' then m.volatility_score when 'volume_score' then m.volume_score end),
          m.confidence_score,m.methodology_version
        into source_key,source_table,source_at,current_value,current_conf,methodology from public.market_scores m where m.instrument_id=sc.instrument_id and m.score_status='complete' order by m.score_date desc,m.calculated_at desc,m.id desc limit 1;
      end if;
      if source_key is null or current_value is null or (current_conf is not null and current_conf < min_conf) then continue; end if;
      -- A delayed queue must not cross a changed rule's baseline or newer source.
      if p_assessment_id is not null and (a.updated_at>source_at or exists(select 1 from public.watchlist_items wi where wi.watchlist_id=a.watchlist_id and wi.instrument_id=sc.instrument_id and wi.added_at>source_at)) then continue; end if;
      if a.alert_type='market_convergence' and exists (
        select 1 from public.alert_evaluation_state s join public.market_convergence_assessments prior on prior.id::text=s.last_source_key
        join public.market_convergence_assessments current on current.id::text=source_key
        where s.alert_id=a.id and s.instrument_id=sc.instrument_id and prior.methodology_version=current.methodology_version
          and (prior.assessment_date,prior.updated_at,prior.id)>(current.assessment_date,current.updated_at,current.id)) then continue; end if;
      -- A methodology switch establishes a new baseline, never a cross-method event.
      if a.alert_type='market_convergence' then
        delete from public.alert_evaluation_state s using public.market_convergence_assessments prior
        where s.alert_id=a.id and s.instrument_id=sc.instrument_id and prior.id::text=s.last_source_key
          and prior.methodology_version is distinct from methodology;
      end if;
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
        values(a.id,sc.instrument_id,p_now,case when current_text ~ '^-?[0-9]+([.][0-9]+)?$' then current_text::numeric else null end,
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
revoke all on function alerting.evaluate_one_scoped_v1(uuid,timestamptz,uuid,uuid) from public,anon,authenticated,service_role;
create or replace function alerting.evaluate_one_v1(p_alert_id uuid,p_now timestamptz default clock_timestamp())
returns integer language sql security definer set search_path='' as $$
 select alerting.evaluate_one_scoped_v1(p_alert_id,p_now,null,null);
$$;
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
revoke all on function private.trading_pipeline_core_snapshot_v1(timestamptz) from public,anon,authenticated,service_role;

create table private.asx_convergence_alert_queue (
 assessment_id uuid primary key references public.market_convergence_assessments(id),
 convergence_run_id uuid not null references market_convergence.asx_runs_v1(id),
 instrument_id uuid not null references public.instruments(id),
 state text not null check(state in ('pending','baseline_no_replay','evaluated','no_rules','superseded','failed','exhausted')),
 attempts integer not null default 0 check(attempts between 0 and 3),
 alert_run_ids uuid[] not null default '{}',
 created_at timestamptz not null default clock_timestamp(), checked_at timestamptz,
 next_attempt_at timestamptz not null default clock_timestamp(), reason_code text,
 check(cardinality(alert_run_ids)=attempts)
);
create index asx_alert_queue_run on private.asx_convergence_alert_queue(convergence_run_id);
create index asx_alert_queue_instrument on private.asx_convergence_alert_queue(instrument_id);
create index asx_alert_queue_pending on private.asx_convergence_alert_queue(next_attempt_at) where state in ('pending','failed');
alter table private.asx_convergence_alert_queue enable row level security;
revoke all on private.asx_convergence_alert_queue from public,anon,authenticated,service_role;

-- Installation does not replay historical crossings.
insert into private.asx_convergence_alert_queue(assessment_id,convergence_run_id,instrument_id,state,checked_at)
select distinct on (assessment_id) assessment_id,id,instrument_id,'baseline_no_replay',clock_timestamp()
from market_convergence.asx_runs_v1 where status='succeeded' and assessment_id is not null
order by assessment_id,started_at,id;

create function private.enqueue_asx_convergence_alert_v1() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='succeeded' and old.status is distinct from new.status then
  insert into private.asx_convergence_alert_queue(assessment_id,convergence_run_id,instrument_id,state)
  values(new.assessment_id,new.id,new.instrument_id,'pending') on conflict(assessment_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function private.enqueue_asx_convergence_alert_v1() from public,anon,authenticated,service_role;
create trigger enqueue_asx_convergence_alert after update of status on market_convergence.asx_runs_v1
for each row execute function private.enqueue_asx_convergence_alert_v1();

-- Latest-only coalescing is explicit; superseded rows never claim delivery.
-- Event/state changes for a failed batch roll back together; the attempt remains.
create function private.dispatch_asx_convergence_alerts_v1(p_now timestamptz default clock_timestamp()) returns integer
language plpgsql security invoker set search_path='pg_catalog' as $$
declare q record; a record; latest uuid; run_id uuid; considered integer; events integer; processed integer:=0; failed boolean; v_reason text;
begin
 if p_now is null or not isfinite(p_now) then raise exception 'Invalid dispatch clock'; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('asx-alert-dispatch',0)) then return 0; end if;
 for q in select * from private.asx_convergence_alert_queue where state in ('pending','failed')
   and attempts<3 and created_at<=p_now and next_attempt_at<=p_now order by next_attempt_at,created_at,assessment_id limit 10 for update skip locked
 loop
  processed:=processed+1;
  select c.id into latest from public.market_convergence_assessments c
   join public.instruments i on i.id=c.instrument_id
   where c.instrument_id=q.instrument_id and i.exchange_code='ASX' and i.is_active
     and c.methodology_version='market-convergence-asx-v1' and c.created_at<=p_now
     and exists(select 1 from market_convergence.asx_runs_v1 r where r.assessment_id=c.id and r.status='succeeded' and r.finished_at<=p_now)
   order by c.assessment_date desc,c.updated_at desc,c.id desc limit 1;
  if latest is distinct from q.assessment_id then
   update private.asx_convergence_alert_queue set state='superseded',checked_at=p_now,reason_code='NOT_CURRENT_RESULT' where assessment_id=q.assessment_id;
   continue;
  end if;
  insert into public.alert_evaluator_runs(reason,alert_type,instrument_id,metadata)
   values('asx-convergence-queue','market_convergence',q.instrument_id,
     jsonb_build_object('requested_at',p_now,'assessment_id',q.assessment_id,'attempt',q.attempts+1)) returning id into run_id;
  considered:=0;events:=0;failed:=false;v_reason:=null;
  begin
   if (select count(*) from public.alerts al where al.is_enabled and al.alert_type='market_convergence'
     and (al.instrument_id=q.instrument_id or exists(select 1 from public.watchlist_items wi
       join public.watchlists w on w.id=wi.watchlist_id where wi.watchlist_id=al.watchlist_id
         and w.owner_user_id=al.owner_user_id and wi.instrument_id=q.instrument_id)))>50 then
    raise exception using errcode='54000',message='ASX_ALERT_RULE_LIMIT';
   end if;
   for a in select al.id from public.alerts al where al.is_enabled and al.alert_type='market_convergence'
     and (al.instrument_id=q.instrument_id or exists(select 1 from public.watchlist_items wi
       join public.watchlists w on w.id=wi.watchlist_id where wi.watchlist_id=al.watchlist_id
         and w.owner_user_id=al.owner_user_id and wi.instrument_id=q.instrument_id)) order by al.id limit 51
   loop
    if considered=50 then raise exception using errcode='54000',message='ASX_ALERT_RULE_LIMIT'; end if;
    considered:=considered+1;
    events:=events+alerting.evaluate_one_scoped_v1(a.id,p_now,q.instrument_id,q.assessment_id);
   end loop;
  exception when lock_not_available then
   failed:=true;events:=0;v_reason:='ASX_ALERT_LOCK_BUSY';
  when others then
   failed:=true;events:=0;v_reason:=case when SQLSTATE='54000' then 'ASX_ALERT_RULE_LIMIT' else 'ASX_ALERT_EVALUATION_FAILED' end;
  end;
  update public.alert_evaluator_runs set status=case when failed then 'failed' else 'succeeded' end,
    finished_at=p_now,alerts_considered=considered,events_created=events,error_message=v_reason where id=run_id;
  if v_reason='ASX_ALERT_LOCK_BUSY' then
   update private.asx_convergence_alert_queue set checked_at=p_now,next_attempt_at=p_now+interval '15 minutes',
     reason_code=v_reason where assessment_id=q.assessment_id;
   continue;
  end if;
  update private.asx_convergence_alert_queue set attempts=attempts+1,alert_run_ids=array_append(alert_run_ids,run_id),
    state=case when failed then case when attempts+1>=3 then 'exhausted' else 'failed' end
      when considered=0 then 'no_rules' else 'evaluated' end,
    checked_at=p_now,next_attempt_at=p_now+interval '15 minutes',reason_code=v_reason where assessment_id=q.assessment_id;
 end loop;
 return processed;
end $$;
revoke all on function private.dispatch_asx_convergence_alerts_v1(timestamptz) from public,anon,authenticated,service_role;

create table private.asx_convergence_monitor_state (
 singleton boolean primary key default true check(singleton), snapshot jsonb,
 incident_opened_at timestamptz, incident_resolved_at timestamptz, last_due_check_at timestamptz
);
alter table private.asx_convergence_monitor_state enable row level security;
revoke all on private.asx_convergence_monitor_state from public,anon,authenticated,service_role;

create function private.asx_convergence_health_v1(p_now timestamptz) returns jsonb
language plpgsql stable security invoker set search_path='pg_catalog' as $$
declare i record; e jsonb; prior jsonb; r record; c record; reason text; rows jsonb:='[]'; reasons jsonb:='{}';
 total integer:=0; current_count integer:=0; blocked integer:=0; ready_count integer:=0; failed integer:=0; running integer:=0;
 day date:=(p_now at time zone 'Australia/Perth')::date; deadline timestamptz; due boolean;
 pending_alerts integer; failed_alerts integer; exhausted_alerts integer; configured integer; expiry timestamptz; history_count integer;
begin
 if p_now is null or not isfinite(p_now) or p_now>statement_timestamp() then raise exception 'Invalid health clock'; end if;
 deadline:=(day+time '10:15') at time zone 'Australia/Perth';
 due:=p_now>=deadline and (p_now at time zone 'Australia/Sydney')::date=day;
 for i in select id,symbol from public.instruments where is_active and exchange_code='ASX' order by id loop
  total:=total+1;reason:=null;
  e:=market_convergence.prepare_asx_v1(i.id,p_now);
  select * into r from market_convergence.asx_runs_v1 where instrument_id=i.id and started_at<=p_now order by started_at desc,id desc limit 1;
  if r.status='running' then reason:='CONVERGENCE_RUNNING';running:=running+1;
  elsif e->>'readiness' is distinct from 'READY' then reason:=coalesce(e->>'readiness','ADMISSION_UNVERIFIED');blocked:=blocked+1;
  else
   select * into r from market_convergence.asx_runs_v1 where instrument_id=i.id and status='succeeded' and finished_at<=p_now
     and (input_envelope-array['cutoff_at','logical_date'])=(e-array['cutoff_at','logical_date']) order by finished_at desc,id desc limit 1;
   select * into c from public.market_convergence_assessments where id=r.assessment_id;
   if r.id is not null and c.methodology_version='market-convergence-asx-v1'
     and c.technical_score_id=(e#>>'{technical,id}')::bigint and c.ai_assessment_id=(e#>>'{ai,assessment_id}')::uuid
     and c.technical_source_date=(e#>>'{technical,score_date}')::date and c.ai_source_date=(e#>>'{ai,assessment_date}')::date
     and c.convergence_score=(market_convergence.calculate_asx_v1(e)->>'convergence_score')::numeric
     and c.convergence_confidence=(market_convergence.calculate_asx_v1(e)->>'convergence_confidence')::numeric then
    current_count:=current_count+1;reason:='CURRENT';
   elsif exists(select 1 from market_convergence.asx_runs_v1 f where f.instrument_id=i.id and f.status='failed'
     and (f.input_envelope-array['cutoff_at','logical_date'])=(e-array['cutoff_at','logical_date'])
     and not exists(select 1 from market_convergence.asx_runs_v1 child where child.retry_of_run_id=f.id)) then
    failed:=failed+1;reason:='CONVERGENCE_FAILED';
   elsif exists(select 1 from public.market_convergence_assessments a where a.instrument_id=i.id
     and a.methodology_version='market-convergence-asx-v1' and a.assessment_date=greatest((e#>>'{technical,score_date}')::date,(e#>>'{ai,assessment_date}')::date)) then
    blocked:=blocked+1;reason:='CURRENT_ADMISSION_CHANGED';
   else ready_count:=ready_count+1;reason:='READY_UNPROCESSED'; end if;
  end if;
  rows:=rows||jsonb_build_array(jsonb_build_object('symbol',i.symbol,'reason',reason));
  reasons:=jsonb_set(reasons,array[reason],to_jsonb(coalesce((reasons->>reason)::integer,0)+1));
 end loop;
 select count(*) filter(where state='pending'),count(*) filter(where state='failed'),count(*) filter(where state='exhausted')
 into pending_alerts,failed_alerts,exhausted_alerts from private.asx_convergence_alert_queue;
 select count(*) into configured from public.alerts a where a.is_enabled and a.alert_type='market_convergence'
   and (exists(select 1 from public.instruments configured_inst where configured_inst.id=a.instrument_id and configured_inst.is_active and configured_inst.exchange_code='ASX')
     or exists(select 1 from public.watchlist_items w join public.instruments configured_inst on configured_inst.id=w.instrument_id
       join public.watchlists wl on wl.id=w.watchlist_id where w.watchlist_id=a.watchlist_id and wl.owner_user_id=a.owner_user_id and configured_inst.is_active and configured_inst.exchange_code='ASX'));
 select valid_until into expiry from market_convergence.asx_calendars_v1 where verified_at<=p_now order by verified_at desc,revision desc limit 1;
 select count(*) into history_count from market_convergence.asx_runs_v1 where status='succeeded' and finished_at<=p_now;
 return jsonb_build_object('contractVersion',1,'checkedAt',p_now,'dispatchDue',due,'state',case
   when not due then case when p_now<deadline then 'NOT_DUE' else 'DEFERRED' end
   when current_count<total or pending_alerts+failed_alerts+exhausted_alerts>0 or expiry is null or expiry<=p_now+interval '48 hours' then 'ATTENTION' else 'CURRENT' end,
   'counts',jsonb_build_object('active',total,'current',current_count,'blocked',blocked,'ready',ready_count,'failed',failed,'running',running),
   'reasons',reasons,'instruments',rows,'historicalSuccesses',history_count,'calendarExpiresAt',expiry,
   'calendarExpiring',coalesce(expiry<=p_now+interval '48 hours',true),
   'alerts',jsonb_build_object('configuredRules',configured,'pending',pending_alerts,'failed',failed_alerts,'exhausted',exhausted_alerts,
     'channel','in_app','externalDelivery','NOT_CONFIGURED_OR_VERIFIED'));
end $$;
revoke all on function private.asx_convergence_health_v1(timestamptz) from public,anon,authenticated,service_role;

create function private.reconcile_asx_convergence_health_v1(p_now timestamptz,p_dispatch_failed boolean default false) returns void
language plpgsql security invoker set search_path='pg_catalog' as $$
declare s jsonb; opened timestamptz; resolved timestamptz; due_at timestamptz;
begin
 select incident_opened_at,incident_resolved_at,last_due_check_at into opened,resolved,due_at
   from private.asx_convergence_monitor_state where singleton for update;
 begin s:=private.asx_convergence_health_v1(p_now);
 exception when others then s:=jsonb_build_object('contractVersion',1,'checkedAt',p_now,'state','UNVERIFIED','reason','ASX_MONITOR_FAILED',
  'dispatchDue',(p_now at time zone 'Australia/Perth')::time>=time '10:15'
    and (p_now at time zone 'Australia/Sydney')::date=(p_now at time zone 'Australia/Perth')::date); end;
 if p_dispatch_failed then s:=s||jsonb_build_object('state','UNVERIFIED','reason','ASX_ALERT_DISPATCH_FAILED'); end if;
 if (s->>'dispatchDue')::boolean is true then
  due_at:=p_now;
  if s->>'state'='CURRENT' then if opened is not null and resolved is null then resolved:=p_now; end if;
  else if opened is null or resolved is not null then opened:=p_now; end if;resolved:=null; end if;
 end if;
 s:=s||jsonb_build_object('incidentOpenedAt',opened,'incidentResolvedAt',resolved,'lastDueCheckAt',due_at);
 insert into private.asx_convergence_monitor_state values(true,s,opened,resolved,due_at)
 on conflict(singleton) do update set snapshot=excluded.snapshot,incident_opened_at=excluded.incident_opened_at,
 incident_resolved_at=excluded.incident_resolved_at,last_due_check_at=excluded.last_due_check_at;
end $$;
revoke all on function private.reconcile_asx_convergence_health_v1(timestamptz,boolean) from public,anon,authenticated,service_role;

create or replace function private.trading_pipeline_snapshot_v1(p_now timestamptz) returns jsonb
language plpgsql security invoker set search_path='pg_catalog' as $$
declare core jsonb; asx jsonb;
begin
 core:=private.trading_pipeline_core_snapshot_v1(p_now);
 select snapshot into asx from private.asx_convergence_monitor_state where singleton and (snapshot->>'checkedAt')::timestamptz<=p_now;
 return core||jsonb_build_object('asxMonitoringVersion',1,'asxConvergence',asx);
end $$;

create or replace function private.run_trading_watchdog_v1() returns jsonb
language plpgsql security invoker set search_path='pg_catalog' as $$
declare now_at timestamptz:=statement_timestamp(); dispatch_failed boolean:=false;
begin
 perform pg_advisory_xact_lock(hashtextextended('trading-watchdog',0));
 begin perform private.dispatch_asx_convergence_alerts_v1(now_at);
 exception when others then dispatch_failed:=true; end;
 begin perform private.reconcile_asx_convergence_health_v1(now_at,dispatch_failed);
 exception when others then
  -- Do not reuse a fresh-looking prior success after a failed current check.
  begin
   update private.asx_convergence_monitor_state set snapshot=jsonb_build_object(
     'contractVersion',1,'checkedAt',now_at,'state','UNVERIFIED','reason','ASX_MONITOR_FAILED') where singleton;
  exception when others then null; end;
 end;
 return private.reconcile_trading_watchdog_v1(now_at);
end $$;
revoke all on function private.trading_pipeline_snapshot_v1(timestamptz),private.run_trading_watchdog_v1()
 from public,anon,authenticated,service_role;
