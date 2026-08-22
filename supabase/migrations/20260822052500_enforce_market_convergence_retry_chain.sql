-- CONV-003 remediation: enforce a linear, three-attempt retry chain.

drop index if exists public.market_convergence_runs_retry_of_idx;

create unique index market_convergence_runs_retry_of_idx
  on public.market_convergence_runs (retry_of_run_id)
  where retry_of_run_id is not null;

comment on index public.market_convergence_runs_retry_of_idx is
  'Allows at most one direct retry child for each failed Market Convergence run.';

create or replace function market_convergence.run_v1(
  p_execution_source text default 'manual',
  p_retry_of_run_id uuid default null,
  p_cutoff_at timestamptz default clock_timestamp(),
  p_instrument_id uuid default null
)
returns uuid
language plpgsql
set search_path = pg_catalog
as $function$
declare
  v_run_id uuid;
  v_parent public.market_convergence_runs%rowtype;
  v_cutoff_at timestamptz := p_cutoff_at;
  v_instrument_id uuid := p_instrument_id;
  v_logical_date date;
  v_attempt smallint := 1;
  v_stats record;
begin
  if p_execution_source not in ('scheduled', 'manual', 'retry', 'historical') then
    raise exception using errcode = '22023', message = 'p_execution_source must be scheduled, manual, retry or historical';
  end if;

  if p_execution_source = 'retry' then
    if p_retry_of_run_id is null then
      raise exception using errcode = '22023', message = 'retry execution requires p_retry_of_run_id';
    end if;

    select * into v_parent
    from public.market_convergence_runs
    where id = p_retry_of_run_id and status = 'failed'
    for update;

    if not found then
      raise exception using errcode = '22023', message = 'retry target must be an existing failed convergence run';
    end if;
    if v_parent.attempt_number >= 3 then
      raise exception using errcode = '22023', message = 'Market Convergence retry limit is three attempts';
    end if;
    if exists (
      select 1 from public.market_convergence_runs c
      where c.retry_of_run_id = v_parent.id
    ) then
      raise exception using errcode = '55000', message = 'retry target already has a child attempt';
    end if;

    v_cutoff_at := v_parent.cutoff_at;
    v_instrument_id := v_parent.instrument_id;
    v_attempt := v_parent.attempt_number + 1;
  elsif p_retry_of_run_id is not null then
    raise exception using errcode = '22023', message = 'p_retry_of_run_id is valid only for retry execution';
  end if;

  if v_cutoff_at is null then
    raise exception using errcode = '22004', message = 'p_cutoff_at must not be null';
  end if;

  v_logical_date := (v_cutoff_at at time zone 'America/New_York')::date;

  if not pg_try_advisory_xact_lock(hashtextextended('market_convergence.run_v1', 0)) then
    insert into public.market_convergence_runs (
      logical_date, cutoff_at, instrument_id, execution_source, retry_of_run_id,
      attempt_number, finished_at, status, error_code, error_message, metadata
    ) values (
      v_logical_date, v_cutoff_at, v_instrument_id, p_execution_source, p_retry_of_run_id,
      v_attempt, clock_timestamp(), 'skipped', 'already_running',
      'Another Market Convergence run already owns the execution lock.',
      jsonb_build_object('lock_scope', 'market_convergence.run_v1')
    ) returning id into v_run_id;
    return v_run_id;
  end if;

  if p_execution_source = 'scheduled' and exists (
    select 1 from public.market_convergence_runs r
    where r.logical_date = v_logical_date
      and r.methodology_version = 'market-convergence-v1'
      and r.instrument_id is not distinct from v_instrument_id
      and r.status = 'succeeded'
  ) then
    insert into public.market_convergence_runs (
      logical_date, cutoff_at, instrument_id, execution_source, attempt_number,
      finished_at, status, error_code, error_message, metadata
    ) values (
      v_logical_date, v_cutoff_at, v_instrument_id, p_execution_source, 1,
      clock_timestamp(), 'skipped', 'already_succeeded',
      'A successful Market Convergence run already exists for this logical date and scope.',
      jsonb_build_object('logical_timezone', 'America/New_York')
    ) returning id into v_run_id;
    return v_run_id;
  end if;

  insert into public.market_convergence_runs (
    logical_date, cutoff_at, instrument_id, execution_source, retry_of_run_id,
    attempt_number, status, metadata
  ) values (
    v_logical_date, v_cutoff_at, v_instrument_id, p_execution_source, p_retry_of_run_id,
    v_attempt, 'running', jsonb_build_object(
      'logical_timezone', 'America/New_York',
      'max_source_age_days', 4,
      'freshness_rule', 'both source dates must be within four calendar days of logical_date'
    )
  ) returning id into v_run_id;

  begin
    select * into v_stats
    from market_convergence.refresh_as_of_v1(v_cutoff_at, v_instrument_id);

    update public.market_convergence_runs
    set
      finished_at = clock_timestamp(), status = 'succeeded',
      instruments_considered = v_stats.instruments_considered,
      eligible_pairs = v_stats.eligible_pairs,
      fresh_pairs = v_stats.fresh_pairs,
      stale_pairs = v_stats.stale_pairs,
      missing_input_instruments = v_stats.missing_input_instruments,
      rows_changed = v_stats.rows_changed,
      error_code = null, error_message = null
    where id = v_run_id;
  exception when others then
    update public.market_convergence_runs
    set finished_at = clock_timestamp(), status = 'failed',
        error_code = sqlstate, error_message = left(sqlerrm, 2000),
        metadata = metadata || jsonb_build_object('failed_at', clock_timestamp())
    where id = v_run_id;
  end;

  return v_run_id;
end;
$function$;

create or replace function market_convergence.retry_latest_failed_v1()
returns uuid
language plpgsql
set search_path = pg_catalog
as $function$
declare
  v_failed_run_id uuid;
begin
  select r.id into v_failed_run_id
  from public.market_convergence_runs r
  where r.status = 'failed'
    and r.attempt_number < 3
    and not exists (
      select 1 from public.market_convergence_runs c
      where c.retry_of_run_id = r.id
    )
  order by r.started_at desc
  limit 1;

  if v_failed_run_id is null then return null; end if;
  return market_convergence.run_v1('retry', v_failed_run_id, clock_timestamp(), null);
end;
$function$;

alter function market_convergence.run_v1(text, uuid, timestamptz, uuid) owner to postgres;
alter function market_convergence.retry_latest_failed_v1() owner to postgres;

revoke all on function market_convergence.run_v1(text, uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function market_convergence.retry_latest_failed_v1() from public, anon, authenticated;

grant execute on function market_convergence.run_v1(text, uuid, timestamptz, uuid) to service_role;
grant execute on function market_convergence.retry_latest_failed_v1() to service_role;
