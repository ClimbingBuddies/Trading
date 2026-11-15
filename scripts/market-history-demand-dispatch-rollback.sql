-- Restore only the exact wrapper introduced by the paired release.
-- No queue rows, observations, statuses or other schedules are changed.
begin;
do $rollback$
declare v_job cron.job%rowtype; v_original text;
 v_prefix constant text := 'DO $history_dispatch$ BEGIN
 IF EXISTS (SELECT 1 FROM public.market_history_jobs
            WHERE status=''pending'' AND next_attempt_at<=clock_timestamp()) THEN
 PERFORM ';
 v_suffix constant text := ';
 END IF;
 END $history_dispatch$;';
begin
 select * into strict v_job from cron.job
 where jobname='market-history-maintenance-worker-every-2-minutes';
 if v_job.schedule <> '*/2 * * * *' or not v_job.active
    or left(v_job.command,length(v_prefix)) <> v_prefix
    or right(v_job.command,length(v_suffix)) <> v_suffix then
  raise exception 'History dispatch drift: inspect before rollback';
 end if;
 v_original := 'select ' || substring(v_job.command from length(v_prefix)+1
                         for length(v_job.command)-length(v_prefix)-length(v_suffix));
 if md5(v_original) <> 'ca8cc8a44f633fa6d5b6700e0e4cd73a' then
  raise exception 'Unexpected original dispatch';
 end if;
 perform cron.alter_job(v_job.jobid, command := v_original);
end $rollback$;
commit;
