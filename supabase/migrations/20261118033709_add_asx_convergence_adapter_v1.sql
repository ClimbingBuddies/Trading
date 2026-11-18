-- Isolated ASX adapter. Original v1 functions, run ledger and history are unchanged.
alter table public.market_convergence_assessments
  add column technical_source_date date,
  add column ai_source_date date,
  add column source_cutoff_at timestamptz,
  add constraint asx_convergence_complete check(methodology_version<>'market-convergence-asx-v1' or
    (technical_score_id is not null and ai_assessment_id is not null and technical_score is not null
    and technical_confidence is not null and technical_signal is not null and ai_score is not null
    and ai_confidence is not null and ai_signal is not null and convergence_score is not null
    and convergence_confidence is not null and convergence_label is not null and nullif(btrim(summary),'') is not null
    and technical_source_date is not null and ai_source_date is not null and source_cutoff_at is not null
    and assessment_date=greatest(technical_source_date,ai_source_date)));
create table market_convergence.asx_calendars_v1 (
  revision text primary key, manifest_hash text not null, manifest jsonb not null,
  verified_at timestamptz not null, valid_until timestamptz not null,
  check(valid_until>verified_at),
  check(manifest->>'purpose'='ASX_RESEARCH_SESSION_DATES_ONLY'),
  check(manifest->>'exchange'='ASX' and manifest->>'timeZone'='Australia/Sydney')
);
create table market_convergence.asx_runs_v1 (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id),
  logical_date date not null, cutoff_at timestamptz not null,
  execution_source text not null check(execution_source in ('manual','scheduled','retry')),
  retry_of_run_id uuid references market_convergence.asx_runs_v1(id),
  attempt_number smallint not null check(attempt_number between 1 and 3),
  status text not null check(status in ('running','succeeded','failed','skipped')),
  input_envelope jsonb not null,
  assessment_id uuid references public.market_convergence_assessments(id),
  error_code text, started_at timestamptz not null default clock_timestamp(), finished_at timestamptz,
  check(logical_date=(cutoff_at at time zone 'America/New_York')::date),
  check((execution_source='retry')=(retry_of_run_id is not null)),
  check((status='running')=(finished_at is null)),
  check(status<>'succeeded' or assessment_id is not null)
);
create unique index asx_runs_v1_one_retry on market_convergence.asx_runs_v1(retry_of_run_id) where retry_of_run_id is not null;
create index asx_runs_v1_scope on market_convergence.asx_runs_v1(instrument_id,logical_date);
create index asx_runs_v1_assessment on market_convergence.asx_runs_v1(assessment_id);
alter table market_convergence.asx_calendars_v1 enable row level security;
alter table market_convergence.asx_runs_v1 enable row level security;
revoke all on market_convergence.asx_calendars_v1,market_convergence.asx_runs_v1 from public,anon,authenticated,service_role;
grant select on market_convergence.asx_calendars_v1 to service_role;
grant select,insert on market_convergence.asx_runs_v1 to service_role;
grant update(status,assessment_id,error_code,finished_at) on market_convergence.asx_runs_v1 to service_role;

-- No updates/deletes of frozen calendar evidence, terminal receipts or ASX results.
create function market_convergence.protect_asx_history_v1() returns trigger
language plpgsql security invoker set search_path='pg_catalog' as $$
begin
  if tg_table_name='asx_runs_v1' and tg_op='UPDATE' then
    if old.status='running' and new.status<>'running'
      and (to_jsonb(new)-array['status','assessment_id','error_code','finished_at'])=
          (to_jsonb(old)-array['status','assessment_id','error_code','finished_at']) then return new; end if;
  elsif tg_table_name='market_convergence_assessments' then
    if old.methodology_version<>'market-convergence-asx-v1'
      and (tg_op='DELETE' or new.methodology_version<>'market-convergence-asx-v1') then
      if tg_op='DELETE' then return old; else return new; end if;
    end if;
  end if;
  raise exception using errcode='55000',message='ASX convergence history is immutable';
end $$;
create trigger protect_asx_calendars before update or delete on market_convergence.asx_calendars_v1
for each row execute function market_convergence.protect_asx_history_v1();
create trigger protect_asx_runs before update or delete on market_convergence.asx_runs_v1
for each row execute function market_convergence.protect_asx_history_v1();
create trigger protect_asx_assessments before update or delete on public.market_convergence_assessments
for each row execute function market_convergence.protect_asx_history_v1();

-- Canonical latest selection precedes validation: never fall back around a bad latest row.
-- Full private envelope returned only to trusted SQL operators, never to public readers.
create function market_convergence.prepare_asx_v1(p_instrument_id uuid,p_cutoff_at timestamptz)
returns jsonb language plpgsql stable security invoker set search_path='pg_catalog' set timezone='UTC' as $$
declare
  t public.market_scores%rowtype; a public.gpt_market_assessments%rowtype; r public.gpt_market_runs%rowtype;
  s technical_engine.asx_input_snapshots%rowtype; c market_convergence.asx_calendars_v1%rowtype;
  src jsonb; current_src jsonb; calc jsonb; target date; sd date; nd date; n integer; bad integer; present boolean;
begin
  if p_cutoff_at is null or not isfinite(p_cutoff_at) or p_cutoff_at>statement_timestamp() then
    return jsonb_build_object('readiness','INVALID_CUTOFF'); end if;
  sd:=(p_cutoff_at at time zone 'Australia/Sydney')::date;
  nd:=(p_cutoff_at at time zone 'America/New_York')::date;
  if not exists(select 1 from public.instruments where id=p_instrument_id and is_active
    and exchange_code='ASX' and asset_type='equity' and btrim(currency_code)='AUD') then
    return jsonb_build_object('readiness','UNSUPPORTED_INSTRUMENT'); end if;
  select * into c from market_convergence.asx_calendars_v1
    where verified_at<=p_cutoff_at and valid_until>statement_timestamp()
      and sd-1 between (manifest->>'startDate')::date and (manifest->>'endDate')::date
    order by verified_at desc,revision desc limit 1;
  if not found then return jsonb_build_object('readiness','CALENDAR_UNAVAILABLE_OR_EXPIRED'); end if;
  select max((d->>'date')::date) into target from jsonb_array_elements(c.manifest->'days') d
    where d->>'status'='OPEN' and (d->>'date')::date<sd;
  if target is null then return jsonb_build_object('readiness','CALENDAR_TARGET_MISSING'); end if;
  select * into t from public.market_scores where instrument_id=p_instrument_id
    and methodology_version='technical-score-asx-v1' and calculated_at<=p_cutoff_at
    order by score_date desc,calculated_at desc,id desc limit 1;
  if not found then return jsonb_build_object('readiness','TECHNICAL_INPUT_MISSING'); end if;
  if not coalesce(t.technical_calculation_version='technical-engine-asx-v1'
    and t.score_status in ('complete','partial') and t.overall_score between 0 and 100
    and t.confidence_score between 0 and 100 and t.score_date=target and sd-t.score_date between 1 and 4,false) then
    return jsonb_build_object('readiness','TECHNICAL_INVALID_OR_STALE'); end if;
  select * into s from technical_engine.asx_input_snapshots
    where id::text=t.score_details->>'source_snapshot_id' and instrument_id=p_instrument_id;
  if not found or s.cutoff_at>p_cutoff_at or s.cutoff_at is distinct from t.calculated_at
    or s.source_hash is distinct from t.score_details->>'source_hash'
    or (s.snapshot->>'cutoff_at')::timestamptz is distinct from s.cutoff_at
    or (t.score_details->>'cutoff_at')::timestamptz is distinct from s.cutoff_at then
    return jsonb_build_object('readiness','TECHNICAL_SNAPSHOT_MISMATCH'); end if;
  src:=technical_engine.asx_source_snapshot_v1(p_instrument_id,p_cutoff_at);
  current_src:=technical_engine.asx_source_snapshot_v1(p_instrument_id,statement_timestamp());
  if src->>'status' is distinct from 'ready' or current_src->>'status' is distinct from 'ready'
    or src->>'source_hash' is distinct from s.source_hash or current_src->>'source_hash' is distinct from s.source_hash
    or (src-'cutoff_at') is distinct from (s.snapshot-'cutoff_at')
    or date_trunc('week',s.cutoff_at at time zone 'Australia/Sydney') is distinct from
       date_trunc('week',statement_timestamp() at time zone 'Australia/Sydney') then
    return jsonb_build_object('readiness','TECHNICAL_SOURCE_CHANGED_OR_BLOCKED'); end if;
  calc:=(technical_engine.asx_calculate_v1(s.snapshot))->'score';
  if (calc->>'score_date')::date is distinct from t.score_date
    or (calc->>'overall_score')::numeric is distinct from t.overall_score
    or (calc->>'confidence_score')::numeric is distinct from t.confidence_score
    or calc->>'score_status' is distinct from t.score_status
    or calc->'score_details' is distinct from (t.score_details-array['source_snapshot_id','refresh_batch_id']) then
    return jsonb_build_object('readiness','TECHNICAL_PAYLOAD_MISMATCH'); end if;
  select count(distinct d->>'date') filter(where d->>'status'='OPEN'),
    count(*) filter(where d->>'status'='CLOSED' or (b->>'loaded_at')::timestamptz>p_cutoff_at
      or b->>'loaded_at' is null or (b->>'observed_at')::timestamptz at time zone 'UTC'>=sd::timestamp),
    coalesce(bool_or((d->>'date')::date=target and d->>'status'='OPEN'),false)
    into n,bad,present
    from jsonb_array_elements(src->'observations') b left join jsonb_array_elements(c.manifest->'days') d
      on (d->>'date')::date=((b->>'observed_at')::timestamptz at time zone 'UTC')::date;
  if n<20 or bad>0 or not present then return jsonb_build_object('readiness','RAW_SESSION_NOT_READY'); end if;
  select * into a from public.gpt_market_assessments where instrument_id=p_instrument_id
    and methodology_version='independent-market-ai-v1' and created_at<=p_cutoff_at
    order by assessment_date desc,created_at desc,assessment_id desc limit 1;
  if not found then return jsonb_build_object('readiness','AI_INPUT_MISSING'); end if;
  if not coalesce(a.technical_engine_input_used is false and a.score between 0 and 100 and a.confidence between 0 and 100
    and lower(a.rating) in ('strong buy','buy','hold','sell','strong sell') and nd-a.assessment_date between 0 and 4,false) then
    return jsonb_build_object('readiness','AI_INVALID_OR_STALE'); end if;
  select * into r from public.gpt_market_runs where run_id=a.run_id;
  if not found or not coalesce(r.status in ('succeeded','partial') and r.completed_at<=p_cutoff_at
    and r.completed_at>=a.created_at and r.analysis_cutoff_time<=a.created_at,false) then
    return jsonb_build_object('readiness','AI_RUN_NOT_TERMINAL_AT_CUTOFF'); end if;
  return jsonb_build_object('readiness','READY','methodology_version','market-convergence-asx-v1',
    'instrument_id',p_instrument_id,'cutoff_at',p_cutoff_at,'logical_date',nd,'target_session',target,
    'technical',to_jsonb(t),'source_snapshot',to_jsonb(s),'ai',to_jsonb(a),'ai_run',to_jsonb(r),'calendar',to_jsonb(c));
end $$;

create function market_convergence.calculate_asx_v1(e jsonb) returns jsonb
language plpgsql immutable security invoker set search_path='pg_catalog' as $$
declare t numeric:=round((e#>>'{technical,overall_score}')::numeric,2);
  a numeric:=round((e#>>'{ai,score}')::numeric,2);
  tc numeric:=round((e#>>'{technical,confidence_score}')::numeric,2);
  ac numeric:=round((e#>>'{ai,confidence}')::numeric,2);
  ts text; ais text:=initcap(lower(e#>>'{ai,rating}')); ti int; ai int; gap numeric; score numeric; conf numeric; agreement text; label text;
begin
  ts:=case when (e#>>'{technical,overall_score}')::numeric>=80 then 'Strong Buy'
    when (e#>>'{technical,overall_score}')::numeric>=60 then 'Buy' when (e#>>'{technical,overall_score}')::numeric>=40 then 'Hold'
    when (e#>>'{technical,overall_score}')::numeric>=20 then 'Sell' else 'Strong Sell' end;
  ti:=case ts when 'Strong Buy' then 2 when 'Buy' then 1 when 'Hold' then 0 when 'Sell' then -1 else -2 end;
  ai:=case lower(ais) when 'strong buy' then 2 when 'buy' then 1 when 'hold' then 0 when 'sell' then -1 else -2 end;
  gap:=abs(t-a); score:=round((t+a)/2,2);
  agreement:=case when ti<>0 and ai<>0 and sign(ti)<>sign(ai) then 'conflict' when gap>=25 then 'mixed'
    when gap<10 then 'aligned' else 'mild_disagreement' end;
  conf:=round(least(sqrt(tc*ac)*(1-gap/200),case agreement when 'conflict' then 40 when 'mixed' then 60 else 100 end),2);
  label:=case when agreement in ('conflict','mixed') then agreement when score>=85 then 'very_strong_bullish'
    when score>=70 then 'strong_bullish' when score>=60 then 'moderate_bullish' when score>=40 then 'neutral'
    when score>=30 then 'moderate_bearish' when score>=15 then 'strong_bearish' else 'very_strong_bearish' end;
  return jsonb_build_object('technical_score',t,'technical_signal',ts,'technical_confidence',tc,'ai_score',a,'ai_signal',ais,
    'ai_confidence',ac,'convergence_score',score,'convergence_confidence',conf,'convergence_label',label,
    'summary',format('Technical %s (%s/100, confidence %s/100) and independent AI Market %s (%s/100, confidence %s/100) combine to %s (%s/100, confidence %s/100; %s; score gap %s). Sources: Technical %s via technical-score-asx-v1; AI Market %s via independent-market-ai-v1. ASX research convergence only; separate from Opportunity, shared recommendations and measured outcomes. Not investment advice.',
      ts,t,tc,ais,a,ac,label,score,conf,agreement,gap,e#>>'{technical,score_date}',e#>>'{ai,assessment_date}'));
end $$;

create function market_convergence.run_asx_v1(p_instrument_id uuid,p_execution_source text default 'manual',
  p_retry_of_run_id uuid default null,p_cutoff_at timestamptz default statement_timestamp())
returns uuid language plpgsql security invoker set search_path='pg_catalog' set timezone='UTC' as $$
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
end $$;
revoke all on function market_convergence.protect_asx_history_v1(),market_convergence.prepare_asx_v1(uuid,timestamptz),
  market_convergence.calculate_asx_v1(jsonb),market_convergence.run_asx_v1(uuid,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function market_convergence.prepare_asx_v1(uuid,timestamptz),market_convergence.calculate_asx_v1(jsonb),
  market_convergence.run_asx_v1(uuid,text,uuid,timestamptz) to service_role;

-- Exact validated research-only manifest; renewal is a separately reviewed insert.
insert into market_convergence.asx_calendars_v1(revision,manifest_hash,manifest,verified_at,valid_until) values('asx-research-2026-20261118','0880fe1d9a18236844eb6bf788d2dfb8e1f54ef316975d26b6478710194aeb1a','{"version":1,"purpose":"ASX_RESEARCH_SESSION_DATES_ONLY","exchange":"ASX","revision":"asx-research-2026-20261118","timeZone":"Australia/Sydney","startDate":"2026-10-15","endDate":"2026-12-20","sources":["https://asxonline.com/content/asxonline/public/notices/2025/august/0922.25.08.html","https://asxonline.com/content/dam/asxonline/public/notices/2025/august/asxtrade2026.pdf","https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours","https://www.asx.com.au/markets/market-resources/system-status"],"limitations":["Date-only published cash trading calendar; no opening/closing instants, provider finality, hypothetical fills, benchmark mapping or evaluator permission.","Bounded after the Sydney DST transition and before Christmas shortened days. Every date is explicit; outside coverage fails closed.","Official calendar notice last updated 20 March 2026. Reviewed official status feed at 2026-11-18T02:34:21Z; no scheduled closure identified within coverage.","Status history since 1 November showed informational Outlook issues and normal-operation update. This is not an exhaustive historical disruption or instrument-halt audit. Check fresh official alerts at each invocation.","Always exclude the current Sydney date. Twenty admitted OPEN observations is not a consecutive-session or complete-history certificate."],"days":[{"date":"2026-10-15","status":"OPEN"},{"date":"2026-10-16","status":"OPEN"},{"date":"2026-10-17","status":"CLOSED","reason":"Weekend"},{"date":"2026-10-18","status":"CLOSED","reason":"Weekend"},{"date":"2026-10-19","status":"OPEN"},{"date":"2026-10-20","status":"OPEN"},{"date":"2026-10-21","status":"OPEN"},{"date":"2026-10-22","status":"OPEN"},{"date":"2026-10-23","status":"OPEN"},{"date":"2026-10-24","status":"CLOSED","reason":"Weekend"},{"date":"2026-10-25","status":"CLOSED","reason":"Weekend"},{"date":"2026-10-26","status":"OPEN"},{"date":"2026-10-27","status":"OPEN"},{"date":"2026-10-28","status":"OPEN"},{"date":"2026-10-29","status":"OPEN"},{"date":"2026-10-30","status":"OPEN"},{"date":"2026-10-31","status":"CLOSED","reason":"Weekend"},{"date":"2026-11-01","status":"CLOSED","reason":"Weekend"},{"date":"2026-11-02","status":"OPEN"},{"date":"2026-11-03","status":"OPEN"},{"date":"2026-11-04","status":"OPEN"},{"date":"2026-11-05","status":"OPEN"},{"date":"2026-11-06","status":"OPEN"},{"date":"2026-11-07","status":"CLOSED","reason":"Weekend"},{"date":"2026-11-08","status":"CLOSED","reason":"Weekend"},{"date":"2026-11-09","status":"OPEN"},{"date":"2026-11-10","status":"OPEN"},{"date":"2026-11-11","status":"OPEN"},{"date":"2026-11-12","status":"OPEN"},{"date":"2026-11-13","status":"OPEN"},{"date":"2026-11-14","status":"CLOSED","reason":"Weekend"},{"date":"2026-11-15","status":"CLOSED","reason":"Weekend"},{"date":"2026-11-16","status":"OPEN"},{"date":"2026-11-17","status":"OPEN"},{"date":"2026-11-18","status":"OPEN"},{"date":"2026-11-19","status":"OPEN"},{"date":"2026-11-20","status":"OPEN"},{"date":"2026-11-21","status":"CLOSED","reason":"Weekend"},{"date":"2026-11-22","status":"CLOSED","reason":"Weekend"},{"date":"2026-11-23","status":"OPEN"},{"date":"2026-11-24","status":"OPEN"},{"date":"2026-11-25","status":"OPEN"},{"date":"2026-11-26","status":"OPEN"},{"date":"2026-11-27","status":"OPEN"},{"date":"2026-11-28","status":"CLOSED","reason":"Weekend"},{"date":"2026-11-29","status":"CLOSED","reason":"Weekend"},{"date":"2026-11-30","status":"OPEN"},{"date":"2026-12-01","status":"OPEN"},{"date":"2026-12-02","status":"OPEN"},{"date":"2026-12-03","status":"OPEN"},{"date":"2026-12-04","status":"OPEN"},{"date":"2026-12-05","status":"CLOSED","reason":"Weekend"},{"date":"2026-12-06","status":"CLOSED","reason":"Weekend"},{"date":"2026-12-07","status":"OPEN"},{"date":"2026-12-08","status":"OPEN"},{"date":"2026-12-09","status":"OPEN"},{"date":"2026-12-10","status":"OPEN"},{"date":"2026-12-11","status":"OPEN"},{"date":"2026-12-12","status":"CLOSED","reason":"Weekend"},{"date":"2026-12-13","status":"CLOSED","reason":"Weekend"},{"date":"2026-12-14","status":"OPEN"},{"date":"2026-12-15","status":"OPEN"},{"date":"2026-12-16","status":"OPEN"},{"date":"2026-12-17","status":"OPEN"},{"date":"2026-12-18","status":"OPEN"},{"date":"2026-12-19","status":"CLOSED","reason":"Weekend"},{"date":"2026-12-20","status":"CLOSED","reason":"Weekend"}]}','2026-11-18T02:34:21Z','2026-11-25T02:34:21Z');
