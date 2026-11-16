-- Preserve all ASX snapshots/results. Restore only the prior scheduled runner.
-- Verify expected installed release function digest under the lock before use.
create or replace function technical_engine.run_v1(
  p_execution_source text default 'manual',
  p_retry_of_run_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = 'pg_catalog'
as $$
declare
  v_run_id uuid;
  v_scheduled_for date := (clock_timestamp() at time zone 'Australia/Perth')::date;
  v_attempt_number smallint := 1;
  v_retry_parent public.technical_engine_runs%rowtype;
  v_indicator_instruments integer;
  v_indicator_rows integer;
  v_indicator_complete integer;
  v_indicator_incomplete integer;
  v_calculation_version text;
  v_score_instruments integer;
  v_score_rows integer;
  v_complete_scores integer;
  v_partial_scores integer;
  v_methodology_version text;
begin
  if p_execution_source not in ('scheduled', 'manual', 'retry') then
    raise exception using
      errcode = '22023',
      message = 'p_execution_source must be scheduled, manual or retry';
  end if;

  if p_execution_source = 'retry' then
    if p_retry_of_run_id is null then
      raise exception using errcode = '22023', message = 'retry execution requires p_retry_of_run_id';
    end if;

    select *
    into v_retry_parent
    from public.technical_engine_runs
    where id = p_retry_of_run_id
      and status = 'failed'
    for update;

    if not found then
      raise exception using errcode = '22023', message = 'retry target must be an existing failed run';
    end if;

    if v_retry_parent.attempt_number >= 3 then
      raise exception using errcode = '22023', message = 'technical engine retry limit is three attempts';
    end if;

    if exists (
      select 1
      from public.technical_engine_runs
      where retry_of_run_id = v_retry_parent.id
        and status in ('running', 'succeeded')
    ) then
      raise exception using errcode = '55000', message = 'retry target already has a running or successful child attempt';
    end if;

    v_scheduled_for := v_retry_parent.scheduled_for;
    v_attempt_number := v_retry_parent.attempt_number + 1;
  elsif p_retry_of_run_id is not null then
    raise exception using errcode = '22023', message = 'p_retry_of_run_id is valid only for retry execution';
  end if;

  if not pg_try_advisory_xact_lock(hashtextextended('technical_engine.run_v1', 0)) then
    insert into public.technical_engine_runs (
      scheduled_for,
      execution_source,
      retry_of_run_id,
      attempt_number,
      finished_at,
      status,
      error_code,
      error_message,
      metadata
    ) values (
      v_scheduled_for,
      p_execution_source,
      p_retry_of_run_id,
      v_attempt_number,
      clock_timestamp(),
      'skipped',
      'already_running',
      'Another Technical Engine run already owns the execution lock.',
      jsonb_build_object('lock_scope', 'technical_engine.run_v1')
    )
    returning id into v_run_id;

    return v_run_id;
  end if;

  if p_execution_source = 'scheduled' and exists (
    select 1
    from public.technical_engine_runs
    where scheduled_for = v_scheduled_for
      and status = 'succeeded'
  ) then
    insert into public.technical_engine_runs (
      scheduled_for,
      execution_source,
      attempt_number,
      finished_at,
      status,
      error_code,
      error_message,
      metadata
    ) values (
      v_scheduled_for,
      p_execution_source,
      1,
      clock_timestamp(),
      'skipped',
      'already_succeeded',
      'A successful Technical Engine run already exists for this Perth operating date.',
      jsonb_build_object('operating_timezone', 'Australia/Perth')
    )
    returning id into v_run_id;

    return v_run_id;
  end if;

  insert into public.technical_engine_runs (
    scheduled_for,
    execution_source,
    retry_of_run_id,
    attempt_number,
    status,
    metadata
  ) values (
    v_scheduled_for,
    p_execution_source,
    p_retry_of_run_id,
    v_attempt_number,
    'running',
    jsonb_build_object(
      'operating_timezone', 'Australia/Perth',
      'indicator_scope', 'all Tiingo 1day instruments',
      'score_scope', 'all technical-engine-v1 instruments'
    )
  )
  returning id into v_run_id;

  begin
    select
      r.instruments_processed,
      r.rows_upserted,
      r.complete_rows,
      r.incomplete_rows,
      r.calculation_version
    into
      v_indicator_instruments,
      v_indicator_rows,
      v_indicator_complete,
      v_indicator_incomplete,
      v_calculation_version
    from technical_engine.refresh_v1(null::uuid) r;

    select
      r.instruments_processed,
      r.rows_upserted,
      r.complete_scores,
      r.partial_scores,
      r.methodology_version
    into
      v_score_instruments,
      v_score_rows,
      v_complete_scores,
      v_partial_scores,
      v_methodology_version
    from technical_engine.refresh_scores_v1(null::uuid) r;

    update public.technical_engine_runs
    set
      finished_at = clock_timestamp(),
      status = 'succeeded',
      instruments_processed = greatest(coalesce(v_indicator_instruments, 0), coalesce(v_score_instruments, 0)),
      indicator_rows_upserted = coalesce(v_indicator_rows, 0),
      indicator_complete_rows = coalesce(v_indicator_complete, 0),
      indicator_incomplete_rows = coalesce(v_indicator_incomplete, 0),
      score_rows_upserted = coalesce(v_score_rows, 0),
      complete_scores = coalesce(v_complete_scores, 0),
      partial_scores = coalesce(v_partial_scores, 0),
      calculation_version = v_calculation_version,
      methodology_version = v_methodology_version,
      error_code = null,
      error_message = null,
      metadata = metadata || jsonb_build_object(
        'indicator_instruments_processed', coalesce(v_indicator_instruments, 0),
        'score_instruments_processed', coalesce(v_score_instruments, 0)
      )
    where id = v_run_id;
  exception
    when others then
      update public.technical_engine_runs
      set
        finished_at = clock_timestamp(),
        status = 'failed',
        error_code = sqlstate,
        error_message = left(sqlerrm, 2000),
        metadata = metadata || jsonb_build_object('failed_at', clock_timestamp())
      where id = v_run_id;
  end;

  return v_run_id;
end;
$$;
