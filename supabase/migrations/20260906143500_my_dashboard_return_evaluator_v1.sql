-- MYDASH-007 phase 1: immutable return ledger and deterministic entry resolution.
-- This migration does not schedule evaluation, apply itself, access a broker or trade.

create table public.personal_return_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  decision_id uuid not null,
  checkpoint_code text not null,
  evaluation_cutoff timestamptz not null,
  evaluated_at timestamptz not null default clock_timestamp(),
  entry_observation_id bigint references public.market_observations(id) on delete restrict,
  exit_observation_id bigint references public.market_observations(id) on delete restrict,
  entry_price numeric(30,12),
  exit_price numeric(30,12),
  entry_fx_observation_id bigint references public.market_observations(id) on delete restrict,
  exit_fx_observation_id bigint references public.market_observations(id) on delete restrict,
  entry_fx_rate numeric(30,16),
  exit_fx_rate numeric(30,16),
  benchmark_entry_observation_id bigint references public.market_observations(id) on delete restrict,
  benchmark_exit_observation_id bigint references public.market_observations(id) on delete restrict,
  price_return numeric(30,16),
  adjusted_return numeric(30,16),
  base_currency_return numeric(30,16),
  benchmark_return numeric(30,16),
  excess_return numeric(30,16),
  net_simulated_return numeric(30,16),
  maximum_drawdown numeric(30,16),
  quality_status text not null,
  quality_reasons text[] not null default '{}',
  source_identity_hash text not null,
  calculation_version text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint personal_return_snapshots_parent_owner_fk foreign key (decision_id, owner_user_id)
    references public.personal_decisions(id, owner_user_id) on delete cascade,
  constraint personal_return_snapshots_identity_key
    unique (decision_id, checkpoint_code, evaluation_cutoff, calculation_version),
  constraint personal_return_snapshots_checkpoint_check
    check (checkpoint_code in ('OPEN', '5D', '20D', '60D', 'EXIT')),
  constraint personal_return_snapshots_quality_check
    check (quality_status in ('CALCULATION_ERROR', 'MAPPING_REQUIRED', 'STALE_SOURCE', 'PENDING_ENTRY', 'PENDING_HORIZON', 'INCOMPLETE_FX', 'COMPLETE_BASE_CURRENCY', 'COMPLETE_PRICE_ONLY')),
  constraint personal_return_snapshots_version_check
    check (calculation_version = 'personal-forward-return-v1'),
  constraint personal_return_snapshots_cutoff_check check (evaluation_cutoff <= evaluated_at),
  constraint personal_return_snapshots_entry_price_check check (entry_price is null or entry_price > 0),
  constraint personal_return_snapshots_exit_price_check check (exit_price is null or exit_price > 0),
  constraint personal_return_snapshots_entry_fx_check check (entry_fx_rate is null or entry_fx_rate > 0),
  constraint personal_return_snapshots_exit_fx_check check (exit_fx_rate is null or exit_fx_rate > 0),
  constraint personal_return_snapshots_drawdown_check check (maximum_drawdown is null or maximum_drawdown <= 0),
  constraint personal_return_snapshots_entry_pair_check check ((entry_observation_id is null) = (entry_price is null)),
  constraint personal_return_snapshots_exit_pair_check check ((exit_observation_id is null) = (exit_price is null)),
  constraint personal_return_snapshots_benchmark_pair_check check (
    (benchmark_entry_observation_id is null) = (benchmark_exit_observation_id is null)
  ),
  constraint personal_return_snapshots_source_hash_check check (source_identity_hash ~ '^[0-9a-f]{64}$')
);

create index personal_return_snapshots_owner_decision_idx
  on public.personal_return_snapshots (owner_user_id, decision_id, evaluation_cutoff desc);
create index personal_return_snapshots_entry_observation_idx
  on public.personal_return_snapshots (entry_observation_id) where entry_observation_id is not null;
create index personal_return_snapshots_exit_observation_idx
  on public.personal_return_snapshots (exit_observation_id) where exit_observation_id is not null;

create or replace function public.reject_personal_return_snapshot_mutation_v1()
returns trigger language plpgsql set search_path = pg_catalog as $$
begin
  raise exception 'Personal return evidence is immutable';
end;
$$;

create trigger personal_return_snapshots_immutable
before update or delete on public.personal_return_snapshots
for each row execute function public.reject_personal_return_snapshot_mutation_v1();

alter table public.personal_return_snapshots enable row level security;

create policy personal_return_snapshots_owner_select on public.personal_return_snapshots
for select to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
  and exists (
    select 1 from public.personal_decisions d
    where d.id = decision_id and d.owner_user_id = owner_user_id
  )
);

revoke all on table public.personal_return_snapshots from public, anon, authenticated;
grant select on table public.personal_return_snapshots to authenticated;
grant all on table public.personal_return_snapshots to service_role;

-- Internal evaluator primitive. It selects one authoritative provider mapping and
-- the first distinct canonical session strictly after this decision's own clock.
-- The evaluation cutoff prevents a caller from observing future evidence.
create or replace function public.resolve_personal_decision_entry_v1(
  p_decision_id uuid,
  p_evaluation_cutoff timestamptz
)
returns table (
  quality_status text,
  quality_reasons text[],
  entry_observation_id bigint,
  entry_observed_at timestamptz,
  entry_price numeric
)
language plpgsql
security definer
set search_path = pg_catalog, public
stable
as $$
declare
  v_decision public.personal_decisions;
  v_provider_id uuid;
  v_provider_count integer;
begin
  if p_evaluation_cutoff is null or p_evaluation_cutoff > statement_timestamp() then
    raise exception 'Evaluation cutoff must be persisted and non-future';
  end if;

  select d.* into v_decision
  from public.personal_decisions d
  where d.id = p_decision_id;

  if not found then raise exception 'Decision not found'; end if;
  if p_evaluation_cutoff < v_decision.decision_at then
    raise exception 'Evaluation cutoff precedes decision clock';
  end if;
  if v_decision.entry_rule <> 'NEXT_DAILY_CLOSE' or v_decision.calculation_version <> 'personal-forward-return-v1' then
    raise exception 'Unsupported decision evaluation contract';
  end if;

  select count(*)
  into v_provider_count
  from public.data_providers dp
  join public.provider_instruments pi on pi.provider_id = dp.id
  where dp.provider_code = 'tiingo'
    and dp.is_active
    and pi.is_active
    and pi.instrument_id = v_decision.instrument_id;

  if v_provider_count <> 1 then
    return query select 'MAPPING_REQUIRED'::text, array['CANONICAL_PROVIDER_MAPPING_UNAVAILABLE']::text[], null::bigint, null::timestamptz, null::numeric;
    return;
  end if;

  select dp.id into strict v_provider_id
  from public.data_providers dp
  join public.provider_instruments pi on pi.provider_id = dp.id
  where dp.provider_code = 'tiingo'
    and dp.is_active
    and pi.is_active
    and pi.instrument_id = v_decision.instrument_id;

  return query
  with canonical_sessions as (
    select mo.id, mo.observed_at, mo.close,
      row_number() over (partition by mo.observed_at order by mo.id) as session_row
    from public.market_observations mo
    where mo.instrument_id = v_decision.instrument_id
      and mo.provider_id = v_provider_id
      and mo.interval_code = '1day'
      and mo.observed_at > v_decision.decision_at
      and mo.observed_at <= p_evaluation_cutoff
  ), entry as (
    select cs.id, cs.observed_at, cs.close
    from canonical_sessions cs
    where cs.session_row = 1
    order by cs.observed_at
    limit 1
  )
  select
    case when e.id is null then 'PENDING_ENTRY' else 'PENDING_HORIZON' end::text,
    case when e.id is null then array['NO_ELIGIBLE_SESSION_AT_CUTOFF']::text[] else array['ENTRY_RESOLVED']::text[] end,
    e.id, e.observed_at, e.close
  from (select 1) seed
  left join entry e on true;
end;
$$;

revoke all on function public.resolve_personal_decision_entry_v1(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.resolve_personal_decision_entry_v1(uuid, timestamptz) to service_role;

-- Internal INSERT-only evaluator. Checkpoint selection is bounded by the supplied
-- cutoff, and retry identity is derived only from immutable persisted inputs.
create or replace function private.evaluate_personal_return_checkpoint_v1(
  p_decision_id uuid,
  p_checkpoint_code text,
  p_evaluation_cutoff timestamptz
)
returns public.personal_return_snapshots
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $$
declare
  v_decision public.personal_decisions;
  v_provider_id uuid;
  v_provider_count integer;
  v_entry_quality text;
  v_entry_reasons text[];
  v_entry_id bigint;
  v_entry_at timestamptz;
  v_entry_price numeric;
  v_exit_id bigint;
  v_exit_at timestamptz;
  v_exit_price numeric;
  v_exit_event_at timestamptz;
  v_target_sessions integer;
  v_entry_fx_id bigint;
  v_exit_fx_id bigint;
  v_entry_fx_rate numeric;
  v_exit_fx_rate numeric;
  v_entry_fx_count integer;
  v_exit_fx_count integer;
  v_benchmark_provider_id uuid;
  v_benchmark_provider_count integer;
  v_benchmark_entry_id bigint;
  v_benchmark_exit_id bigint;
  v_benchmark_entry_price numeric;
  v_benchmark_exit_price numeric;
  v_quality text;
  v_reasons text[] := '{}';
  v_price_return numeric;
  v_base_return numeric;
  v_benchmark_return numeric;
  v_excess_return numeric;
  v_net_return numeric;
  v_maximum_drawdown numeric;
  v_units numeric;
  v_source_hash text;
  v_result public.personal_return_snapshots;
begin
  if p_checkpoint_code not in ('OPEN', '5D', '20D', '60D', 'EXIT') then
    raise exception 'Unsupported return checkpoint';
  end if;
  if p_evaluation_cutoff is null or p_evaluation_cutoff > statement_timestamp() then
    raise exception 'Evaluation cutoff must be persisted and non-future';
  end if;

  select d.* into v_decision
  from public.personal_decisions d
  where d.id = p_decision_id;
  if not found then raise exception 'Decision not found'; end if;
  if p_evaluation_cutoff < v_decision.decision_at then
    raise exception 'Evaluation cutoff precedes decision clock';
  end if;

  select r.quality_status, r.quality_reasons, r.entry_observation_id,
         r.entry_observed_at, r.entry_price
  into v_entry_quality, v_entry_reasons, v_entry_id, v_entry_at, v_entry_price
  from public.resolve_personal_decision_entry_v1(p_decision_id, p_evaluation_cutoff) r;

  v_quality := v_entry_quality;
  v_reasons := v_entry_reasons;

  if v_entry_id is not null and (v_entry_price is null or v_entry_price <= 0) then
    v_quality := 'CALCULATION_ERROR';
    v_reasons := array['INVALID_ENTRY_CLOSE'];
    v_entry_id := null;
    v_entry_at := null;
    v_entry_price := null;
  end if;

  if v_entry_id is not null then
    select count(*)
    into v_provider_count
    from public.data_providers dp
    join public.provider_instruments pi on pi.provider_id = dp.id
    where dp.provider_code = 'tiingo'
      and dp.is_active
      and pi.is_active
      and pi.instrument_id = v_decision.instrument_id;

    if v_provider_count <> 1 then
      v_quality := 'MAPPING_REQUIRED';
      v_reasons := array['CANONICAL_PROVIDER_MAPPING_UNAVAILABLE'];
      v_entry_id := null;
      v_entry_at := null;
      v_entry_price := null;
    else
      select dp.id into strict v_provider_id
      from public.data_providers dp
      join public.provider_instruments pi on pi.provider_id = dp.id
      where dp.provider_code = 'tiingo'
        and dp.is_active
        and pi.is_active
        and pi.instrument_id = v_decision.instrument_id;
    end if;

    if v_provider_count = 1 and p_checkpoint_code = 'EXIT' then
      select min(e.event_at) into v_exit_event_at
      from public.personal_decision_events e
      where e.decision_id = p_decision_id
        and e.owner_user_id = v_decision.owner_user_id
        and e.event_type = 'EXIT'
        and e.event_at <= p_evaluation_cutoff;

      if v_exit_event_at is null then
        v_quality := 'PENDING_HORIZON';
        v_reasons := array['EXIT_EVENT_NOT_AVAILABLE_AT_CUTOFF'];
      else
        select mo.id, mo.observed_at, mo.close
        into v_exit_id, v_exit_at, v_exit_price
        from public.market_observations mo
        where mo.instrument_id = v_decision.instrument_id
          and mo.provider_id = v_provider_id
          and mo.interval_code = '1day'
          and mo.observed_at > v_exit_event_at
          and mo.observed_at <= p_evaluation_cutoff
        order by mo.observed_at, mo.id
        limit 1;
      end if;
    elsif v_provider_count = 1 and p_checkpoint_code = 'OPEN' then
      select mo.id, mo.observed_at, mo.close
      into v_exit_id, v_exit_at, v_exit_price
      from public.market_observations mo
      where mo.instrument_id = v_decision.instrument_id
        and mo.provider_id = v_provider_id
        and mo.interval_code = '1day'
        and mo.observed_at >= v_entry_at
        and mo.observed_at <= p_evaluation_cutoff
      order by mo.observed_at desc, mo.id desc
      limit 1;
    elsif v_provider_count = 1 then
      v_target_sessions := case p_checkpoint_code when '5D' then 5 when '20D' then 20 else 60 end;
      with later_sessions as (
        select mo.id, mo.observed_at, mo.close,
               row_number() over (order by mo.observed_at, mo.id) as session_number
        from public.market_observations mo
        where mo.instrument_id = v_decision.instrument_id
          and mo.provider_id = v_provider_id
          and mo.interval_code = '1day'
          and mo.observed_at > v_entry_at
          and mo.observed_at <= p_evaluation_cutoff
      )
      select ls.id, ls.observed_at, ls.close
      into v_exit_id, v_exit_at, v_exit_price
      from later_sessions ls
      where ls.session_number = v_target_sessions;
    end if;

    if v_exit_id is null and v_quality not in ('CALCULATION_ERROR', 'MAPPING_REQUIRED') then
      v_quality := 'PENDING_HORIZON';
      if p_checkpoint_code <> 'EXIT' or v_exit_event_at is not null then
        v_reasons := array['CHECKPOINT_SESSION_NOT_AVAILABLE_AT_CUTOFF'];
      end if;
    elsif v_exit_id is not null and (v_exit_price is null or v_exit_price <= 0) then
      v_quality := 'CALCULATION_ERROR';
      v_reasons := array['INVALID_CHECKPOINT_CLOSE'];
      v_exit_id := null;
      v_exit_at := null;
      v_exit_price := null;
    elsif v_exit_id is not null then
      v_price_return := (v_exit_price / v_entry_price) - 1;
      v_reasons := array['RAW_CLOSE_RETURN', 'UNVERIFIED_CORPORATE_ACTIONS'];

      if v_decision.instrument_currency = v_decision.base_currency then
        v_entry_fx_rate := 1;
        v_exit_fx_rate := 1;
        v_base_return := v_price_return;
        v_quality := 'COMPLETE_BASE_CURRENCY';
      else
        select count(*) into v_entry_fx_count
        from public.instruments i
        join public.provider_instruments pi on pi.instrument_id = i.id and pi.is_active
        join public.data_providers dp on dp.id = pi.provider_id and dp.is_active
        join public.market_observations mo on mo.instrument_id = i.id and mo.provider_id = dp.id
        where i.is_active and i.asset_type = 'forex'
          and upper(i.symbol) in (
            upper(btrim(v_decision.instrument_currency) || '/' || btrim(v_decision.base_currency)),
            upper(btrim(v_decision.base_currency) || '/' || btrim(v_decision.instrument_currency))
          )
          and dp.provider_code = 'tiingo'
          and mo.interval_code = '1day'
          and mo.observed_at = v_entry_at
          and mo.close > 0;

        select count(*) into v_exit_fx_count
        from public.instruments i
        join public.provider_instruments pi on pi.instrument_id = i.id and pi.is_active
        join public.data_providers dp on dp.id = pi.provider_id and dp.is_active
        join public.market_observations mo on mo.instrument_id = i.id and mo.provider_id = dp.id
        where i.is_active and i.asset_type = 'forex'
          and upper(i.symbol) in (
            upper(btrim(v_decision.instrument_currency) || '/' || btrim(v_decision.base_currency)),
            upper(btrim(v_decision.base_currency) || '/' || btrim(v_decision.instrument_currency))
          )
          and dp.provider_code = 'tiingo'
          and mo.interval_code = '1day'
          and mo.observed_at = v_exit_at
          and mo.close > 0;

        if v_entry_fx_count > 1 or v_exit_fx_count > 1 then
          v_quality := 'CALCULATION_ERROR';
          v_reasons := array_append(v_reasons, 'AMBIGUOUS_EXACT_FX');
        elsif v_entry_fx_count = 0 or v_exit_fx_count = 0 then
          v_quality := 'INCOMPLETE_FX';
          v_reasons := array_append(v_reasons, 'MISSING_EXACT_FX');
        else
          select mo.id,
                 case
                   when upper(i.symbol) = upper(btrim(v_decision.instrument_currency) || '/' || btrim(v_decision.base_currency)) then mo.close
                   else 1 / mo.close
                 end
          into strict v_entry_fx_id, v_entry_fx_rate
          from public.instruments i
          join public.provider_instruments pi on pi.instrument_id = i.id and pi.is_active
          join public.data_providers dp on dp.id = pi.provider_id and dp.is_active
          join public.market_observations mo on mo.instrument_id = i.id and mo.provider_id = dp.id
          where i.is_active and i.asset_type = 'forex'
            and upper(i.symbol) in (
              upper(btrim(v_decision.instrument_currency) || '/' || btrim(v_decision.base_currency)),
              upper(btrim(v_decision.base_currency) || '/' || btrim(v_decision.instrument_currency))
            )
            and dp.provider_code = 'tiingo'
            and mo.interval_code = '1day' and mo.observed_at = v_entry_at and mo.close > 0;

          select mo.id,
                 case
                   when upper(i.symbol) = upper(btrim(v_decision.instrument_currency) || '/' || btrim(v_decision.base_currency)) then mo.close
                   else 1 / mo.close
                 end
          into strict v_exit_fx_id, v_exit_fx_rate
          from public.instruments i
          join public.provider_instruments pi on pi.instrument_id = i.id and pi.is_active
          join public.data_providers dp on dp.id = pi.provider_id and dp.is_active
          join public.market_observations mo on mo.instrument_id = i.id and mo.provider_id = dp.id
          where i.is_active and i.asset_type = 'forex'
            and upper(i.symbol) in (
              upper(btrim(v_decision.instrument_currency) || '/' || btrim(v_decision.base_currency)),
              upper(btrim(v_decision.base_currency) || '/' || btrim(v_decision.instrument_currency))
            )
            and dp.provider_code = 'tiingo'
            and mo.interval_code = '1day' and mo.observed_at = v_exit_at and mo.close > 0;

          v_base_return := ((v_exit_price * v_exit_fx_rate) / (v_entry_price * v_entry_fx_rate)) - 1;
          v_quality := 'COMPLETE_BASE_CURRENCY';
        end if;
      end if;

      if v_decision.benchmark_mode <> 'NONE' then
        select count(*) into v_benchmark_provider_count
        from public.data_providers dp
        join public.provider_instruments pi on pi.provider_id = dp.id
        where dp.provider_code = 'tiingo' and dp.is_active and pi.is_active
          and pi.instrument_id = v_decision.benchmark_instrument_id;

        if v_benchmark_provider_count = 1 then
          select dp.id into strict v_benchmark_provider_id
          from public.data_providers dp
          join public.provider_instruments pi on pi.provider_id = dp.id
          where dp.provider_code = 'tiingo' and dp.is_active and pi.is_active
            and pi.instrument_id = v_decision.benchmark_instrument_id;

          select mo.id, mo.close into v_benchmark_entry_id, v_benchmark_entry_price
          from public.market_observations mo
          where mo.instrument_id = v_decision.benchmark_instrument_id
            and mo.provider_id = v_benchmark_provider_id and mo.interval_code = '1day'
            and mo.observed_at = v_entry_at and mo.close > 0;

          select mo.id, mo.close into v_benchmark_exit_id, v_benchmark_exit_price
          from public.market_observations mo
          where mo.instrument_id = v_decision.benchmark_instrument_id
            and mo.provider_id = v_benchmark_provider_id and mo.interval_code = '1day'
            and mo.observed_at = v_exit_at and mo.close > 0;
        end if;

        if v_benchmark_entry_id is null or v_benchmark_exit_id is null then
          v_benchmark_entry_id := null;
          v_benchmark_exit_id := null;
          v_reasons := array_append(v_reasons, 'MISSING_BENCHMARK');
        else
          v_benchmark_return := (v_benchmark_exit_price / v_benchmark_entry_price) - 1;
          v_excess_return := v_price_return - v_benchmark_return;
        end if;
      end if;

      if exists (
        select 1 from public.market_observations mo
        where mo.instrument_id = v_decision.instrument_id and mo.provider_id = v_provider_id
          and mo.interval_code = '1day' and mo.observed_at between v_entry_at and v_exit_at
          and (mo.close is null or mo.close <= 0)
      ) then
        v_quality := 'CALCULATION_ERROR';
        v_reasons := array_append(v_reasons, 'INVALID_DRAWDOWN_CLOSE');
      else
        with valuation_path as (
          select mo.observed_at, mo.close,
                 max(mo.close) over (order by mo.observed_at rows between unbounded preceding and current row) as running_peak
          from public.market_observations mo
          where mo.instrument_id = v_decision.instrument_id and mo.provider_id = v_provider_id
            and mo.interval_code = '1day' and mo.observed_at between v_entry_at and v_exit_at
        )
        select min((vp.close / vp.running_peak) - 1) into v_maximum_drawdown
        from valuation_path vp;
      end if;

      if v_decision.action = 'BUY' then
        v_units := v_decision.notional_amount
          * (1 - (v_decision.entry_fee_bps / 10000))
          / (v_entry_price * (1 + (v_decision.entry_slippage_bps / 10000)));
        v_net_return := (
          v_units * v_exit_price
          * (1 - (v_decision.exit_slippage_bps / 10000))
          * (1 - (v_decision.exit_fee_bps / 10000))
          / v_decision.notional_amount
        ) - 1;
      else
        v_reasons := array_append(v_reasons, 'OBSERVATIONAL_ONLY');
      end if;
    end if;
  end if;

  v_source_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'calculation_version', 'personal-forward-return-v1',
    'checkpoint_code', p_checkpoint_code,
    'decision_id', v_decision.id,
    'decision_source_hash', v_decision.source_hash,
    'evaluation_cutoff', p_evaluation_cutoff,
    'entry_observation_id', v_entry_id,
    'exit_observation_id', v_exit_id,
    'entry_price', v_entry_price,
    'exit_price', v_exit_price,
    'entry_fx_observation_id', v_entry_fx_id,
    'exit_fx_observation_id', v_exit_fx_id,
    'entry_fx_rate', v_entry_fx_rate,
    'exit_fx_rate', v_exit_fx_rate,
    'benchmark_entry_observation_id', v_benchmark_entry_id,
    'benchmark_exit_observation_id', v_benchmark_exit_id,
    'benchmark_return', v_benchmark_return,
    'base_currency_return', v_base_return,
    'excess_return', v_excess_return,
    'maximum_drawdown', v_maximum_drawdown,
    'quality_status', v_quality,
    'quality_reasons', to_jsonb(v_reasons)
  )::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.personal_return_snapshots (
    owner_user_id, decision_id, checkpoint_code, evaluation_cutoff,
    entry_observation_id, exit_observation_id, entry_price, exit_price,
    entry_fx_observation_id, exit_fx_observation_id, entry_fx_rate, exit_fx_rate,
    benchmark_entry_observation_id, benchmark_exit_observation_id,
    price_return, adjusted_return, base_currency_return, benchmark_return,
    excess_return, net_simulated_return, maximum_drawdown, quality_status,
    quality_reasons, source_identity_hash, calculation_version
  ) values (
    v_decision.owner_user_id, v_decision.id, p_checkpoint_code, p_evaluation_cutoff,
    v_entry_id, v_exit_id, v_entry_price, v_exit_price,
    v_entry_fx_id, v_exit_fx_id, v_entry_fx_rate, v_exit_fx_rate,
    v_benchmark_entry_id, v_benchmark_exit_id,
    v_price_return, null, v_base_return, v_benchmark_return,
    v_excess_return, v_net_return, v_maximum_drawdown, v_quality,
    v_reasons, v_source_hash, 'personal-forward-return-v1'
  )
  on conflict (decision_id, checkpoint_code, evaluation_cutoff, calculation_version)
  do nothing
  returning * into v_result;

  if v_result.id is null then
    select s.* into v_result
    from public.personal_return_snapshots s
    where s.decision_id = v_decision.id
      and s.checkpoint_code = p_checkpoint_code
      and s.evaluation_cutoff = p_evaluation_cutoff
      and s.calculation_version = 'personal-forward-return-v1';

    if v_result.source_identity_hash <> v_source_hash then
      raise exception 'CALCULATION_ERROR: immutable checkpoint source conflict';
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function private.evaluate_personal_return_checkpoint_v1(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function private.evaluate_personal_return_checkpoint_v1(uuid, text, timestamptz)
  to service_role;

create table private.personal_return_evaluator_runs (
  id uuid primary key default gen_random_uuid(),
  evaluation_cutoff timestamptz not null,
  trigger_reason text not null,
  target_decision_id uuid references public.personal_decisions(id) on delete restrict,
  calculation_version text not null default 'personal-forward-return-v1',
  status text not null default 'running',
  attempt_count integer not null default 1,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  decisions_considered integer not null default 0,
  checkpoints_succeeded integer not null default 0,
  checkpoints_failed integer not null default 0,
  error_message text,
  constraint personal_return_evaluator_runs_trigger_check
    check (trigger_reason in ('scheduled', 'manual', 'retry')),
  constraint personal_return_evaluator_runs_status_check
    check (status in ('running', 'succeeded', 'failed')),
  constraint personal_return_evaluator_runs_attempt_check check (attempt_count >= 1),
  constraint personal_return_evaluator_runs_counts_check check (
    decisions_considered >= 0 and checkpoints_succeeded >= 0 and checkpoints_failed >= 0
  ),
  constraint personal_return_evaluator_runs_completion_check check (
    (status = 'running' and completed_at is null) or
    (status in ('succeeded', 'failed') and completed_at is not null)
  )
);

create unique index personal_return_evaluator_runs_identity_uidx
  on private.personal_return_evaluator_runs (
    evaluation_cutoff, trigger_reason, calculation_version, target_decision_id
  ) nulls not distinct;

create table private.personal_return_evaluator_results (
  run_id uuid not null references private.personal_return_evaluator_runs(id) on delete cascade,
  decision_id uuid not null references public.personal_decisions(id) on delete restrict,
  checkpoint_code text not null,
  snapshot_id uuid references public.personal_return_snapshots(id) on delete restrict,
  status text not null,
  quality_status text,
  error_message text,
  completed_at timestamptz not null default clock_timestamp(),
  primary key (run_id, decision_id, checkpoint_code),
  constraint personal_return_evaluator_results_checkpoint_check
    check (checkpoint_code in ('OPEN', '5D', '20D', '60D', 'EXIT')),
  constraint personal_return_evaluator_results_status_check
    check (status in ('succeeded', 'failed')),
  constraint personal_return_evaluator_results_outcome_check check (
    (status = 'succeeded' and snapshot_id is not null and quality_status is not null and error_message is null) or
    (status = 'failed' and snapshot_id is null and quality_status = 'CALCULATION_ERROR' and error_message is not null)
  )
);

revoke all on table private.personal_return_evaluator_runs from public, anon, authenticated;
revoke all on table private.personal_return_evaluator_results from public, anon, authenticated;
grant select, insert, update on table private.personal_return_evaluator_runs to service_role;
grant select, insert, update on table private.personal_return_evaluator_results to service_role;

create or replace function private.run_personal_return_evaluator_v1(
  p_trigger_reason text,
  p_evaluation_cutoff timestamptz,
  p_decision_id uuid default null
)
returns private.personal_return_evaluator_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.personal_return_evaluator_runs;
  v_decision record;
  v_checkpoint text;
  v_snapshot public.personal_return_snapshots;
  v_error text;
  v_decisions integer := 0;
  v_succeeded integer := 0;
  v_failed integer := 0;
begin
  if p_trigger_reason not in ('scheduled', 'manual', 'retry') then
    raise exception 'Unsupported evaluator trigger';
  end if;
  if p_evaluation_cutoff is null or p_evaluation_cutoff > statement_timestamp() then
    raise exception 'Evaluation cutoff must be present and non-future';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_evaluation_cutoff::text || '|' || p_trigger_reason || '|' ||
    coalesce(p_decision_id::text, 'ALL') || '|personal-forward-return-v1', 0
  ));

  select r.* into v_run
  from private.personal_return_evaluator_runs r
  where r.evaluation_cutoff = p_evaluation_cutoff
    and r.trigger_reason = p_trigger_reason
    and r.calculation_version = 'personal-forward-return-v1'
    and r.target_decision_id is not distinct from p_decision_id
  for update;

  if found and v_run.status = 'succeeded' then
    return v_run;
  elsif found then
    update private.personal_return_evaluator_runs
    set status = 'running', attempt_count = attempt_count + 1,
        started_at = clock_timestamp(), completed_at = null,
        decisions_considered = 0, checkpoints_succeeded = 0,
        checkpoints_failed = 0, error_message = null
    where id = v_run.id
    returning * into v_run;
    delete from private.personal_return_evaluator_results rr where rr.run_id = v_run.id;
  else
    insert into private.personal_return_evaluator_runs (evaluation_cutoff, trigger_reason, target_decision_id)
    values (p_evaluation_cutoff, p_trigger_reason, p_decision_id)
    returning * into v_run;
  end if;

  for v_decision in
    select d.id, d.horizon_sessions,
      exists (
        select 1 from public.personal_decision_events e
        where e.owner_user_id = d.owner_user_id
          and e.decision_id = d.id
          and e.event_type = 'EXIT'
          and e.event_at <= p_evaluation_cutoff
      ) as has_exit
    from public.personal_decisions d
    where d.decision_at <= p_evaluation_cutoff
      and (p_decision_id is null or d.id = p_decision_id)
    order by d.id
  loop
    v_decisions := v_decisions + 1;
    foreach v_checkpoint in array array[
      'OPEN',
      v_decision.horizon_sessions::text || 'D',
      case when v_decision.has_exit then 'EXIT' else null end
    ]
    loop
      continue when v_checkpoint is null;
      begin
        v_snapshot := private.evaluate_personal_return_checkpoint_v1(
          v_decision.id, v_checkpoint, p_evaluation_cutoff
        );
        insert into private.personal_return_evaluator_results (
          run_id, decision_id, checkpoint_code, snapshot_id, status, quality_status
        ) values (
          v_run.id, v_decision.id, v_checkpoint, v_snapshot.id, 'succeeded', v_snapshot.quality_status
        );
        v_succeeded := v_succeeded + 1;
      exception when others then
        v_error := left(sqlstate || ': ' || sqlerrm, 1000);
        insert into private.personal_return_evaluator_results (
          run_id, decision_id, checkpoint_code, status, quality_status, error_message
        ) values (
          v_run.id, v_decision.id, v_checkpoint, 'failed', 'CALCULATION_ERROR', v_error
        );
        v_failed := v_failed + 1;
      end;
    end loop;
  end loop;

  update private.personal_return_evaluator_runs
  set status = case when v_failed = 0 then 'succeeded' else 'failed' end,
      completed_at = clock_timestamp(), decisions_considered = v_decisions,
      checkpoints_succeeded = v_succeeded, checkpoints_failed = v_failed,
      error_message = case when v_failed = 0 then null else v_failed::text || ' checkpoint evaluation(s) failed' end
  where id = v_run.id
  returning * into v_run;

  return v_run;
end;
$$;

revoke all on function private.run_personal_return_evaluator_v1(text, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function private.run_personal_return_evaluator_v1(text, timestamptz, uuid)
  to service_role;

comment on table public.personal_return_snapshots is
  'Immutable owner-scoped deterministic forward-return evidence. Browser read only; no broker or execution authority.';
comment on function public.resolve_personal_decision_entry_v1(uuid, timestamptz) is
  'Internal deterministic NEXT_DAILY_CLOSE resolver bounded by the decision clock and evaluation cutoff.';
comment on function private.evaluate_personal_return_checkpoint_v1(uuid, text, timestamptz) is
  'Internal INSERT-only deterministic checkpoint evaluator. Identical retries return immutable evidence; divergent retries fail.';
comment on table private.personal_return_evaluator_runs is
  'Internal non-browser evaluator telemetry. Scheduling is intentionally not installed by MYDASH-007.';
comment on table private.personal_return_evaluator_results is
  'Internal per-checkpoint evaluator outcomes with bounded failure evidence and immutable snapshot references.';
comment on function private.run_personal_return_evaluator_v1(text, timestamptz, uuid) is
  'Service-only deterministic batch evaluator at one explicit non-future cutoff. No broker, order or scheduler authority.';
