-- CONV-003: deterministic convergence history, freshness and bounded retries.

create table if not exists public.market_convergence_runs (
  id uuid primary key default gen_random_uuid(),
  logical_date date not null,
  cutoff_at timestamptz not null,
  instrument_id uuid references public.instruments(id) on delete cascade,
  execution_source text not null,
  retry_of_run_id uuid references public.market_convergence_runs(id) on delete restrict,
  attempt_number smallint not null default 1,
  started_at timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  status text not null default 'running',
  instruments_considered integer not null default 0,
  eligible_pairs integer not null default 0,
  fresh_pairs integer not null default 0,
  stale_pairs integer not null default 0,
  missing_input_instruments integer not null default 0,
  rows_changed integer not null default 0,
  methodology_version text not null default 'market-convergence-v1',
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint market_convergence_runs_execution_source_chk
    check (execution_source in ('scheduled', 'manual', 'retry', 'historical')),
  constraint market_convergence_runs_attempt_chk
    check (attempt_number between 1 and 3),
  constraint market_convergence_runs_status_chk
    check (status in ('running', 'succeeded', 'failed', 'skipped')),
  constraint market_convergence_runs_retry_shape_chk
    check ((execution_source = 'retry') = (retry_of_run_id is not null)),
  constraint market_convergence_runs_cutoff_date_chk
    check (logical_date = (cutoff_at at time zone 'America/New_York')::date),
  constraint market_convergence_runs_terminal_chk
    check ((status = 'running' and finished_at is null) or (status <> 'running' and finished_at is not null)),
  constraint market_convergence_runs_counts_chk
    check (
      instruments_considered >= 0 and eligible_pairs >= 0 and fresh_pairs >= 0
      and stale_pairs >= 0 and missing_input_instruments >= 0 and rows_changed >= 0
      and eligible_pairs = fresh_pairs + stale_pairs
      and instruments_considered = eligible_pairs + missing_input_instruments
    )
);

comment on table public.market_convergence_runs is
  'Read-only operational history for deterministic Market Convergence cutoffs, freshness decisions and bounded retry attempts.';

create index if not exists market_convergence_runs_logical_date_idx
  on public.market_convergence_runs (logical_date desc, attempt_number desc, started_at desc);

create index if not exists market_convergence_runs_retry_of_idx
  on public.market_convergence_runs (retry_of_run_id)
  where retry_of_run_id is not null;

create index if not exists market_convergence_runs_instrument_idx
  on public.market_convergence_runs (instrument_id, logical_date desc)
  where instrument_id is not null;

create index if not exists market_convergence_assessments_technical_score_id_idx
  on public.market_convergence_assessments (technical_score_id)
  where technical_score_id is not null;

create index if not exists market_convergence_assessments_ai_assessment_id_idx
  on public.market_convergence_assessments (ai_assessment_id)
  where ai_assessment_id is not null;

alter table public.market_convergence_runs enable row level security;

drop policy if exists market_convergence_runs_public_read on public.market_convergence_runs;
create policy market_convergence_runs_public_read
  on public.market_convergence_runs
  for select
  to anon, authenticated
  using (true);

revoke all on table public.market_convergence_runs from public, anon, authenticated;
grant select on table public.market_convergence_runs to anon, authenticated;
grant select, insert, update, delete on table public.market_convergence_runs to service_role;

create or replace function market_convergence.refresh_as_of_v1(
  p_cutoff_at timestamptz,
  p_instrument_id uuid default null
)
returns table (
  instruments_considered integer,
  eligible_pairs integer,
  fresh_pairs integer,
  stale_pairs integer,
  missing_input_instruments integer,
  rows_changed integer
)
language sql
set search_path = pg_catalog
as $function$
  with params as (
    select
      p_cutoff_at as cutoff_at,
      (p_cutoff_at at time zone 'America/New_York')::date as logical_date,
      4::integer as max_source_age_days
  ),
  universe as materialized (
    select i.id as instrument_id
    from public.instruments i
    where i.is_active is true
      and (p_instrument_id is null or i.id = p_instrument_id)
  ),
  eligible_technical as materialized (
    select distinct on (ms.instrument_id)
      ms.id,
      ms.instrument_id,
      ms.score_date,
      ms.overall_score,
      ms.confidence_score,
      ms.methodology_version,
      ms.calculated_at
    from public.market_scores ms
    join universe u on u.instrument_id = ms.instrument_id
    cross join params p
    where ms.methodology_version = 'technical-score-v1'
      and ms.score_status in ('complete', 'partial')
      and ms.overall_score between 0 and 100
      and ms.confidence_score between 0 and 100
      and ms.score_date <= p.logical_date
      and ms.calculated_at <= p.cutoff_at
    order by ms.instrument_id, ms.score_date desc, ms.calculated_at desc, ms.id desc
  ),
  eligible_ai as materialized (
    select distinct on (gma.instrument_id)
      gma.assessment_id,
      gma.instrument_id,
      gma.assessment_date,
      gma.rating,
      gma.score,
      gma.confidence,
      gma.methodology_version,
      gma.created_at
    from public.gpt_market_assessments gma
    join universe u on u.instrument_id = gma.instrument_id
    cross join params p
    where gma.methodology_version = 'independent-market-ai-v1'
      and gma.technical_engine_input_used is false
      and gma.score between 0 and 100
      and gma.confidence between 0 and 100
      and lower(gma.rating) in ('strong buy', 'buy', 'hold', 'sell', 'strong sell')
      and gma.assessment_date <= p.logical_date
      and gma.created_at <= p.cutoff_at
    order by gma.instrument_id, gma.assessment_date desc, gma.created_at desc, gma.assessment_id desc
  ),
  paired_candidates as materialized (
    select
      t.instrument_id,
      greatest(t.score_date, a.assessment_date) as assessment_date,
      t.id as technical_score_id,
      a.assessment_id as ai_assessment_id,
      t.score_date as technical_score_date,
      a.assessment_date as ai_assessment_date,
      t.methodology_version as technical_methodology_version,
      a.methodology_version as ai_methodology_version,
      t.overall_score as technical_score_raw,
      round(t.overall_score, 2) as technical_score,
      round(t.confidence_score, 2) as technical_confidence,
      round(a.score, 2) as ai_score,
      round(a.confidence, 2) as ai_confidence,
      initcap(lower(a.rating)) as ai_signal,
      p.logical_date,
      p.max_source_age_days,
      (p.logical_date - t.score_date) as technical_age_days,
      (p.logical_date - a.assessment_date) as ai_age_days
    from eligible_technical t
    join eligible_ai a using (instrument_id)
    cross join params p
  ),
  fresh_paired as materialized (
    select
      pc.*,
      case
        when pc.technical_score_raw >= 80 then 'Strong Buy'
        when pc.technical_score_raw >= 60 then 'Buy'
        when pc.technical_score_raw >= 40 then 'Hold'
        when pc.technical_score_raw >= 20 then 'Sell'
        else 'Strong Sell'
      end as technical_signal,
      case
        when pc.technical_score_raw >= 80 then 2
        when pc.technical_score_raw >= 60 then 1
        when pc.technical_score_raw >= 40 then 0
        when pc.technical_score_raw >= 20 then -1
        else -2
      end as technical_ordinal,
      case lower(pc.ai_signal)
        when 'strong buy' then 2
        when 'buy' then 1
        when 'hold' then 0
        when 'sell' then -1
        when 'strong sell' then -2
      end as ai_ordinal
    from paired_candidates pc
    where pc.technical_age_days between 0 and pc.max_source_age_days
      and pc.ai_age_days between 0 and pc.max_source_age_days
  ),
  classified as (
    select
      p.*,
      round((p.technical_score + p.ai_score) / 2, 2) as convergence_score,
      abs(p.technical_score - p.ai_score) as disagreement_gap,
      case
        when p.technical_ordinal <> 0 and p.ai_ordinal <> 0
          and sign(p.technical_ordinal) <> sign(p.ai_ordinal) then 'conflict'
        when abs(p.technical_score - p.ai_score) >= 25 then 'mixed'
        when abs(p.technical_score - p.ai_score) < 10 then 'aligned'
        else 'mild_disagreement'
      end as agreement_class
    from fresh_paired p
  ),
  calculated as (
    select
      c.*,
      round(least(
        sqrt(c.technical_confidence * c.ai_confidence)
          * (1 - c.disagreement_gap / 200::numeric),
        case c.agreement_class
          when 'conflict' then 40::numeric
          when 'mixed' then 60::numeric
          else 100::numeric
        end
      ), 2) as convergence_confidence,
      case
        when c.agreement_class = 'conflict' then 'conflict'
        when c.agreement_class = 'mixed' then 'mixed'
        when c.convergence_score >= 85 then 'very_strong_bullish'
        when c.convergence_score >= 70 then 'strong_bullish'
        when c.convergence_score >= 60 then 'moderate_bullish'
        when c.convergence_score >= 40 then 'neutral'
        when c.convergence_score >= 30 then 'moderate_bearish'
        when c.convergence_score >= 15 then 'strong_bearish'
        else 'very_strong_bearish'
      end as convergence_label
    from classified c
  ),
  finalised as (
    select
      c.*,
      format(
        'Technical %s (%s/100, confidence %s/100) and AI Market %s (%s/100, confidence %s/100) combine to %s (%s/100, confidence %s/100; %s; score gap %s). Sources: Technical %s via %s; AI Market %s via %s. Market Convergence is separate from Opportunity Assessment and is not investment advice.',
        c.technical_signal, c.technical_score, c.technical_confidence,
        c.ai_signal, c.ai_score, c.ai_confidence,
        c.convergence_label, c.convergence_score, c.convergence_confidence,
        c.agreement_class, c.disagreement_gap,
        c.technical_score_date, c.technical_methodology_version,
        c.ai_assessment_date, c.ai_methodology_version
      ) as summary
    from calculated c
  ),
  upserted as (
    insert into public.market_convergence_assessments (
      instrument_id, assessment_date, technical_score_id, ai_assessment_id,
      technical_score, technical_signal, technical_confidence,
      ai_score, ai_signal, ai_confidence,
      convergence_score, convergence_confidence, convergence_label, summary,
      methodology_version
    )
    select
      f.instrument_id, f.assessment_date, f.technical_score_id, f.ai_assessment_id,
      f.technical_score, f.technical_signal, f.technical_confidence,
      f.ai_score, f.ai_signal, f.ai_confidence,
      f.convergence_score, f.convergence_confidence, f.convergence_label, f.summary,
      'market-convergence-v1'
    from finalised f
    on conflict on constraint market_convergence_one_per_method
    do update set
      technical_score_id = excluded.technical_score_id,
      ai_assessment_id = excluded.ai_assessment_id,
      technical_score = excluded.technical_score,
      technical_signal = excluded.technical_signal,
      technical_confidence = excluded.technical_confidence,
      ai_score = excluded.ai_score,
      ai_signal = excluded.ai_signal,
      ai_confidence = excluded.ai_confidence,
      convergence_score = excluded.convergence_score,
      convergence_confidence = excluded.convergence_confidence,
      convergence_label = excluded.convergence_label,
      summary = excluded.summary,
      updated_at = statement_timestamp()
    where row(
      market_convergence_assessments.technical_score_id,
      market_convergence_assessments.ai_assessment_id,
      market_convergence_assessments.technical_score,
      market_convergence_assessments.technical_signal,
      market_convergence_assessments.technical_confidence,
      market_convergence_assessments.ai_score,
      market_convergence_assessments.ai_signal,
      market_convergence_assessments.ai_confidence,
      market_convergence_assessments.convergence_score,
      market_convergence_assessments.convergence_confidence,
      market_convergence_assessments.convergence_label,
      market_convergence_assessments.summary
    ) is distinct from row(
      excluded.technical_score_id, excluded.ai_assessment_id,
      excluded.technical_score, excluded.technical_signal, excluded.technical_confidence,
      excluded.ai_score, excluded.ai_signal, excluded.ai_confidence,
      excluded.convergence_score, excluded.convergence_confidence,
      excluded.convergence_label, excluded.summary
    )
    returning id
  ),
  stats as (
    select
      (select count(*) from universe)::integer as instruments_considered,
      (select count(*) from paired_candidates)::integer as eligible_pairs,
      (select count(*) from fresh_paired)::integer as fresh_pairs,
      ((select count(*) from paired_candidates) - (select count(*) from fresh_paired))::integer as stale_pairs,
      ((select count(*) from universe) - (select count(*) from paired_candidates))::integer as missing_input_instruments,
      (select count(*) from upserted)::integer as rows_changed
  )
  select * from stats;
$function$;

create or replace function market_convergence.refresh_v1(p_instrument_id uuid default null)
returns table (rows_changed integer)
language sql
set search_path = pg_catalog
as $function$
  select r.rows_changed
  from market_convergence.refresh_as_of_v1(statement_timestamp(), p_instrument_id) r;
$function$;

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
      where c.retry_of_run_id = v_parent.id and c.status in ('running', 'succeeded')
    ) then
      raise exception using errcode = '55000', message = 'retry target already has a running or successful child attempt';
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
      where c.retry_of_run_id = r.id and c.status in ('running', 'succeeded')
    )
  order by r.started_at desc
  limit 1;

  if v_failed_run_id is null then return null; end if;
  return market_convergence.run_v1('retry', v_failed_run_id, clock_timestamp(), null);
end;
$function$;

alter function market_convergence.refresh_as_of_v1(timestamptz, uuid) owner to postgres;
alter function market_convergence.refresh_v1(uuid) owner to postgres;
alter function market_convergence.run_v1(text, uuid, timestamptz, uuid) owner to postgres;
alter function market_convergence.retry_latest_failed_v1() owner to postgres;

revoke all on function market_convergence.refresh_as_of_v1(timestamptz, uuid) from public, anon, authenticated;
revoke all on function market_convergence.refresh_v1(uuid) from public, anon, authenticated;
revoke all on function market_convergence.run_v1(text, uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function market_convergence.retry_latest_failed_v1() from public, anon, authenticated;

grant execute on function market_convergence.refresh_as_of_v1(timestamptz, uuid) to service_role;
grant execute on function market_convergence.refresh_v1(uuid) to service_role;
grant execute on function market_convergence.run_v1(text, uuid, timestamptz, uuid) to service_role;
grant execute on function market_convergence.retry_latest_failed_v1() to service_role;
