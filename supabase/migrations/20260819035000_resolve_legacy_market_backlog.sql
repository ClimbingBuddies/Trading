-- OPS-007: resolve legacy Market Assessment lifecycle/backlog without replay.
--
-- 1. Finalise stale test runs from before the ChatGPT Scheduled Task helper
--    rollout when persisted assessments already establish the truthful result.
-- 2. Terminally close never-attempted orphan queue rows from the retired
--    Supabase-owned backlog. Preserve all queue, run, assessment, evidence and
--    schedule-log records; do not replay historical work.

WITH stale_test_runs AS (
  SELECT
    r.run_id,
    count(a.assessment_id)::integer AS completed_rows
  FROM public.gpt_market_runs AS r
  JOIN public.gpt_market_assessments AS a
    ON a.run_id = r.run_id
  WHERE r.analysis_mode = 'test'
    AND r.status = 'running'
    AND r.completed_at IS NULL
    AND r.created_at < timestamptz '2026-08-12 00:00:00+00'
  GROUP BY r.run_id
)
UPDATE public.gpt_market_runs AS r
SET tickers_completed = s.completed_rows,
    completed_at = now(),
    status = CASE
      WHEN r.tickers_requested > 0
       AND s.completed_rows >= r.tickers_requested THEN 'succeeded'
      WHEN s.completed_rows > 0 THEN 'partial'
      ELSE 'failed'
    END,
    notes = concat_ws(
      E'\n',
      nullif(r.notes, ''),
      'OPS-007 reconciliation: legacy test lifecycle finalised from persisted assessment rows; no assessment or evidence records were replayed, created, changed or deleted.'
    )
FROM stale_test_runs AS s
WHERE r.run_id = s.run_id;

UPDATE public.market_assessment_queue AS q
SET status = 'failed',
    processed_at = now(),
    updated_at = now(),
    error_message = 'Superseded during OPS-007 reconciliation: unattempted legacy queue from the retired Supabase-owned backlog was deliberately closed without replay; no GPT run was created.'
WHERE q.process_name = 'daily_market_assessment'
  AND q.gpt_run_id IS NULL
  AND q.attempt_count = 0
  AND q.status IN ('pending', 'ready_for_analysis')
  AND q.run_date < date '2026-08-14';
