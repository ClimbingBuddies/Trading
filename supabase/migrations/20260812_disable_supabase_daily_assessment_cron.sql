-- ChatGPT Scheduled Tasks now own the daily market-assessment schedule.
-- Keep the Supabase market-data loader schedule unchanged.
-- Remove the old Supabase pg_cron daily assessment trigger to avoid duplicate orchestration.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'daily_market_assessment'
  ) THEN
    PERFORM cron.unschedule('daily_market_assessment');
  END IF;
END;
$$;
