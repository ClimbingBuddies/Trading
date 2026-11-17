-- Paired rollback for align_daily_history_with_controller. No job/data deletion.
-- Require lock, reviewed exact deployed definitions and a safe UTC cycle boundary.
begin;
do $guard$
begin
 perform pg_advisory_xact_lock(hashtextextended('market-history-daily-cohorts-v1',0));
 if md5(pg_get_functiondef('market_history.enqueue_daily_jobs()'::regprocedure))<>'4442eb7c3462ff8e1378041a91275b20'
 or md5(pg_get_functiondef('public.claim_market_history_job()'::regprocedure))<>'f9a244c2bdf588cbaf0b591844d895c5'
 or md5(pg_get_functiondef('market_history.enqueue_daily_cohort_v1(boolean)'::regprocedure))<>'12484b90d59239f161d21de03506be41'
 or md5(pg_get_functiondef('market_history.enqueue_asx_daily_jobs_v1()'::regprocedure))<>'cd57635da54bf7852e1513711e9225a7'
 or md5(pg_get_functiondef('market_history.enqueue_job(text,text,text,uuid,text,integer,jsonb)'::regprocedure))<>'519b5c19fd5bbd92a838b7ef4cc99541'
 then raise exception 'Rollback function drift'; end if;
 if (clock_timestamp() at time zone 'UTC')::time >= time '14:15'
 or exists(select 1 from public.market_history_jobs j join public.instruments i on i.id=j.instrument_id
   where i.exchange_code='ASX' and j.job_type='daily_incremental'
   and (j.metadata->>'enqueued_for'=(clock_timestamp() at time zone 'UTC')::date::text
     or (j.metadata->'daily_enqueue_cycles') ? ((clock_timestamp() at time zone 'UTC')::date::text)))
 then raise exception 'Unsafe ASX enqueue cycle for full rollback; use next reviewed boundary'; end if;
 if exists(select 1 from public.market_history_jobs where status='running')
 then raise exception 'History worker running'; end if;
 if (select count(*) from cron.job where
 (jobname='market-history-asx-daily-close-enqueue' and active and schedule='15 14 * * *' and command='select market_history.enqueue_asx_daily_jobs_v1()') or
 (jobname='market-history-daily-close-enqueue' and active and schedule='30 22 * * *' and md5(command)='f7ad107b9531adcb7ba73ac980b9c5c3') or
 (jobname='market-history-maintenance-worker-every-2-minutes' and active and schedule='*/2 * * * *' and md5(command)='f48a6318be6459d80a38778cbb08a341') or
 (jobname='trading-technical-engine-daily-0715-awst' and active and schedule='0 0 * * *' and md5(command)='024c715837343b5eb4865e09f35e467c') or
 (jobname='trading-technical-engine-retry-0745-awst' and active and schedule='5 0 * * *' and md5(command)='fb4e24c84122966864083ec9dc49be2c'))<>5
 then raise exception 'Rollback cron drift'; end if;
end $guard$;
CREATE OR REPLACE FUNCTION market_history.enqueue_daily_jobs()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v record;v_count int:=0;
begin
 for v in
  with eligible as(
   select i.id,i.symbol from public.instruments i where i.is_active
   union select i.id,i.symbol from public.watchlist_items wi join public.instruments i on i.id=wi.instrument_id
   union select i.id,i.symbol from public.opportunity_theme_external_instruments oe join public.instruments i on upper(i.symbol)=upper(btrim(oe.symbol)) and(oe.exchange_code='UNKNOWN' or upper(i.exchange_code)=upper(oe.exchange_code)) where oe.is_active)
  select distinct id,symbol from eligible
 loop
  perform market_history.enqueue_job('daily_incremental','active_universe','daily:'||v.id::text,v.id,v.symbol,1,jsonb_build_object('enqueued_for',(clock_timestamp() at time zone 'UTC')::date));
  v_count:=v_count+1;
 end loop; return v_count;
end$function$
;
CREATE OR REPLACE FUNCTION public.claim_market_history_job()
 RETURNS SETOF market_history_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_id uuid;
begin
 select j.id into v_id from public.market_history_jobs j where j.status='pending' and j.next_attempt_at<=clock_timestamp()
 order by case j.job_type when 'initial_backfill' then 0 else 1 end,j.next_attempt_at,j.created_at for update skip locked limit 1;
 if v_id is null then return; end if;
 return query update public.market_history_jobs j set status='running',attempts=j.attempts+1,started_at=coalesce(j.started_at,clock_timestamp()),updated_at=clock_timestamp()
 where j.id=v_id and j.status='pending' returning j.*;
end$function$
;
select cron.unschedule('market-history-asx-daily-close-enqueue');
do $restore$
begin
 perform cron.alter_job((select jobid from cron.job where jobname='trading-technical-engine-daily-0715-awst'),schedule:='15 23 * * *');
 perform cron.alter_job((select jobid from cron.job where jobname='trading-technical-engine-retry-0745-awst'),schedule:='45 23 * * *');
end $restore$;
drop function market_history.enqueue_asx_daily_jobs_v1();
drop function market_history.enqueue_daily_cohort_v1(boolean);
commit;
