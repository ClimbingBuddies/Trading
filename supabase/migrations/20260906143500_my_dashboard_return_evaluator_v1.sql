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

comment on table public.personal_return_snapshots is
  'Immutable owner-scoped deterministic forward-return evidence. Browser read only; no broker or execution authority.';
comment on function public.resolve_personal_decision_entry_v1(uuid, timestamptz) is
  'Internal deterministic NEXT_DAILY_CLOSE resolver bounded by the decision clock and evaluation cutoff.';
