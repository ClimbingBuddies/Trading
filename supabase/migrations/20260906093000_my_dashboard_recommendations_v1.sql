-- MYDASH-005: immutable, explainable personal research recommendations.
-- Internal generation is intentionally separate from the browser-facing append-only event RPC.

create table public.personal_recommendation_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete restrict,
  generated_at timestamptz not null,
  valid_until timestamptz,
  category text not null,
  intended_horizon_sessions smallint not null,
  thesis text not null,
  principal_risks text not null,
  confidence numeric(5,4),
  relevance_reasons jsonb not null,
  methodology_version text not null,
  model_identity text,
  source_cutoff timestamptz not null,
  source_hash text not null,
  quality_status text not null,
  quality_reasons text[] not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  constraint personal_recommendation_validity_check check (valid_until is null or valid_until > generated_at),
  constraint personal_recommendation_category_check check (category in ('INVESTIGATE', 'MONITOR', 'REVIEW_RISK', 'THEME_EXPOSURE')),
  constraint personal_recommendation_horizon_check check (intended_horizon_sessions in (5, 20, 60)),
  constraint personal_recommendation_thesis_check check (length(trim(thesis)) > 0),
  constraint personal_recommendation_risks_check check (length(trim(principal_risks)) > 0),
  constraint personal_recommendation_confidence_check check (confidence is null or confidence between 0 and 1),
  constraint personal_recommendation_relevance_check check (jsonb_typeof(relevance_reasons) = 'array' and jsonb_array_length(relevance_reasons) > 0),
  constraint personal_recommendation_methodology_check check (length(trim(methodology_version)) > 0),
  constraint personal_recommendation_cutoff_check check (source_cutoff <= generated_at),
  constraint personal_recommendation_source_hash_check check (length(trim(source_hash)) > 0),
  constraint personal_recommendation_quality_check check (length(trim(quality_status)) > 0),
  unique (owner_user_id, instrument_id, generated_at, methodology_version),
  unique (id, owner_user_id)
);

create table public.personal_recommendation_sources (
  recommendation_id uuid not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_family text not null,
  source_table text not null,
  source_record_key text not null,
  source_cutoff timestamptz not null,
  methodology_version text not null,
  relevance text not null,
  canonical_source_url text,
  claim_hash text,
  dependency_key text not null,
  qualifies_positive boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (recommendation_id, source_family, source_table, source_record_key),
  foreign key (recommendation_id, owner_user_id)
    references public.personal_recommendation_snapshots(id, owner_user_id) on delete cascade,
  constraint personal_recommendation_source_family_check check (source_family in ('MARKET_AI', 'TECHNICAL', 'OPPORTUNITY', 'EXTERNAL_FACT')),
  constraint personal_recommendation_source_table_check check (length(trim(source_table)) > 0),
  constraint personal_recommendation_source_key_check check (length(trim(source_record_key)) > 0),
  constraint personal_recommendation_source_methodology_check check (length(trim(methodology_version)) > 0),
  constraint personal_recommendation_source_relevance_check check (length(trim(relevance)) > 0)
  ,constraint personal_recommendation_source_dependency_check check (length(trim(dependency_key)) > 0)
);

create table public.personal_recommendation_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid not null,
  event_type text not null,
  event_at timestamptz not null default clock_timestamp(),
  feedback_code text,
  feedback_note text,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (recommendation_id, owner_user_id)
    references public.personal_recommendation_snapshots(id, owner_user_id) on delete cascade,
  constraint personal_recommendation_event_type_check check (event_type in ('watch', 'dismiss', 'feedback', 'paper_decision')),
  constraint personal_recommendation_event_feedback_check check (
    (event_type = 'feedback' and feedback_code is not null and length(trim(feedback_code)) between 1 and 40)
    or (event_type <> 'feedback' and feedback_code is null and feedback_note is null)
  ),
  constraint personal_recommendation_event_note_check check (feedback_note is null or length(feedback_note) <= 500)
);

create index personal_recommendation_snapshots_owner_generated_idx
  on public.personal_recommendation_snapshots (owner_user_id, generated_at desc);
create index personal_recommendation_sources_owner_idx
  on public.personal_recommendation_sources (owner_user_id, recommendation_id);
create index personal_recommendation_events_owner_idx
  on public.personal_recommendation_events (owner_user_id, recommendation_id, event_at desc);

create or replace function public.reject_personal_recommendation_mutation_v1()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Personal recommendation records are append-only.' using errcode = '55000';
end;
$$;

create trigger personal_recommendation_snapshots_immutable
before update or delete on public.personal_recommendation_snapshots
for each row execute function public.reject_personal_recommendation_mutation_v1();

create trigger personal_recommendation_sources_immutable
before update or delete on public.personal_recommendation_sources
for each row execute function public.reject_personal_recommendation_mutation_v1();

create trigger personal_recommendation_events_immutable
before update or delete on public.personal_recommendation_events
for each row execute function public.reject_personal_recommendation_mutation_v1();

alter table public.personal_recommendation_snapshots enable row level security;
alter table public.personal_recommendation_sources enable row level security;
alter table public.personal_recommendation_events enable row level security;

create policy personal_recommendation_snapshots_owner_select
on public.personal_recommendation_snapshots for select to authenticated
using ((select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid()));

create policy personal_recommendation_sources_owner_select
on public.personal_recommendation_sources for select to authenticated
using ((select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
  and exists (select 1 from public.personal_recommendation_snapshots s
    where s.id = recommendation_id and s.owner_user_id = (select auth.uid())));

create policy personal_recommendation_events_owner_select
on public.personal_recommendation_events for select to authenticated
using ((select auth.uid()) is not null
  and coalesce((((select auth.jwt())->>'is_anonymous')::boolean), false) = false
  and owner_user_id = (select auth.uid())
  and exists (select 1 from public.personal_recommendation_snapshots s
    where s.id = recommendation_id and s.owner_user_id = (select auth.uid())));

revoke all on table public.personal_recommendation_snapshots from public, anon, authenticated;
revoke all on table public.personal_recommendation_sources from public, anon, authenticated;
revoke all on table public.personal_recommendation_events from public, anon, authenticated;
grant select on table public.personal_recommendation_snapshots to authenticated;
grant select on table public.personal_recommendation_sources to authenticated;
grant select on table public.personal_recommendation_events to authenticated;
grant all on table public.personal_recommendation_snapshots to service_role;
grant all on table public.personal_recommendation_sources to service_role;
grant all on table public.personal_recommendation_events to service_role;

create or replace function public.append_personal_recommendation_event_v1(
  p_recommendation_id uuid,
  p_event_type text,
  p_feedback_code text default null,
  p_feedback_note text default null
)
returns public.personal_recommendation_events
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_is_anonymous boolean := coalesce(((auth.jwt()->>'is_anonymous')::boolean), false);
  v_event public.personal_recommendation_events;
begin
  if v_owner_id is null or v_is_anonymous then
    raise exception 'A permanent authenticated user is required.' using errcode = '42501';
  end if;
  if p_event_type not in ('watch', 'dismiss', 'feedback') then
    raise exception 'Unsupported recommendation event.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.personal_recommendation_snapshots s
    where s.id = p_recommendation_id and s.owner_user_id = v_owner_id
  ) then
    raise exception 'Recommendation not found.' using errcode = '42501';
  end if;

  insert into public.personal_recommendation_events (
    owner_user_id, recommendation_id, event_type, feedback_code, feedback_note
  ) values (
    v_owner_id,
    p_recommendation_id,
    p_event_type,
    case when p_event_type = 'feedback' then nullif(trim(p_feedback_code), '') else null end,
    case when p_event_type = 'feedback' then nullif(trim(p_feedback_note), '') else null end
  ) returning * into v_event;

  return v_event;
end;
$$;

revoke all on function public.append_personal_recommendation_event_v1(uuid, text, text, text) from public, anon;
grant execute on function public.append_personal_recommendation_event_v1(uuid, text, text, text) to authenticated;
revoke all on function public.reject_personal_recommendation_mutation_v1() from public, anon, authenticated;

comment on table public.personal_recommendation_snapshots is
  'Immutable owner-scoped research-relevance snapshots. Categories never imply Buy or Sell.';
comment on table public.personal_recommendation_sources is
  'Immutable provenance rows preserving separated recommendation evidence families.';
comment on table public.personal_recommendation_events is
  'Append-only owner feedback; events never rewrite their source recommendation snapshot.';

create or replace function private.load_personal_recommendation_context_v1(
  p_owner_user_id uuid, p_instrument_id uuid, p_cutoff timestamptz
)
returns jsonb language sql security definer set search_path = pg_catalog stable as $$
  with relevance as (
    select 'WATCHLIST:' || w.id::text reason from public.watchlists w
    join public.watchlist_items wi on wi.watchlist_id = w.id
    where w.owner_user_id = p_owner_user_id and wi.instrument_id = p_instrument_id
    union
    select 'PORTFOLIO:' || p.id::text from public.portfolios p
    join public.portfolio_positions pp on pp.portfolio_id = p.id and pp.owner_user_id = p.owner_user_id
    where p.owner_user_id = p_owner_user_id and p.status = 'active' and pp.instrument_id = p_instrument_id
    union
    select 'EXPLICIT_INTEREST:' || umi.id::text from public.user_market_interests umi
    where umi.owner_user_id = p_owner_user_id and (umi.instrument_id = p_instrument_id or exists (
      select 1 from public.opportunity_theme_instruments oti
      where oti.theme_id = umi.theme_id and oti.instrument_id = p_instrument_id and oti.is_active))
  ), latest_ai as (
    select g.assessment_id::text record_key, g.created_at source_cutoff, g.methodology_version,
      g.run_id::text dependency_key from public.gpt_market_assessments g
    join public.gpt_market_runs r on r.run_id = g.run_id and r.status = 'succeeded'
    where g.instrument_id = p_instrument_id and g.created_at <= p_cutoff
      and g.technical_engine_input_used is false and nullif(btrim(g.methodology_version), '') is not null
    order by g.assessment_date desc, g.created_at desc, g.assessment_id desc limit 1
  ), latest_technical as (
    select m.id::text record_key, m.calculated_at source_cutoff, m.methodology_version,
      m.id::text dependency_key from public.market_scores m
    where m.instrument_id = p_instrument_id and m.calculated_at <= p_cutoff
      and m.score_status = 'complete' and nullif(btrim(m.methodology_version), '') is not null
    order by m.score_date desc, m.calculated_at desc, m.id desc limit 1
  ), latest_opportunity as (
    select distinct on (oa.theme_id) oa.id::text record_key, oa.created_at source_cutoff,
      oa.methodology_version, oa.id::text dependency_key
    from public.opportunity_theme_instruments oti join public.opportunity_assessments oa on oa.theme_id = oti.theme_id
    where oti.instrument_id = p_instrument_id and oti.is_active and oa.created_at <= p_cutoff
      and oa.structural_signal_id is not null and oa.technology_inflection_signal_id is not null
      and nullif(btrim(oa.methodology_version), '') is not null
    order by oa.theme_id, oa.assessment_date desc, oa.created_at desc, oa.id desc
  ), evidence as (
    select 'MARKET_AI' family, 'gpt_market_assessments' source_table, record_key, source_cutoff,
      methodology_version, 'Completed independent Market AI assessment.' relevance, dependency_key from latest_ai
    union all select 'TECHNICAL', 'market_scores', record_key, source_cutoff, methodology_version,
      'Completed independent Technical score.', dependency_key from latest_technical
    union all select 'OPPORTUNITY', 'opportunity_assessments', record_key, source_cutoff, methodology_version,
      'Completed independent Opportunity assessment; this does not imply Buy.', dependency_key from latest_opportunity
  ) select jsonb_build_object(
    'relevance', coalesce((select jsonb_agg(jsonb_build_object('owner_user_id', p_owner_user_id, 'reason', reason) order by reason) from relevance), '[]'::jsonb),
    'evidence', coalesce((select jsonb_agg(jsonb_build_object(
      'family', family, 'table', source_table, 'recordKey', record_key,
      'cutoff', to_char(source_cutoff at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'methodologyVersion', methodology_version, 'relevance', relevance, 'status', 'COMPLETE',
      'positive', true, 'dependencyIds', jsonb_build_array(dependency_key)) order by family, source_table, record_key)
      from evidence), '[]'::jsonb));
$$;
revoke all on function private.load_personal_recommendation_context_v1(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function private.load_personal_recommendation_context_v1(uuid, uuid, timestamptz) to service_role;

create or replace function private.persist_personal_recommendation_v1(
  p_snapshot jsonb,
  p_sources jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_id uuid;
  v_existing jsonb;
  v_existing_sources jsonb;
begin
  if jsonb_typeof(p_snapshot) <> 'object' or jsonb_typeof(p_sources) <> 'array'
     or jsonb_array_length(p_sources) = 0 then
    raise exception 'Canonical snapshot and non-empty sources are required.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_sources) s
    where (s->>'source_cutoff')::timestamptz > (p_snapshot->>'source_cutoff')::timestamptz
       or coalesce(s->>'dependency_key', '') = '' or (s->>'qualifies_positive') is null
  ) then
    raise exception 'Source chronology and deterministic eligibility are required.' using errcode = '22023';
  end if;

  insert into public.personal_recommendation_snapshots (
    owner_user_id, instrument_id, generated_at, valid_until, category,
    intended_horizon_sessions, thesis, principal_risks, confidence,
    relevance_reasons, methodology_version, model_identity, source_cutoff,
    source_hash, quality_status, quality_reasons
  ) values (
    (p_snapshot->>'owner_user_id')::uuid, (p_snapshot->>'instrument_id')::uuid,
    (p_snapshot->>'generated_at')::timestamptz, (p_snapshot->>'valid_until')::timestamptz,
    p_snapshot->>'category', (p_snapshot->>'intended_horizon_sessions')::smallint,
    p_snapshot->>'thesis', p_snapshot->>'principal_risks', (p_snapshot->>'confidence')::numeric,
    p_snapshot->'relevance_reasons', p_snapshot->>'methodology_version',
    p_snapshot->>'model_identity', (p_snapshot->>'source_cutoff')::timestamptz,
    p_snapshot->>'source_hash', p_snapshot->>'quality_status',
    array(select jsonb_array_elements_text(coalesce(p_snapshot->'quality_reasons', '[]'::jsonb)))
  )
  on conflict (owner_user_id, instrument_id, generated_at, methodology_version) do nothing
  returning id into v_id;

  if v_id is not null then
    insert into public.personal_recommendation_sources (
      recommendation_id, owner_user_id, source_family, source_table, source_record_key,
      source_cutoff, methodology_version, relevance, canonical_source_url, claim_hash,
      dependency_key, qualifies_positive
    )
    select v_id, (p_snapshot->>'owner_user_id')::uuid,
      s->>'source_family', s->>'source_table', s->>'source_record_key',
      (s->>'source_cutoff')::timestamptz, s->>'methodology_version', s->>'relevance',
      s->>'canonical_source_url', s->>'claim_hash', s->>'dependency_key',
      (s->>'qualifies_positive')::boolean
    from jsonb_array_elements(p_sources) s;
    return v_id;
  end if;

  select id, to_jsonb(r) - 'id' - 'created_at'
    into v_id, v_existing
  from public.personal_recommendation_snapshots r
  where owner_user_id = (p_snapshot->>'owner_user_id')::uuid
    and instrument_id = (p_snapshot->>'instrument_id')::uuid
    and generated_at = (p_snapshot->>'generated_at')::timestamptz
    and methodology_version = p_snapshot->>'methodology_version'
  for update;

  select coalesce(jsonb_agg(to_jsonb(s) - 'recommendation_id' - 'owner_user_id' - 'created_at'
    order by s.source_family, s.source_table, s.source_record_key), '[]'::jsonb)
    into v_existing_sources
  from public.personal_recommendation_sources s where s.recommendation_id = v_id;

  if v_existing <> jsonb_build_object(
       'owner_user_id', (p_snapshot->>'owner_user_id')::uuid,
       'instrument_id', (p_snapshot->>'instrument_id')::uuid,
       'generated_at', (p_snapshot->>'generated_at')::timestamptz,
       'valid_until', (p_snapshot->>'valid_until')::timestamptz,
       'category', p_snapshot->>'category',
       'intended_horizon_sessions', (p_snapshot->>'intended_horizon_sessions')::smallint,
       'thesis', p_snapshot->>'thesis', 'principal_risks', p_snapshot->>'principal_risks',
       'confidence', (p_snapshot->>'confidence')::numeric,
       'relevance_reasons', p_snapshot->'relevance_reasons',
       'methodology_version', p_snapshot->>'methodology_version',
       'model_identity', p_snapshot->>'model_identity',
       'source_cutoff', (p_snapshot->>'source_cutoff')::timestamptz,
       'source_hash', p_snapshot->>'source_hash', 'quality_status', p_snapshot->>'quality_status',
       'quality_reasons', array(select jsonb_array_elements_text(coalesce(p_snapshot->'quality_reasons', '[]'::jsonb)))
     ) or v_existing_sources <>
     (select jsonb_agg(value order by value->>'source_family', value->>'source_table', value->>'source_record_key')
      from jsonb_array_elements(p_sources)) then
    raise exception 'Immutable recommendation conflict: persisted source identity differs.' using errcode = '55000';
  end if;
  return v_id;
end;
$$;

revoke all on function private.persist_personal_recommendation_v1(jsonb, jsonb) from public, anon, authenticated;
grant execute on function private.persist_personal_recommendation_v1(jsonb, jsonb) to service_role;
comment on function private.persist_personal_recommendation_v1(jsonb, jsonb) is
  'Trusted atomic insert-or-identical-verify writer. It never derives recommendations or accepts browser calls.';
