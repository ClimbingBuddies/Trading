-- MYDASH-002: permanent-user personal preferences and interests foundation.
-- Browser access is deliberately narrow; anonymous and signed-out access is denied.

create table public.user_market_preferences (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  base_currency character(3) not null default 'AUD',
  default_horizon_sessions smallint not null default 20,
  risk_preference text not null default 'unspecified',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint user_market_preferences_currency_check
    check (base_currency = upper(base_currency) and base_currency ~ '^[A-Z]{3}$'),
  constraint user_market_preferences_horizon_check
    check (default_horizon_sessions in (5, 20, 60)),
  constraint user_market_preferences_risk_check
    check (risk_preference in ('unspecified', 'conservative', 'balanced', 'growth'))
);

create table public.user_market_interests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  instrument_id uuid references public.instruments(id) on delete cascade,
  theme_id uuid references public.opportunity_themes(id) on delete cascade,
  interest_kind text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint user_market_interests_subject_check
    check ((instrument_id is not null)::integer + (theme_id is not null)::integer = 1),
  constraint user_market_interests_kind_check
    check (interest_kind in ('watch', 'hold', 'research'))
);

create unique index user_market_interests_owner_instrument_key
  on public.user_market_interests (owner_user_id, instrument_id)
  where instrument_id is not null;

create unique index user_market_interests_owner_theme_key
  on public.user_market_interests (owner_user_id, theme_id)
  where theme_id is not null;

create index user_market_interests_owner_idx
  on public.user_market_interests (owner_user_id);

create or replace function public.touch_my_dashboard_personal_row_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.touch_my_dashboard_personal_row_v1() from public, anon, authenticated;

create trigger user_market_preferences_touch_updated_at
before update on public.user_market_preferences
for each row execute function public.touch_my_dashboard_personal_row_v1();

create trigger user_market_interests_touch_updated_at
before update on public.user_market_interests
for each row execute function public.touch_my_dashboard_personal_row_v1();

alter table public.user_market_preferences enable row level security;
alter table public.user_market_interests enable row level security;

create policy user_market_preferences_owner_select
on public.user_market_preferences
for select
to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

create policy user_market_preferences_owner_insert
on public.user_market_preferences
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

create policy user_market_preferences_owner_update
on public.user_market_preferences
for update
to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
)
with check (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

create policy user_market_interests_owner_select
on public.user_market_interests
for select
to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

create policy user_market_interests_owner_insert
on public.user_market_interests
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

create policy user_market_interests_owner_update
on public.user_market_interests
for update
to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
)
with check (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

create policy user_market_interests_owner_delete
on public.user_market_interests
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
);

revoke all on table public.user_market_preferences from public, anon, authenticated;
revoke all on table public.user_market_interests from public, anon, authenticated;

grant select, insert on table public.user_market_preferences to authenticated;
grant update (base_currency, default_horizon_sessions, risk_preference)
  on table public.user_market_preferences to authenticated;

grant select, insert, delete on table public.user_market_interests to authenticated;
grant update (interest_kind) on table public.user_market_interests to authenticated;

grant all on table public.user_market_preferences to service_role;
grant all on table public.user_market_interests to service_role;

comment on table public.user_market_preferences is
  'Permanent-user My Dashboard preferences. Owner-scoped by RLS; anonymous users are rejected.';
comment on table public.user_market_interests is
  'Permanent-user research interests for one instrument or Opportunity theme. No interest implies a Buy recommendation.';
