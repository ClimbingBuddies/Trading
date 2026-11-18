-- Reviewed single-instrument recovery after deploying normalizer v2.
-- Uses existing demand dispatcher; no provider request or schedule change here.
-- Repeating this script returns the same receipt, including terminal jobs.
-- Set trading.recovery_instrument, trading.recovery_symbol and
-- trading.recovery_audit in the executing session from protected evidence.
begin isolation level serializable;
do $$
declare v_instrument uuid := current_setting('trading.recovery_instrument')::uuid;
  v_symbol text := current_setting('trading.recovery_symbol');
  v_audit uuid := current_setting('trading.recovery_audit')::uuid;
  v_key text := 'normalizer-v2-canary-20261118'; v_job uuid;
begin
  perform pg_advisory_xact_lock(hashtext('normalizer-v2-canary-20261118'));
  if exists(select 1 from public.market_history_jobs where source_scope='manual' and source_key=v_key) then return; end if;
  if md5(pg_get_functiondef('market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)'::regprocedure))<>'519b5c19fd5bbd92a838b7ef4cc99541'
    then raise exception 'enqueue function changed; review required'; end if;
  if not exists(select 1 from public.instruments where id=v_instrument and symbol=v_symbol and exchange_code='ASX' and trim(currency_code)='AUD' and is_active)
    then raise exception 'canary identity changed'; end if;
  if exists(select 1 from public.market_history_jobs where instrument_id=v_instrument and status in ('pending','running'))
    then raise exception 'canary already has active work'; end if;
  if (select status from public.market_history_jobs where instrument_id=v_instrument order by created_at desc,id desc limit 1)
    is distinct from 'succeeded' then raise exception 'latest canary job is not a successful quarantined fetch'; end if;
  if (select id from public.sync_runs where metadata->>'instrument_id'=v_instrument::text
    and metadata->>'function'='asx-yahoo-market-history' order by started_at desc,id desc limit 1)
    is distinct from v_audit then raise exception 'canary audit changed; refresh evidence'; end if;
  v_job := market_history.enqueue_job('daily_incremental','manual',v_key,v_instrument,v_symbol,1,
    jsonb_build_object('reason','reviewed_normalizer_v2_quarantine_recovery','expected_normalization_version',2));
end $$;
select id,status,created_at from public.market_history_jobs
where source_scope='manual' and source_key='normalizer-v2-canary-20261118';
commit;
