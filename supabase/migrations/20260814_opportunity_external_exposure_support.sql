create table if not exists public.opportunity_theme_external_instruments (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.opportunity_themes(id) on delete cascade,
  symbol text not null,
  instrument_name text not null,
  exchange_code text not null default 'UNKNOWN',
  asset_type text not null default 'equity',
  market_source text not null default 'yahoo_finance',
  external_market_url text,
  evidence_source_name text,
  evidence_url text,
  exposure_type text not null,
  exposure_score numeric,
  rationale text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunity_theme_external_instruments_exposure_type_chk check (exposure_type = any (array['direct','enabler','beneficiary','supplier','infrastructure','substitute','risk']::text[])),
  constraint opportunity_theme_external_instruments_score_chk check (exposure_score is null or (exposure_score >= 0 and exposure_score <= 100)),
  constraint opportunity_theme_external_instruments_symbol_chk check (btrim(symbol) <> ''),
  constraint opportunity_theme_external_instruments_name_chk check (btrim(instrument_name) <> ''),
  constraint opportunity_theme_external_instruments_unique unique (theme_id, symbol, exchange_code, exposure_type)
);

alter table public.opportunity_theme_external_instruments enable row level security;
revoke insert, update, delete on public.opportunity_theme_external_instruments from anon, authenticated;
grant select on public.opportunity_theme_external_instruments to anon, authenticated;
drop policy if exists opportunity_external_exposures_public_read on public.opportunity_theme_external_instruments;
create policy opportunity_external_exposures_public_read
  on public.opportunity_theme_external_instruments
  for select
  to anon, authenticated
  using (true);

create or replace view public.opportunity_theme_all_exposures
with (security_invoker = true)
as
select
  'tracked'::text as source_kind,
  oti.theme_id,
  oti.instrument_id,
  i.symbol,
  i.instrument_name,
  i.asset_type,
  i.exchange_code,
  null::text as external_market_url,
  'internal'::text as market_source,
  null::text as evidence_source_name,
  null::text as evidence_url,
  oti.exposure_type,
  oti.exposure_score,
  oti.rationale,
  oti.is_active,
  oti.created_at,
  oti.updated_at
from public.opportunity_theme_instruments oti
join public.instruments i on i.id = oti.instrument_id
union all
select
  'external'::text as source_kind,
  e.theme_id,
  null::uuid as instrument_id,
  e.symbol,
  e.instrument_name,
  e.asset_type,
  e.exchange_code,
  e.external_market_url,
  e.market_source,
  e.evidence_source_name,
  e.evidence_url,
  e.exposure_type,
  e.exposure_score,
  e.rationale,
  e.is_active,
  e.created_at,
  e.updated_at
from public.opportunity_theme_external_instruments e;

grant select on public.opportunity_theme_all_exposures to anon, authenticated;
comment on table public.opportunity_theme_external_instruments is 'Publicly listed Opportunity exposures that are not part of the actively tracked Trading market universe.';
comment on view public.opportunity_theme_all_exposures is 'Unified read model for tracked and external Opportunity-theme exposures.';
