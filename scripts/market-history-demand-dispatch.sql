-- Existing cron identity, cadence, Vault references and atomic worker claim stay intact.
-- This gate avoids empty Edge invocations; it does not preclaim or certify coverage.
begin;
do $release$
declare v_job cron.job%rowtype; v_dispatch text;
begin
 select * into strict v_job from cron.job
 where jobname='market-history-maintenance-worker-every-2-minutes';
 if v_job.schedule <> '*/2 * * * *' or not v_job.active
    or md5(v_job.command) <> 'ca8cc8a44f633fa6d5b6700e0e4cd73a' then
  raise exception 'History cron drift: inspect before applying';
 end if;
 -- Reuse the exact previously reviewed HTTP call, including authentication.
 if left(v_job.command,7) <> 'select ' then raise exception 'Unexpected dispatch SQL'; end if;
 v_dispatch := 'DO $history_dispatch$ BEGIN
 IF EXISTS (SELECT 1 FROM public.market_history_jobs
            WHERE status=''pending'' AND next_attempt_at<=clock_timestamp()) THEN
 PERFORM ' || substring(v_job.command from 8) || ';
 END IF;
 END $history_dispatch$;';
 perform cron.alter_job(v_job.jobid, command := v_dispatch);
end $release$;
commit;
