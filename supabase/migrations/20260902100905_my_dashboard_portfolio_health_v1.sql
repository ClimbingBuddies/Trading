-- MYDASH-004: permanent-user portfolios, positions and immutable health snapshots.
-- This migration is authored locally first and is not applied by its creation cycle.

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  portfolio_kind text not null,
  base_currency character(3) not null,
  status text not null default 'active',
  target_allocations jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint portfolios_owner_identity_key unique (id, owner_user_id),
  constraint portfolios_name_check check (length(btrim(name)) between 1 and 120),
  constraint portfolios_kind_check check (portfolio_kind in ('manual', 'paper')),
  constraint portfolios_currency_check check (base_currency = upper(base_currency) and base_currency ~ '^[A-Z]{3}$'),
  constraint portfolios_status_check check (status in ('active', 'archived')),
  constraint portfolios_target_allocations_check check (target_allocations is null or jsonb_typeof(target_allocations) = 'object')
);

create unique index portfolios_owner_active_name_key
  on public.portfolios (owner_user_id, lower(btrim(name)))
  where status = 'active';

create index portfolios_owner_idx on public.portfolios (owner_user_id);

create table public.portfolio_positions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null,
  instrument_id uuid not null references public.instruments(id) on delete restrict,
  quantity numeric(30,12) not null,
  average_cost_per_unit numeric(30,12),
  cost_currency character(3) not null,
  acquired_at date,
  position_source text not null,
  source_decision_id uuid,
  notes text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint portfolio_positions_parent_owner_fk
    foreign key (portfolio_id, owner_user_id)
    references public.portfolios(id, owner_user_id)
    on delete cascade,
  constraint portfolio_positions_portfolio_instrument_key unique (portfolio_id, instrument_id),
  constraint portfolio_positions_quantity_check check (quantity > 0),
  constraint portfolio_positions_average_cost_check check (average_cost_per_unit is null or average_cost_per_unit >= 0),
  constraint portfolio_positions_currency_check check (cost_currency = upper(cost_currency) and cost_currency ~ '^[A-Z]{3}$'),
  constraint portfolio_positions_source_check check (position_source in ('manual', 'paper_decision')),
  constraint portfolio_positions_source_decision_check check (
    (position_source = 'manual') or
    (position_source = 'paper_decision' and source_decision_id is not null)
  )
);

create index portfolio_positions_owner_idx on public.portfolio_positions (owner_user_id);
create index portfolio_positions_instrument_idx on public.portfolio_positions (instrument_id);

create table public.portfolio_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null,
  source_cutoff timestamptz not null,
  evaluated_at timestamptz not null default clock_timestamp(),
  total_value numeric(30,12),
  base_currency character(3) not null,
  measures jsonb not null,
  summary_status text not null,
  completeness_pct numeric(5,2) not null,
  completeness_reasons text[] not null default '{}',
  methodology_version text not null,
  source_hash text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint portfolio_health_snapshots_parent_owner_fk
    foreign key (portfolio_id, owner_user_id)
    references public.portfolios(id, owner_user_id)
    on delete cascade,
  constraint portfolio_health_snapshots_identity_key unique (portfolio_id, source_cutoff, methodology_version),
  constraint portfolio_health_snapshots_total_value_check check (total_value is null or total_value >= 0),
  constraint portfolio_health_snapshots_currency_check check (base_currency = upper(base_currency) and base_currency ~ '^[A-Z]{3}$'),
  constraint portfolio_health_snapshots_measures_check check (jsonb_typeof(measures) = 'object'),
  constraint portfolio_health_snapshots_status_check check (summary_status in ('INCOMPLETE_DATA', 'NEEDS_REVIEW', 'HEALTHY')),
  constraint portfolio_health_snapshots_completeness_check check (completeness_pct between 0 and 100)
);

create index portfolio_health_snapshots_owner_portfolio_idx
  on public.portfolio_health_snapshots (owner_user_id, portfolio_id, source_cutoff desc);

create trigger portfolios_touch_updated_at
before update on public.portfolios
for each row execute function public.touch_my_dashboard_personal_row_v1();

create trigger portfolio_positions_touch_updated_at
before update on public.portfolio_positions
for each row execute function public.touch_my_dashboard_personal_row_v1();

alter table public.portfolios enable row level security;
alter table public.portfolio_positions enable row level security;
alter table public.portfolio_health_snapshots enable row level security;

create policy portfolios_owner_select on public.portfolios for select to authenticated
using ((select auth.uid()) is not null and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false and owner_user_id = (select auth.uid()));
create policy portfolios_owner_insert on public.portfolios for insert to authenticated
with check ((select auth.uid()) is not null and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false and owner_user_id = (select auth.uid()));
create policy portfolios_owner_update on public.portfolios for update to authenticated
using ((select auth.uid()) is not null and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false and owner_user_id = (select auth.uid()))
with check ((select auth.uid()) is not null and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false and owner_user_id = (select auth.uid()));
create policy portfolios_owner_delete on public.portfolios for delete to authenticated
using ((select auth.uid()) is not null and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false and owner_user_id = (select auth.uid()));

create policy portfolio_positions_owner_select on public.portfolio_positions for select to authenticated
using ((select auth.uid()) is not null and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false and owner_user_id = (select auth.uid()));
create policy portfolio_positions_owner_insert on public.portfolio_positions for insert to authenticated
with check ((select auth.uid()) is not null and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false and owner_user_id = (select auth.uid()));
create policy portfolio_positions_owner_update on public.portfolio_positions for update to authenticated
using ((select auth.uid()) is not null and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false and owner_user_id = (select auth.uid()))
with check ((select auth.uid()) is not null and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false and owner_user_id = (select auth.uid()));
create policy portfolio_positions_owner_delete on public.portfolio_positions for delete to authenticated
using ((select auth.uid()) is not null and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false and owner_user_id = (select auth.uid()));

create policy portfolio_health_snapshots_owner_select on public.portfolio_health_snapshots for select to authenticated
using ((select auth.uid()) is not null and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false and owner_user_id = (select auth.uid()));

revoke all on table public.portfolios from public, anon, authenticated;
revoke all on table public.portfolio_positions from public, anon, authenticated;
revoke all on table public.portfolio_health_snapshots from public, anon, authenticated;

grant select, insert, update, delete on table public.portfolios to authenticated;
grant select, insert, update, delete on table public.portfolio_positions to authenticated;
grant select on table public.portfolio_health_snapshots to authenticated;

grant all on table public.portfolios to service_role;
grant all on table public.portfolio_positions to service_role;
grant all on table public.portfolio_health_snapshots to service_role;

comment on table public.portfolios is 'Permanent-user manual or paper portfolio headers. Owner-scoped by RLS; anonymous users are rejected.';
comment on table public.portfolio_positions is 'Permanent-user portfolio positions with explicit quantity, cost-basis completeness and currency. Owner-scoped by RLS.';
comment on table public.portfolio_health_snapshots is 'Immutable versioned Portfolio Health outputs. Missing price, cost, FX or adjusted-price evidence remains explicit.';
