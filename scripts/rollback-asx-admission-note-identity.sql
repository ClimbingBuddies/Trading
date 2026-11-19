-- Restore reviewed prior definitions; retain helper for source compatibility.
-- Coordinate source revert. No historical envelope/result is changed.
begin;
do $guard$
begin
 if not pg_try_advisory_xact_lock(hashtextextended('market_convergence.run_v1',0)) then raise exception 'Convergence running'; end if;
 if exists(select 1 from market_convergence.asx_runs_v1 where status='running') or exists(select 1 from public.market_convergence_runs where status='running') then raise exception 'Unresolved convergence'; end if;
 if pg_get_functiondef('market_convergence.run_asx_v1(uuid,text,uuid,timestamptz)'::regprocedure) is distinct from $expected_run$CREATE OR REPLACE FUNCTION market_convergence.run_asx_v1(p_instrument_id uuid, p_execution_source text DEFAULT 'manual'::text, p_retry_of_run_id uuid DEFAULT NULL::uuid, p_cutoff_at timestamp with time zone DEFAULT statement_timestamp())
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
 SET "TimeZone" TO 'UTC'
AS $function$
declare e jsonb; recheck jsonb; result jsonb; parent market_convergence.asx_runs_v1%rowtype;
  v_id uuid; v_assessment uuid; attempt int:=1; v_date date; code text; original jsonb;
begin
  if p_execution_source not in ('manual','scheduled','retry') or p_execution_source is null
    or (p_execution_source='retry')<>(p_retry_of_run_id is not null) then raise exception 'Invalid ASX execution source'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('market_convergence.run_v1',0)) then
    raise exception using errcode='55000',message='Convergence already running'; end if;
  if exists(select 1 from public.market_convergence_runs where status='running')
    or exists(select 1 from market_convergence.asx_runs_v1 where status='running') then
    raise exception using errcode='55000',message='Unresolved convergence run'; end if;
  if p_execution_source='retry' then
    select * into parent from market_convergence.asx_runs_v1 where id=p_retry_of_run_id for update;
    if not found or parent.status<>'failed' or parent.attempt_number>=3 or parent.instrument_id is distinct from p_instrument_id
      or exists(select 1 from market_convergence.asx_runs_v1 where retry_of_run_id=parent.id) then raise exception 'Invalid ASX retry parent'; end if;
    p_cutoff_at:=parent.cutoff_at; e:=parent.input_envelope; attempt:=parent.attempt_number+1;
  else
    if p_cutoff_at is null or not isfinite(p_cutoff_at) or p_cutoff_at>statement_timestamp()
      or p_cutoff_at<statement_timestamp()-interval '5 minutes' then raise exception 'New ASX admission requires current cutoff'; end if;
    e:=market_convergence.prepare_asx_v1(p_instrument_id,p_cutoff_at);
    if e->>'readiness' is distinct from 'READY' then raise exception using errcode='55000',message=e->>'readiness'; end if;
  end if;
  v_date:=(p_cutoff_at at time zone 'America/New_York')::date;
  if p_execution_source<>'retry' then
    select id,input_envelope into v_id,original from market_convergence.asx_runs_v1
      where instrument_id=p_instrument_id and logical_date=v_date and status='succeeded'
      order by started_at,id limit 1;
    if found then
      if (market_convergence.asx_input_identity_v1(original)-array['cutoff_at','logical_date']) is distinct from (market_convergence.asx_input_identity_v1(e)-array['cutoff_at','logical_date']) then
        raise exception using errcode='55000',message='SAME_DAY_INPUT_CHANGED'; end if;
      return v_id;
    end if;
    if exists(select 1 from public.market_convergence_assessments where instrument_id=p_instrument_id
      and assessment_date=greatest((e#>>'{technical,score_date}')::date,(e#>>'{ai,assessment_date}')::date)
      and methodology_version='market-convergence-asx-v1' and not exists(
        select 1 from market_convergence.asx_runs_v1 prior where prior.assessment_id=market_convergence_assessments.id
          and prior.status='succeeded' and (market_convergence.asx_input_identity_v1(prior.input_envelope)-array['cutoff_at','logical_date'])=(market_convergence.asx_input_identity_v1(e)-array['cutoff_at','logical_date']))) then
      raise exception using errcode='55000',message='IMMUTABLE_ASSESSMENT_CONFLICT'; end if;
  end if;
  if p_execution_source<>'retry' and exists(select 1 from market_convergence.asx_runs_v1
    where instrument_id=p_instrument_id and logical_date=v_date and status='failed'
      and not exists(select 1 from market_convergence.asx_runs_v1 child where child.retry_of_run_id=asx_runs_v1.id)) then
    raise exception 'Resolve failed ASX chain before new admission'; end if;
  insert into market_convergence.asx_runs_v1(instrument_id,logical_date,cutoff_at,execution_source,retry_of_run_id,attempt_number,status,input_envelope)
    values(p_instrument_id,v_date,p_cutoff_at,p_execution_source,p_retry_of_run_id,attempt,'running',e) returning id into v_id;
  -- Input admission survives this subtransaction's calculation/publication failure.
  begin
    recheck:=market_convergence.prepare_asx_v1(p_instrument_id,p_cutoff_at);
    if market_convergence.asx_input_identity_v1(recheck) is distinct from market_convergence.asx_input_identity_v1(e) then raise exception using errcode='55000',message='PINNED_INPUT_CHANGED_OR_BLOCKED'; end if;
    result:=market_convergence.calculate_asx_v1(e);
    select id into v_assessment from public.market_convergence_assessments where instrument_id=p_instrument_id
      and assessment_date=greatest((e#>>'{technical,score_date}')::date,(e#>>'{ai,assessment_date}')::date)
      and methodology_version='market-convergence-asx-v1';
    if found then
      select input_envelope into original from market_convergence.asx_runs_v1 where assessment_id=v_assessment and status='succeeded' order by started_at,id limit 1;
      -- A new current cutoff alone does not alter the exact frozen source payloads.
      if (market_convergence.asx_input_identity_v1(original)-array['cutoff_at','logical_date']) is distinct from (market_convergence.asx_input_identity_v1(e)-array['cutoff_at','logical_date']) then
        raise exception using errcode='55000',message='IMMUTABLE_ASSESSMENT_CONFLICT'; end if;
    else
      insert into public.market_convergence_assessments(instrument_id,assessment_date,technical_score_id,ai_assessment_id,
        technical_score,technical_signal,technical_confidence,ai_score,ai_signal,ai_confidence,convergence_score,convergence_confidence,
        convergence_label,summary,methodology_version,technical_source_date,ai_source_date,source_cutoff_at)
      values(p_instrument_id,greatest((e#>>'{technical,score_date}')::date,(e#>>'{ai,assessment_date}')::date),
        (e#>>'{technical,id}')::bigint,(e#>>'{ai,assessment_id}')::uuid,
        (result->>'technical_score')::numeric,result->>'technical_signal',(result->>'technical_confidence')::numeric,
        (result->>'ai_score')::numeric,result->>'ai_signal',(result->>'ai_confidence')::numeric,
        (result->>'convergence_score')::numeric,(result->>'convergence_confidence')::numeric,result->>'convergence_label',result->>'summary',
        'market-convergence-asx-v1',(e#>>'{technical,score_date}')::date,(e#>>'{ai,assessment_date}')::date,p_cutoff_at) returning id into v_assessment;
    end if;
    if market_convergence.asx_input_identity_v1(market_convergence.prepare_asx_v1(p_instrument_id,p_cutoff_at)) is distinct from market_convergence.asx_input_identity_v1(e) then
      raise exception using errcode='55000',message='INPUT_CHANGED_DURING_PUBLICATION'; end if;
    update market_convergence.asx_runs_v1 set status='succeeded',assessment_id=v_assessment,finished_at=clock_timestamp() where id=v_id;
  exception when others then
    get stacked diagnostics code=message_text;
    update market_convergence.asx_runs_v1 set status='failed',error_code=left(code,160),finished_at=clock_timestamp() where id=v_id;
  end;
  return v_id;
end $function$
$expected_run$
 or pg_get_functiondef('private.asx_convergence_health_v1(timestamptz)'::regprocedure) is distinct from $expected_health$CREATE OR REPLACE FUNCTION private.asx_convergence_health_v1(p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
     and (market_convergence.asx_input_identity_v1(input_envelope)-array['cutoff_at','logical_date'])=(market_convergence.asx_input_identity_v1(e)-array['cutoff_at','logical_date']) order by finished_at desc,id desc limit 1;
   select * into c from public.market_convergence_assessments where id=r.assessment_id;
   if r.id is not null and c.methodology_version='market-convergence-asx-v1'
     and c.technical_score_id=(e#>>'{technical,id}')::bigint and c.ai_assessment_id=(e#>>'{ai,assessment_id}')::uuid
     and c.technical_source_date=(e#>>'{technical,score_date}')::date and c.ai_source_date=(e#>>'{ai,assessment_date}')::date
     and c.convergence_score=(market_convergence.calculate_asx_v1(e)->>'convergence_score')::numeric
     and c.convergence_confidence=(market_convergence.calculate_asx_v1(e)->>'convergence_confidence')::numeric then
    current_count:=current_count+1;reason:='CURRENT';
   elsif exists(select 1 from market_convergence.asx_runs_v1 f where f.instrument_id=i.id and f.status='failed'
     and (market_convergence.asx_input_identity_v1(f.input_envelope)-array['cutoff_at','logical_date'])=(market_convergence.asx_input_identity_v1(e)-array['cutoff_at','logical_date'])
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
end $function$
$expected_health$ then raise exception 'Installed repair differs; review before recovery'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION market_convergence.run_asx_v1(p_instrument_id uuid, p_execution_source text DEFAULT 'manual'::text, p_retry_of_run_id uuid DEFAULT NULL::uuid, p_cutoff_at timestamp with time zone DEFAULT statement_timestamp())
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
 SET "TimeZone" TO 'UTC'
AS $function$
declare e jsonb; recheck jsonb; result jsonb; parent market_convergence.asx_runs_v1%rowtype;
  v_id uuid; v_assessment uuid; attempt int:=1; v_date date; code text; original jsonb;
begin
  if p_execution_source not in ('manual','scheduled','retry') or p_execution_source is null
    or (p_execution_source='retry')<>(p_retry_of_run_id is not null) then raise exception 'Invalid ASX execution source'; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('market_convergence.run_v1',0)) then
    raise exception using errcode='55000',message='Convergence already running'; end if;
  if exists(select 1 from public.market_convergence_runs where status='running')
    or exists(select 1 from market_convergence.asx_runs_v1 where status='running') then
    raise exception using errcode='55000',message='Unresolved convergence run'; end if;
  if p_execution_source='retry' then
    select * into parent from market_convergence.asx_runs_v1 where id=p_retry_of_run_id for update;
    if not found or parent.status<>'failed' or parent.attempt_number>=3 or parent.instrument_id is distinct from p_instrument_id
      or exists(select 1 from market_convergence.asx_runs_v1 where retry_of_run_id=parent.id) then raise exception 'Invalid ASX retry parent'; end if;
    p_cutoff_at:=parent.cutoff_at; e:=parent.input_envelope; attempt:=parent.attempt_number+1;
  else
    if p_cutoff_at is null or not isfinite(p_cutoff_at) or p_cutoff_at>statement_timestamp()
      or p_cutoff_at<statement_timestamp()-interval '5 minutes' then raise exception 'New ASX admission requires current cutoff'; end if;
    e:=market_convergence.prepare_asx_v1(p_instrument_id,p_cutoff_at);
    if e->>'readiness' is distinct from 'READY' then raise exception using errcode='55000',message=e->>'readiness'; end if;
  end if;
  v_date:=(p_cutoff_at at time zone 'America/New_York')::date;
  if p_execution_source<>'retry' then
    select id,input_envelope into v_id,original from market_convergence.asx_runs_v1
      where instrument_id=p_instrument_id and logical_date=v_date and status='succeeded'
      order by started_at,id limit 1;
    if found then
      if (original-array['cutoff_at','logical_date']) is distinct from (e-array['cutoff_at','logical_date']) then
        raise exception using errcode='55000',message='SAME_DAY_INPUT_CHANGED'; end if;
      return v_id;
    end if;
    if exists(select 1 from public.market_convergence_assessments where instrument_id=p_instrument_id
      and assessment_date=greatest((e#>>'{technical,score_date}')::date,(e#>>'{ai,assessment_date}')::date)
      and methodology_version='market-convergence-asx-v1' and not exists(
        select 1 from market_convergence.asx_runs_v1 prior where prior.assessment_id=market_convergence_assessments.id
          and prior.status='succeeded' and (prior.input_envelope-array['cutoff_at','logical_date'])=(e-array['cutoff_at','logical_date']))) then
      raise exception using errcode='55000',message='IMMUTABLE_ASSESSMENT_CONFLICT'; end if;
  end if;
  if p_execution_source<>'retry' and exists(select 1 from market_convergence.asx_runs_v1
    where instrument_id=p_instrument_id and logical_date=v_date and status='failed'
      and not exists(select 1 from market_convergence.asx_runs_v1 child where child.retry_of_run_id=asx_runs_v1.id)) then
    raise exception 'Resolve failed ASX chain before new admission'; end if;
  insert into market_convergence.asx_runs_v1(instrument_id,logical_date,cutoff_at,execution_source,retry_of_run_id,attempt_number,status,input_envelope)
    values(p_instrument_id,v_date,p_cutoff_at,p_execution_source,p_retry_of_run_id,attempt,'running',e) returning id into v_id;
  -- Input admission survives this subtransaction's calculation/publication failure.
  begin
    recheck:=market_convergence.prepare_asx_v1(p_instrument_id,p_cutoff_at);
    if recheck is distinct from e then raise exception using errcode='55000',message='PINNED_INPUT_CHANGED_OR_BLOCKED'; end if;
    result:=market_convergence.calculate_asx_v1(e);
    select id into v_assessment from public.market_convergence_assessments where instrument_id=p_instrument_id
      and assessment_date=greatest((e#>>'{technical,score_date}')::date,(e#>>'{ai,assessment_date}')::date)
      and methodology_version='market-convergence-asx-v1';
    if found then
      select input_envelope into original from market_convergence.asx_runs_v1 where assessment_id=v_assessment and status='succeeded' order by started_at,id limit 1;
      -- A new current cutoff alone does not alter the exact frozen source payloads.
      if (original-array['cutoff_at','logical_date']) is distinct from (e-array['cutoff_at','logical_date']) then
        raise exception using errcode='55000',message='IMMUTABLE_ASSESSMENT_CONFLICT'; end if;
    else
      insert into public.market_convergence_assessments(instrument_id,assessment_date,technical_score_id,ai_assessment_id,
        technical_score,technical_signal,technical_confidence,ai_score,ai_signal,ai_confidence,convergence_score,convergence_confidence,
        convergence_label,summary,methodology_version,technical_source_date,ai_source_date,source_cutoff_at)
      values(p_instrument_id,greatest((e#>>'{technical,score_date}')::date,(e#>>'{ai,assessment_date}')::date),
        (e#>>'{technical,id}')::bigint,(e#>>'{ai,assessment_id}')::uuid,
        (result->>'technical_score')::numeric,result->>'technical_signal',(result->>'technical_confidence')::numeric,
        (result->>'ai_score')::numeric,result->>'ai_signal',(result->>'ai_confidence')::numeric,
        (result->>'convergence_score')::numeric,(result->>'convergence_confidence')::numeric,result->>'convergence_label',result->>'summary',
        'market-convergence-asx-v1',(e#>>'{technical,score_date}')::date,(e#>>'{ai,assessment_date}')::date,p_cutoff_at) returning id into v_assessment;
    end if;
    if market_convergence.prepare_asx_v1(p_instrument_id,p_cutoff_at) is distinct from e then
      raise exception using errcode='55000',message='INPUT_CHANGED_DURING_PUBLICATION'; end if;
    update market_convergence.asx_runs_v1 set status='succeeded',assessment_id=v_assessment,finished_at=clock_timestamp() where id=v_id;
  exception when others then
    get stacked diagnostics code=message_text;
    update market_convergence.asx_runs_v1 set status='failed',error_code=left(code,160),finished_at=clock_timestamp() where id=v_id;
  end;
  return v_id;
end $function$
;
CREATE OR REPLACE FUNCTION private.asx_convergence_health_v1(p_now timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
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
end $function$
;
commit;
