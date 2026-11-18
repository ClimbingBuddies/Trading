-- Apply only after worker v11 and the single-instrument pilot are verified.
-- Existing dispatcher and provider pacing remain unchanged. No raw evidence
-- or instrument choices are embedded in this public script.
-- READ COMMITTED deliberately refreshes reads after lock waits; queue
-- exclusion comes from the explicit cohort and table locks below.
begin isolation level read committed;
do $$
declare r record; v_count integer; v_key text; v_job uuid; v_pilot record; v_source jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('normalizer-v2-recovery-20261118'));
  perform pg_advisory_xact_lock(hashtextextended('market-history-daily-cohorts-v1',0));
  -- Also fence generic enqueue callers that do not use the cohort lock.
  -- This brief transactional table lock blocks concurrent queue writes.
  lock table public.market_history_jobs in share row exclusive mode;
  if md5(pg_get_functiondef('market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)'::regprocedure))<>'519b5c19fd5bbd92a838b7ef4cc99541'
    then raise exception 'enqueue function changed'; end if;
  select count(*) into v_count from public.market_history_jobs where source_key like 'normalizer-v2-recovery-20261118:%';
  if v_count>0 then
    if v_count<>13 or (select count(distinct instrument_id) from public.market_history_jobs where source_key like 'normalizer-v2-recovery-20261118:%')<>13
      or exists(select 1 from public.market_history_jobs where source_key like 'normalizer-v2-recovery-20261118:%'
        and (source_scope is distinct from 'manual' or job_type is distinct from 'daily_incremental'
          or source_key is distinct from 'normalizer-v2-recovery-20261118:'||instrument_id::text
          or years is distinct from 1 or metadata->>'expected_normalization_version' is distinct from '2'
          or metadata->>'reason' is distinct from 'reviewed_normalizer_v2_quarantine_recovery'))
      then raise exception 'partial or conflicting prior recovery batch'; end if;
    return;
  end if;
  select j.instrument_id,s.id audit_id into strict v_pilot
    from public.market_history_jobs j join public.sync_runs s on s.id=j.sync_run_id
    join public.instruments i on i.id=j.instrument_id
    join public.data_providers p on p.id=s.provider_id and p.provider_code='yahoo' and p.is_active
    where j.source_key='normalizer-v2-canary-20261118' and j.status='succeeded'
      and j.source_scope='manual' and i.is_active and i.exchange_code='ASX' and trim(i.currency_code)='AUD'
      and s.metadata->>'instrument_id'=i.id::text and s.metadata->>'function'='asx-yahoo-market-history'
      and s.metadata->>'provider_symbol'=case when right(i.symbol,3)='.AX' then i.symbol else i.symbol||'.AX' end
      and s.status='succeeded' and s.metadata->>'normalization_version'='2'
      and s.metadata->'normalization_revalidation'->>'state'='completed'
      and s.metadata->'rejected_bars'='[]'::jsonb;
  v_source := technical_engine.asx_source_snapshot_v1(v_pilot.instrument_id,statement_timestamp());
  if v_source->>'status' is distinct from 'ready' or v_source->>'anchor_audit_id' is distinct from v_pilot.audit_id::text
    or v_source->>'terminal_audit_id' is distinct from v_pilot.audit_id::text
    or not coalesce((select technical_engine.asx_score_source_matches_v1(id) from public.market_scores
      where instrument_id=v_pilot.instrument_id and methodology_version='technical-score-asx-v1'
      order by calculated_at desc,id desc limit 1),false) then raise exception 'pilot source/Technical admission changed'; end if;
  create temporary table recovery_candidates on commit drop as
    select i.id,i.symbol from public.instruments i
    join public.data_providers p on p.provider_code='yahoo' and p.is_active
    join lateral(select s.* from public.sync_runs s where s.provider_id=p.id
      and s.metadata->>'instrument_id'=i.id::text and s.metadata->>'function'='asx-yahoo-market-history'
      and s.metadata->>'provider_symbol'=case when right(i.symbol,3)='.AX' then i.symbol else i.symbol||'.AX' end
      order by started_at desc,id desc limit 1) a on true
    where i.is_active and i.exchange_code='ASX' and trim(i.currency_code)='AUD'
      and a.status='succeeded' and coalesce(a.metadata->>'normalization_version','')<>'2'
      and jsonb_typeof(a.metadata->'rejected_bars')='array' and jsonb_array_length(a.metadata->'rejected_bars')>0;
  select count(*) into v_count from recovery_candidates;
  if v_count<>13 then raise exception 'expected 13 reviewed quarantined inputs, found %; refresh evidence',v_count; end if;
  for r in select * from recovery_candidates order by id loop
    if exists(select 1 from public.market_history_jobs where instrument_id=r.id and status in ('pending','running'))
      then raise exception 'candidate has active work'; end if;
    if (select status from public.market_history_jobs where instrument_id=r.id order by created_at desc,id desc limit 1)
      is distinct from 'succeeded' then raise exception 'candidate has a hold or unreviewed failure'; end if;
    v_key := 'normalizer-v2-recovery-20261118:'||r.id::text;
    v_job := market_history.enqueue_job('daily_incremental','manual',v_key,r.id,r.symbol,1,
      jsonb_build_object('reason','reviewed_normalizer_v2_quarantine_recovery','expected_normalization_version',2));
    if not exists(select 1 from public.market_history_jobs where id=v_job and source_scope='manual'
      and source_key=v_key and instrument_id=r.id and status='pending' and job_type='daily_incremental')
      then raise exception 'enqueue reused an unexpected job'; end if;
  end loop;
  if (select count(*) from public.market_history_jobs where source_scope='manual'
    and source_key like 'normalizer-v2-recovery-20261118:%')<>13 then raise exception 'incomplete recovery batch'; end if;
end $$;
select status,count(*) jobs from public.market_history_jobs
where source_scope='manual' and source_key like 'normalizer-v2-recovery-20261118:%' group by status;
commit;
