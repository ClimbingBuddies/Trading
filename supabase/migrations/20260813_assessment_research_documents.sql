create table if not exists public.assessment_research_documents (
  id uuid primary key default gen_random_uuid(),
  document_scope text not null,
  market_assessment_id uuid references public.gpt_market_assessments(assessment_id) on delete cascade,
  market_convergence_id uuid references public.market_convergence_assessments(id) on delete cascade,
  opportunity_assessment_id uuid references public.opportunity_assessments(id) on delete cascade,
  title text not null default 'Research & Evidence',
  tiptap_json jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  plain_text text,
  content_schema_version text not null default 'tiptap-v1',
  document_version integer not null default 1,
  status text not null default 'draft',
  generated_by text,
  last_editor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_research_document_scope_chk check (document_scope in ('market','opportunity')),
  constraint assessment_research_document_status_chk check (status in ('draft','published','archived')),
  constraint assessment_research_document_version_chk check (document_version >= 1),
  constraint assessment_research_tiptap_doc_chk check (
    jsonb_typeof(tiptap_json) = 'object' and tiptap_json->>'type' = 'doc'
  ),
  constraint assessment_research_subject_chk check (
    (
      document_scope = 'market'
      and opportunity_assessment_id is null
      and num_nonnulls(market_assessment_id, market_convergence_id) = 1
    )
    or
    (
      document_scope = 'opportunity'
      and opportunity_assessment_id is not null
      and market_assessment_id is null
      and market_convergence_id is null
    )
  )
);

create unique index if not exists assessment_research_one_per_market_assessment
  on public.assessment_research_documents(market_assessment_id)
  where market_assessment_id is not null;

create unique index if not exists assessment_research_one_per_market_convergence
  on public.assessment_research_documents(market_convergence_id)
  where market_convergence_id is not null;

create unique index if not exists assessment_research_one_per_opportunity_assessment
  on public.assessment_research_documents(opportunity_assessment_id)
  where opportunity_assessment_id is not null;

create index if not exists assessment_research_documents_scope_status_idx
  on public.assessment_research_documents(document_scope, status, updated_at desc);

create table if not exists public.assessment_research_embeds (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.assessment_research_documents(id) on delete cascade,
  node_id text not null,
  embed_type text not null,
  title text,
  description text,
  display_variant text,
  source_name text,
  source_url text,
  source_published_at timestamptz,
  asset_url text,
  alt_text text,
  instrument_id uuid references public.instruments(id) on delete set null,
  technical_indicator_id bigint references public.technical_indicators(id) on delete set null,
  market_score_id bigint references public.market_scores(id) on delete set null,
  market_convergence_id uuid references public.market_convergence_assessments(id) on delete set null,
  gpt_market_assessment_id uuid references public.gpt_market_assessments(assessment_id) on delete set null,
  structural_signal_id uuid references public.structural_opportunity_signals(id) on delete set null,
  technology_inflection_signal_id uuid references public.technology_inflection_signals(id) on delete set null,
  technology_inflection_event_id uuid references public.technology_inflection_events(id) on delete set null,
  opportunity_assessment_id uuid references public.opportunity_assessments(id) on delete set null,
  chart_config jsonb not null default '{}'::jsonb,
  data_reference jsonb not null default '{}'::jsonb,
  snapshot_data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  relevance_score numeric,
  confidence numeric,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_research_embed_type_chk check (
    embed_type in ('article','external_link','chart','indicator','image','internal_link','evidence','callout')
  ),
  constraint assessment_research_embed_relevance_chk check (
    relevance_score is null or (relevance_score >= 0 and relevance_score <= 100)
  ),
  constraint assessment_research_embed_confidence_chk check (
    confidence is null or (confidence >= 0 and confidence <= 100)
  ),
  constraint assessment_research_embed_node_key unique (document_id, node_id)
);

create index if not exists assessment_research_embeds_document_idx
  on public.assessment_research_embeds(document_id, sort_order, created_at);
create index if not exists assessment_research_embeds_instrument_idx
  on public.assessment_research_embeds(instrument_id)
  where instrument_id is not null;
create index if not exists assessment_research_embeds_type_idx
  on public.assessment_research_embeds(embed_type, created_at desc);

alter table public.assessment_research_documents enable row level security;
alter table public.assessment_research_embeds enable row level security;

create policy dashboard_read_assessment_research_documents
  on public.assessment_research_documents
  for select
  to anon, authenticated
  using (true);

create policy dashboard_read_assessment_research_embeds
  on public.assessment_research_embeds
  for select
  to anon, authenticated
  using (true);

create trigger assessment_research_documents_set_updated_at
before update on public.assessment_research_documents
for each row execute function public.set_trading_updated_at();

create trigger assessment_research_embeds_set_updated_at
before update on public.assessment_research_embeds
for each row execute function public.set_trading_updated_at();

comment on table public.assessment_research_documents is
'Rich TipTap JSON research/evidence document attached to either a Market Assessment or an Opportunity Assessment.';

comment on column public.assessment_research_documents.tiptap_json is
'TipTap/ProseMirror JSON document. Store structured editor content, not rendered HTML.';

comment on table public.assessment_research_embeds is
'Structured metadata for rich TipTap blocks such as articles, charts, live indicators, images, internal links and evidence.';

comment on column public.assessment_research_embeds.data_reference is
'Live-data reference metadata used by the frontend to resolve current Supabase values for indicators/charts.';

comment on column public.assessment_research_embeds.snapshot_data is
'Optional immutable data snapshot used when an embedded chart/evidence block should preserve the historical values shown at assessment time.';
