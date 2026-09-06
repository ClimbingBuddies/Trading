-- Local MYDASH-004 candidate only. Do not apply without an explicit owner-approved deployment cycle.

create extension if not exists btree_gist with schema extensions;

create table public.canonical_issuers (
  id uuid primary key default gen_random_uuid(),
  issuer_key text not null,
  canonical_name text not null,
  entity_kind text not null,
  country_code character(2),
  status text not null default 'active',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint canonical_issuers_key_nonempty check (btrim(issuer_key) <> ''),
  constraint canonical_issuers_name_nonempty check (btrim(canonical_name) <> ''),
  constraint canonical_issuers_key_normalized check (issuer_key = lower(btrim(issuer_key))),
  constraint canonical_issuers_key_characters check (issuer_key !~ '[[:space:][:cntrl:]]'),
  constraint canonical_issuers_name_canonical check (
    canonical_name = btrim(canonical_name)
    and canonical_name !~ '[[:cntrl:]]'
  ),
  constraint canonical_issuers_kind_check check (entity_kind in ('corporate', 'fund_sponsor')),
  constraint canonical_issuers_country_check check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint canonical_issuers_status_check check (status in ('active', 'retired')),
  constraint canonical_issuers_key_unique unique (issuer_key)
);

create table public.instrument_issuer_mappings (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  issuer_id uuid references public.canonical_issuers(id) on delete restrict,
  applicability text not null,
  source_name text not null,
  source_url text,
  evidence_as_of date not null,
  methodology_version text not null default 'issuer-mapping-v1',
  valid_from date not null,
  valid_to date,
  mapped_at timestamptz not null default clock_timestamp(),
  constraint instrument_issuer_mappings_applicability_check check (applicability in ('required', 'not_applicable')),
  constraint instrument_issuer_mappings_identity_check check (
    (applicability = 'required' and issuer_id is not null)
    or (applicability = 'not_applicable' and issuer_id is null)
  ),
  constraint instrument_issuer_mappings_source_nonempty check (source_name = btrim(source_name) and source_name <> '' and source_name !~ '[[:cntrl:]]'),
  constraint instrument_issuer_mappings_source_url_check check (
    source_url is null or (
      source_url = btrim(source_url)
      and lower(source_url) like 'https://%'
      and split_part(substring(source_url from 9), '/', 1) <> ''
      and strpos(split_part(substring(source_url from 9), '/', 1), '@') = 0
      and source_url !~ '[[:space:][:cntrl:]]'
      and strpos(source_url, '?') = 0
      and strpos(source_url, '#') = 0
    )
  ),
  constraint instrument_issuer_mappings_methodology_nonempty check (methodology_version = btrim(methodology_version) and methodology_version <> '' and methodology_version !~ '[[:cntrl:]]'),
  constraint instrument_issuer_mappings_validity_check check (valid_to is null or valid_to > valid_from),
  constraint instrument_issuer_mappings_version_unique unique (instrument_id, valid_from, methodology_version),
  constraint instrument_issuer_mappings_validity_nonoverlap exclude using gist (
    instrument_id with =,
    daterange(valid_from, valid_to, '[)') with &&
  )
);

create function public.set_canonical_issuers_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

revoke execute on function public.set_canonical_issuers_updated_at() from public, anon, authenticated;
grant execute on function public.set_canonical_issuers_updated_at() to service_role;

create trigger canonical_issuers_set_updated_at
before update on public.canonical_issuers
for each row execute function public.set_canonical_issuers_updated_at();

create unique index instrument_issuer_mappings_one_current_idx
  on public.instrument_issuer_mappings (instrument_id)
  where valid_to is null;

create index instrument_issuer_mappings_instrument_validity_idx
  on public.instrument_issuer_mappings (instrument_id, valid_from, valid_to);

create index instrument_issuer_mappings_issuer_id_idx
  on public.instrument_issuer_mappings (issuer_id)
  where issuer_id is not null;

alter table public.canonical_issuers enable row level security;
alter table public.instrument_issuer_mappings enable row level security;
alter table public.canonical_issuers force row level security;
alter table public.instrument_issuer_mappings force row level security;

revoke all on table public.canonical_issuers from public, anon, authenticated;
revoke all on table public.instrument_issuer_mappings from public, anon, authenticated;
grant select, insert, update, delete on table public.canonical_issuers to service_role;
grant select, insert, update, delete on table public.instrument_issuer_mappings to service_role;

comment on table public.canonical_issuers is
  'Trusted canonical issuer identities for deterministic portfolio concentration. Browser roles have no direct access.';
comment on table public.instrument_issuer_mappings is
  'Trusted effective-dated instrument issuer applicability and provenance. No name-based fallback is permitted.';
