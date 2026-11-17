-- Bounded queue/schedule repair. No provider fetch or analytical execution here.
-- Existing worker, grants, observation history and two-minute dispatch are retained.
begin;
do $preflight$
begin
 if md5(pg_get_functiondef('market_history.enqueue_daily_jobs()'::regprocedure))<>'c81a6dc84d0d495fcf5a6d69fe3af28d'
 or md5(pg_get_functiondef('public.claim_market_history_job()'::regprocedure))<>'da04210e797ca4b5b6668834def76ca6'
 or md5(pg_get_functiondef('market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)'::regprocedure))<>'519b5c19fd5bbd92a838b7ef4cc99541'
 then raise exception 'History function drift: review before release'; end if;
 if exists(select 1 from public.market_history_jobs where status='running')
 then raise exception 'History worker running: wait for verified idle'; end if;
 if (select count(*) from cron.job where
   (jobname='market-history-daily-close-enqueue' and active and schedule='30 22 * * *' and md5(command)='f7ad107b9531adcb7ba73ac980b9c5c3') or
   (jobname='market-history-maintenance-worker-every-2-minutes' and active and schedule='*/2 * * * *' and md5(command)='f48a6318be6459d80a38778cbb08a341') or
   (jobname='trading-technical-engine-daily-0715-awst' and active and schedule='15 23 * * *' and md5(command)='024c715837343b5eb4865e09f35e467c') or
   (jobname='trading-technical-engine-retry-0745-awst' and active and schedule='45 23 * * *' and md5(command)='fb4e24c84122966864083ec9dc49be2c'))<>4
 or exists(select 1 from cron.job where jobname='market-history-asx-daily-close-enqueue')
 then raise exception 'History/Technical cron drift: review before release'; end if;
end $preflight$;

create function market_history.enqueue_daily_cohort_v1(p_asx boolean) returns integer
language plpgsql security definer set search_path=pg_catalog as $function$
declare v record; v_job uuid; v_count integer:=0;
 v_day text:=(statement_timestamp() at time zone 'UTC')::date::text;
begin
 if p_asx is null then raise exception 'Explicit daily cohort required'; end if;
 -- Both wrappers serialize their check/enqueue/marker sequence.
 perform pg_advisory_xact_lock(hashtextextended('market-history-daily-cohorts-v1',0));
 for v in
  with eligible as (
   select i.id,i.symbol,i.exchange_code from public.instruments i where i.is_active
   union select i.id,i.symbol,i.exchange_code from public.watchlist_items wi join public.instruments i on i.id=wi.instrument_id
   union select i.id,i.symbol,i.exchange_code from public.opportunity_theme_external_instruments oe
    join public.instruments i on upper(i.symbol)=upper(btrim(oe.symbol))
      and(oe.exchange_code='UNKNOWN' or upper(i.exchange_code)=upper(oe.exchange_code)) where oe.is_active)
  select distinct id,symbol from eligible
   where (p_asx and exchange_code='ASX') or (not p_asx and exchange_code is distinct from 'ASX') order by id
 loop
  -- Do not recreate this cycle after success/failure, or undo a prior explicit hold.
  if exists(select 1 from public.market_history_jobs j where j.instrument_id=v.id and j.job_type='daily_incremental'
    and (j.metadata->>'enqueued_for'=v_day or (j.metadata->'daily_enqueue_cycles') ? v_day))
  or (select j.status in ('mapping_required','validation_required') from public.market_history_jobs j
      where j.instrument_id=v.id order by j.created_at desc,j.id desc limit 1)
  then continue; end if;
  v_job:=market_history.enqueue_job('daily_incremental','active_universe','daily:'||v.id::text,
    v.id,v.symbol,1,jsonb_build_object('enqueued_for',v_day));
  -- enqueue_job may reuse a prior-day pending/running job. Mark cycle coverage
  -- without changing its original enqueue date, state, due time or retry attempts.
  update public.market_history_jobs j set metadata=jsonb_set(coalesce(j.metadata,'{}'::jsonb),
    '{daily_enqueue_cycles}',coalesce(j.metadata->'daily_enqueue_cycles','[]'::jsonb)||jsonb_build_array(v_day))
   where j.id=v_job;
  v_count:=v_count+1;
 end loop;
 return v_count;
end $function$;
revoke all on function market_history.enqueue_daily_cohort_v1(boolean) from public,anon,authenticated,service_role;

create or replace function market_history.enqueue_daily_jobs() returns integer
language plpgsql security definer set search_path=pg_catalog as $function$
begin return market_history.enqueue_daily_cohort_v1(false); end $function$;

create function market_history.enqueue_asx_daily_jobs_v1() returns integer
language plpgsql security definer set search_path=pg_catalog as $function$
begin return market_history.enqueue_daily_cohort_v1(true); end $function$;
revoke all on function market_history.enqueue_asx_daily_jobs_v1() from public,anon,authenticated,service_role;

create or replace function public.claim_market_history_job() returns setof public.market_history_jobs
language plpgsql security definer set search_path=pg_catalog as $function$
declare v_id uuid;
begin
 select j.id into v_id from public.market_history_jobs j
 left join public.instruments i on i.id=j.instrument_id
 where j.status='pending' and j.next_attempt_at<=clock_timestamp()
 order by case
  when i.is_active and exists(select 1 from public.shared_decision_calls c where c.instrument_id=i.id
    and not exists(select 1 from public.shared_decision_outcomes o where o.call_id=c.id and o.kind in('EXIT','CANCELLED'))) then 0
  when i.is_active and exists(select 1 from public.watchlist_items w where w.instrument_id=i.id) then 1
  when i.is_active then 2 else 3 end,
  case j.job_type when 'initial_backfill' then 0 else 1 end,j.next_attempt_at,j.created_at,j.id
 for update of j skip locked limit 1;
 if v_id is null then return; end if;
 return query update public.market_history_jobs j set status='running',attempts=j.attempts+1,
  started_at=coalesce(j.started_at,clock_timestamp()),updated_at=clock_timestamp()
 where j.id=v_id and j.status='pending' returning j.*;
end $function$;

-- ASX previous-Sydney-date bars become eligible after midnight in both DST states.
-- 22:15 Perth = 14:15 UTC; the non-ASX enqueue stays at 06:30 Perth.
select cron.schedule('market-history-asx-daily-close-enqueue','15 14 * * *',
 'select market_history.enqueue_asx_daily_jobs_v1()');
-- Keep cron IDs/names/commands (names retain their historical timing).
do $schedule$
begin
 perform cron.alter_job((select jobid from cron.job where jobname='trading-technical-engine-daily-0715-awst'),schedule:='0 0 * * *');
 perform cron.alter_job((select jobid from cron.job where jobname='trading-technical-engine-retry-0745-awst'),schedule:='5 0 * * *');
end $schedule$;
commit;
