-- One reviewed, source-clean target-session gap. Protected session settings keep
-- instrument/audit choices out of public source. Existing queue/dispatcher only.
begin isolation level read committed;
select pg_advisory_xact_lock(hashtextextended('market-history-daily-cohorts-v1',0));
lock table public.market_history_jobs in share row exclusive mode;
do $$
declare v_id uuid:=current_setting('trading.recovery_instrument')::uuid;
  v_symbol text:=current_setting('trading.recovery_symbol');
  v_audit uuid:=current_setting('trading.recovery_audit')::uuid;
  v_target date:=current_setting('trading.recovery_target')::date;
  v_key text; v_source jsonb; v_job uuid;
begin
  v_key:='asx-session-gap:'||v_target::text||':'||v_id::text;
  if exists(select 1 from public.market_history_jobs where source_key=v_key) then
    if (select count(*) from public.market_history_jobs where source_key=v_key)<>1
      or not exists(select 1 from public.market_history_jobs where source_scope='manual' and source_key=v_key
        and instrument_id=v_id and symbol=v_symbol and job_type='daily_incremental' and years=1
        and metadata->>'reason'='reviewed_calendar_target_gap_provider_now_available'
        and metadata->>'target_session'=v_target::text)
      then raise exception 'gap recovery key conflict'; end if;
    return;
  end if;
  if md5(pg_get_functiondef('market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)'::regprocedure))<>'519b5c19fd5bbd92a838b7ef4cc99541'
    then raise exception 'enqueue function changed; review required'; end if;
  if v_target<>(statement_timestamp() at time zone 'Australia/Sydney')::date-1
    then raise exception 'target no longer yesterday; refresh calendar/provider review'; end if;
  if not exists(select 1 from public.instruments where id=v_id and symbol=v_symbol
    and exchange_code='ASX' and trim(currency_code)='AUD' and asset_type='equity' and is_active)
    then raise exception 'instrument identity changed'; end if;
  if exists(select 1 from public.market_history_jobs where instrument_id=v_id and status in ('pending','running'))
    then raise exception 'instrument already has active work'; end if;
  if (select status from public.market_history_jobs where instrument_id=v_id order by created_at desc,id desc limit 1)
    is distinct from 'succeeded' then raise exception 'latest job not successful; review hold/failure'; end if;
  v_source:=technical_engine.asx_source_snapshot_v1(v_id,statement_timestamp());
  if v_source->>'status' is distinct from 'ready' or v_source->>'terminal_audit_id' is distinct from v_audit::text
    or v_source->>'window_end' is distinct from v_target::text
    then raise exception 'source identity/quality/request end changed'; end if;
  if exists(select 1 from jsonb_to_recordset(v_source->'observations') b(observed_at timestamptz)
    where (b.observed_at at time zone 'UTC')::date=v_target)
    then raise exception 'target already present; no gap recovery needed'; end if;
  v_job:=market_history.enqueue_job('daily_incremental','manual',v_key,v_id,v_symbol,1,
    jsonb_build_object('reason','reviewed_calendar_target_gap_provider_now_available','target_session',v_target));
  if not exists(select 1 from public.market_history_jobs where id=v_job and source_scope='manual' and source_key=v_key
    and instrument_id=v_id and symbol=v_symbol and job_type='daily_incremental' and years=1 and status='pending'
    and metadata->>'reason'='reviewed_calendar_target_gap_provider_now_available'
    and metadata->>'target_session'=v_target::text)
    then raise exception 'exact pending receipt missing'; end if;
end $$;
select id,status,created_at from public.market_history_jobs where source_scope='manual'
  and source_key='asx-session-gap:'||current_setting('trading.recovery_target')::date::text||':'||current_setting('trading.recovery_instrument')::uuid::text;
commit;
