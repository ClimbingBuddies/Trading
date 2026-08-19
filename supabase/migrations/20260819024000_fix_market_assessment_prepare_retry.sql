-- Fix idempotent retry/resume lookup in prepare_chatgpt_market_assessment.
-- The RETURNS TABLE output parameter named run_id makes unqualified run_id
-- references ambiguous inside PL/pgSQL. Qualify run-table columns explicitly.

CREATE OR REPLACE FUNCTION public.prepare_chatgpt_market_assessment(
  p_run_date date DEFAULT NULL,
  p_model_name text DEFAULT 'chatgpt-scheduled-task',
  p_prompt_version text DEFAULT 'chatgpt-task-v1'
)
RETURNS TABLE(
  queue_id bigint,
  run_id uuid,
  effective_run_date date,
  queue_status text,
  run_status text,
  tickers_requested integer,
  tickers_completed integer,
  already_complete boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_date date := COALESCE(p_run_date, (now() AT TIME ZONE 'America/New_York')::date);
  v_queue public.market_assessment_queue%ROWTYPE;
  v_run public.gpt_market_runs%ROWTYPE;
  v_requested integer := 0;
BEGIN
  INSERT INTO public.market_assessment_queue (run_date, status, process_name)
  VALUES (v_run_date, 'pending', 'daily_market_assessment')
  ON CONFLICT (run_date, process_name) DO NOTHING;

  SELECT * INTO v_queue
  FROM public.market_assessment_queue AS q
  WHERE q.run_date = v_run_date
    AND q.process_name = 'daily_market_assessment'
  FOR UPDATE;

  IF v_queue.status = 'succeeded' AND v_queue.gpt_run_id IS NOT NULL THEN
    SELECT * INTO v_run
    FROM public.gpt_market_runs AS r
    WHERE r.run_id = v_queue.gpt_run_id;

    RETURN QUERY
    SELECT v_queue.id,
           v_queue.gpt_run_id,
           v_queue.run_date,
           v_queue.status,
           COALESCE(v_run.status, 'succeeded'::text),
           COALESCE(v_run.tickers_requested, 0),
           COALESCE(v_run.tickers_completed, 0),
           true;
    RETURN;
  END IF;

  IF v_queue.gpt_run_id IS NULL THEN
    SELECT count(*)::integer INTO v_requested
    FROM public.instruments AS i
    WHERE i.is_active = true;

    INSERT INTO public.gpt_market_runs (
      analysis_cutoff_time,
      status,
      model_name,
      prompt_version,
      analysis_mode,
      tickers_requested,
      tickers_completed,
      notes
    )
    VALUES (
      now(),
      'running',
      COALESCE(NULLIF(p_model_name, ''), 'chatgpt-scheduled-task'),
      COALESCE(NULLIF(p_prompt_version, ''), 'chatgpt-task-v1'),
      'scheduled',
      v_requested,
      0,
      'Created by ChatGPT Scheduled Task orchestration.'
    )
    RETURNING * INTO v_run;

    UPDATE public.market_assessment_queue AS q
    SET gpt_run_id = v_run.run_id
    WHERE q.id = v_queue.id;
  ELSE
    UPDATE public.gpt_market_runs AS r
    SET status = 'running',
        completed_at = NULL,
        model_name = COALESCE(NULLIF(p_model_name, ''), r.model_name),
        prompt_version = COALESCE(NULLIF(p_prompt_version, ''), r.prompt_version)
    WHERE r.run_id = v_queue.gpt_run_id
    RETURNING * INTO v_run;
  END IF;

  UPDATE public.market_assessment_queue AS q
  SET status = 'processing',
      started_at = COALESCE(q.started_at, now()),
      updated_at = now(),
      attempt_count = COALESCE(q.attempt_count, 0) + 1,
      error_message = NULL,
      gpt_run_id = v_run.run_id
  WHERE q.id = v_queue.id
  RETURNING * INTO v_queue;

  RETURN QUERY
  SELECT v_queue.id,
         v_run.run_id,
         v_queue.run_date,
         v_queue.status,
         v_run.status,
         v_run.tickers_requested,
         v_run.tickers_completed,
         false;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_chatgpt_market_assessment(date, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_chatgpt_market_assessment(date, text, text)
  TO service_role;
