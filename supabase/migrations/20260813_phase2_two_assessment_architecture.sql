-- Phase 2: two independent assessment systems
-- 1. Market Assessment = Technical Signal + independent ChatGPT Market Signal + Market Convergence
-- 2. Opportunity Assessment = Structural Signal + Technology Inflection + Opportunity Convergence

-- Preserve the existing GPT assessment model but add explicit methodology/independence metadata.
alter table public.gpt_market_assessments
  add column if not exists methodology_version text,
  add column if not exists technical_engine_input_used boolean;

comment on column public.gpt_market_assessments.methodology_version is
  'Assessment methodology version. Separate from the underlying model_version.';
comment on column public.gpt_market_assessments.technical_engine_input_used is
  'False for independent ChatGPT Market Assessments. NULL means historical/unknown. The AI assessment should not consume the platform technical-engine signal before forming its view.';

-- ---------------------------------------------------------------------------
-- MARKET ASSESSMENT / CONVERGENCE
-- ---------------------------------------------------------------------------
create table if not exists public.market_convergence_assessments (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  assessment_date date not null default current_date,

  -- Source records preserve independence and lineage.
  technical_score_id bigint references public.market_scores(id) on delete set null,
  ai_assessment_id uuid references public.gpt_market_assessments(assessment_id) on delete set null,

  -- Snapshot the two independent outputs used by convergence.
  technical_score numeric,
  technical_signal text,
  technical_confidence numeric,
  ai_score numeric,
  ai_signal text,
  ai_confidence numeric,

  -- Convergence is calculated only after both independent assessments exist.
  convergence_score numeric,
  convergence_confidence numeric,
  convergence_label text,
  summary text,
  methodology_version text not null default 'market-convergence-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint market_convergence_technical_score_chk check (technical_score is null or technical_score between 0 and 100),
  constraint market_convergence_technical_confidence_chk check (technical_confidence is null or technical_confidence between 0 and 100),
  constraint market_convergence_ai_score_chk check (ai_score is null or ai_score between 0 and 100),
  constraint market_convergence_ai_confidence_chk check (ai_confidence is null or ai_confidence between 0 and 100),
  constraint market_convergence_score_chk check (convergence_score is null or convergence_score between 0 and 100),
  constraint market_convergence_confidence_chk check (convergence_confidence is null or convergence_confidence between 0 and 100),
  constraint market_convergence_technical_signal_chk check (
    technical_signal is null or lower(technical_signal) in ('strong buy','buy','hold','sell','strong sell')
  ),
  constraint market_convergence_ai_signal_chk check (
    ai_signal is null or lower(ai_signal) in ('strong buy','buy','hold','sell','strong sell')
  ),
  constraint market_convergence_label_chk check (
    convergence_label is null or convergence_label in (
      'very_strong_bullish','strong_bullish','moderate_bullish','neutral','mixed','conflict',
      'moderate_bearish','strong_bearish','very_strong_bearish'
    )
  ),
  constraint market_convergence_one_per_method unique (instrument_id, assessment_date, methodology_version)
);

create index if not exists market_convergence_assessments_instrument_date_idx
  on public.market_convergence_assessments (instrument_id, assessment_date desc);
create index if not exists market_convergence_assessments_date_idx
  on public.market_convergence_assessments (assessment_date desc);

comment on table public.market_convergence_assessments is
  'Short-term/tactical Market Assessment. Combines an independent technical market score with an independent ChatGPT market assessment only after both have been produced.';

-- ---------------------------------------------------------------------------
-- OPPORTUNITY ASSESSMENT / LONG-TERM REAL-WORLD SIGNALS
-- ---------------------------------------------------------------------------
create table if not exists public.opportunity_themes (
  id uuid primary key default gen_random_uuid(),
  theme_code text not null unique,
  theme_name text not null,
  description text,
  horizon_years_min numeric,
  horizon_years_max numeric,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunity_themes_horizon_chk check (
    horizon_years_min is null or horizon_years_max is null or horizon_years_max >= horizon_years_min
  ),
  constraint opportunity_themes_status_chk check (status in ('active','watch','paused','archived'))
);

comment on table public.opportunity_themes is
  'Long-term real-world opportunity themes such as fusion, battery storage, robotics or AI infrastructure. No theme rows are seeded by this migration.';

create table if not exists public.opportunity_theme_instruments (
  theme_id uuid not null references public.opportunity_themes(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id) on delete cascade,
  exposure_type text not null,
  exposure_score numeric,
  rationale text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (theme_id, instrument_id, exposure_type),
  constraint opportunity_theme_instruments_exposure_type_chk check (
    exposure_type in ('direct','enabler','beneficiary','supplier','infrastructure','substitute','risk')
  ),
  constraint opportunity_theme_instruments_score_chk check (exposure_score is null or exposure_score between 0 and 100)
);

comment on table public.opportunity_theme_instruments is
  'Maps long-term opportunity themes to listed instruments without implying a Buy/Sell recommendation.';

create table if not exists public.structural_opportunity_signals (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.opportunity_themes(id) on delete cascade,
  signal_date date not null default current_date,
  demand_score numeric,
  adoption_score numeric,
  capital_investment_score numeric,
  capacity_constraint_score numeric,
  economics_score numeric,
  overall_score numeric,
  confidence numeric,
  signal_label text,
  summary text,
  evidence_summary jsonb not null default '{}'::jsonb,
  methodology_version text not null default 'structural-signal-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint structural_demand_score_chk check (demand_score is null or demand_score between 0 and 100),
  constraint structural_adoption_score_chk check (adoption_score is null or adoption_score between 0 and 100),
  constraint structural_capital_score_chk check (capital_investment_score is null or capital_investment_score between 0 and 100),
  constraint structural_capacity_score_chk check (capacity_constraint_score is null or capacity_constraint_score between 0 and 100),
  constraint structural_economics_score_chk check (economics_score is null or economics_score between 0 and 100),
  constraint structural_overall_score_chk check (overall_score is null or overall_score between 0 and 100),
  constraint structural_confidence_chk check (confidence is null or confidence between 0 and 100),
  constraint structural_signal_label_chk check (
    signal_label is null or signal_label in ('weak','developing','moderate','strong','very_strong')
  ),
  constraint structural_signal_one_per_method unique (theme_id, signal_date, methodology_version)
);

comment on table public.structural_opportunity_signals is
  'Independent long-term structural signal based on adoption, demand, investment, capacity constraints and industry economics.';

create table if not exists public.technology_inflection_signals (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.opportunity_themes(id) on delete cascade,
  signal_date date not null default current_date,
  bottleneck text,
  unlock_description text,
  maturity_stage text,
  bottleneck_unlock_score numeric,
  evidence_quality_score numeric,
  commercialisation_score numeric,
  impact_score numeric,
  overall_score numeric,
  confidence numeric,
  signal_label text,
  summary text,
  methodology_version text not null default 'technology-inflection-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint technology_inflection_maturity_chk check (
    maturity_stage is null or maturity_stage in (
      'scientific_result','replicated','engineering_demo','manufacturing_feasible',
      'commercial_validation','scaled_deployment'
    )
  ),
  constraint technology_inflection_unlock_score_chk check (bottleneck_unlock_score is null or bottleneck_unlock_score between 0 and 100),
  constraint technology_inflection_evidence_score_chk check (evidence_quality_score is null or evidence_quality_score between 0 and 100),
  constraint technology_inflection_commercial_score_chk check (commercialisation_score is null or commercialisation_score between 0 and 100),
  constraint technology_inflection_impact_score_chk check (impact_score is null or impact_score between 0 and 100),
  constraint technology_inflection_overall_score_chk check (overall_score is null or overall_score between 0 and 100),
  constraint technology_inflection_confidence_chk check (confidence is null or confidence between 0 and 100),
  constraint technology_inflection_label_chk check (
    signal_label is null or signal_label in ('weak','emerging','developing','strong','major')
  ),
  constraint technology_inflection_one_per_method unique (theme_id, signal_date, methodology_version)
);

comment on table public.technology_inflection_signals is
  'Independent Technology Inflection signal: identifies bottleneck removal, enabling breakthroughs, maturity, commercialisation evidence and potential real-world impact.';

create table if not exists public.technology_inflection_events (
  id uuid primary key default gen_random_uuid(),
  technology_signal_id uuid not null references public.technology_inflection_signals(id) on delete cascade,
  event_date date,
  event_type text,
  title text not null,
  description text not null,
  source_name text,
  source_url text,
  evidence_strength numeric,
  created_at timestamptz not null default now(),
  constraint technology_inflection_event_strength_chk check (evidence_strength is null or evidence_strength between 0 and 100)
);

create index if not exists technology_inflection_events_signal_idx
  on public.technology_inflection_events (technology_signal_id, event_date desc);

comment on table public.technology_inflection_events is
  'Source-level real-world evidence supporting a Technology Inflection signal. Scientific announcements alone do not imply commercial readiness.';

create table if not exists public.opportunity_assessments (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.opportunity_themes(id) on delete cascade,
  assessment_date date not null default current_date,
  structural_signal_id uuid references public.structural_opportunity_signals(id) on delete set null,
  technology_inflection_signal_id uuid references public.technology_inflection_signals(id) on delete set null,

  -- Snapshot the two independent long-term signals used for convergence.
  structural_score numeric,
  structural_confidence numeric,
  technology_inflection_score numeric,
  technology_inflection_confidence numeric,

  opportunity_score numeric,
  opportunity_confidence numeric,
  opportunity_level text,
  commercial_readiness text,
  time_horizon text,
  summary text,
  methodology_version text not null default 'opportunity-convergence-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint opportunity_structural_score_chk check (structural_score is null or structural_score between 0 and 100),
  constraint opportunity_structural_confidence_chk check (structural_confidence is null or structural_confidence between 0 and 100),
  constraint opportunity_technology_score_chk check (technology_inflection_score is null or technology_inflection_score between 0 and 100),
  constraint opportunity_technology_confidence_chk check (technology_inflection_confidence is null or technology_inflection_confidence between 0 and 100),
  constraint opportunity_score_chk check (opportunity_score is null or opportunity_score between 0 and 100),
  constraint opportunity_confidence_chk check (opportunity_confidence is null or opportunity_confidence between 0 and 100),
  constraint opportunity_level_chk check (
    opportunity_level is null or opportunity_level in ('emerging','watch','high','major','transformational')
  ),
  constraint opportunity_readiness_chk check (
    commercial_readiness is null or commercial_readiness in ('early','watch','developing','actionable','mature')
  ),
  constraint opportunity_one_per_method unique (theme_id, assessment_date, methodology_version)
);

create index if not exists opportunity_assessments_theme_date_idx
  on public.opportunity_assessments (theme_id, assessment_date desc);
create index if not exists opportunity_assessments_date_idx
  on public.opportunity_assessments (assessment_date desc);

comment on table public.opportunity_assessments is
  'Long-term Opportunity Assessment. Converges an independent structural real-world signal with an independent Technology Inflection signal. It is not a Buy/Sell recommendation.';

-- Keep timestamps current using the existing Trading trigger helper.
drop trigger if exists set_market_convergence_updated_at on public.market_convergence_assessments;
create trigger set_market_convergence_updated_at
before update on public.market_convergence_assessments
for each row execute function public.set_trading_updated_at();

drop trigger if exists set_opportunity_themes_updated_at on public.opportunity_themes;
create trigger set_opportunity_themes_updated_at
before update on public.opportunity_themes
for each row execute function public.set_trading_updated_at();

drop trigger if exists set_opportunity_theme_instruments_updated_at on public.opportunity_theme_instruments;
create trigger set_opportunity_theme_instruments_updated_at
before update on public.opportunity_theme_instruments
for each row execute function public.set_trading_updated_at();

drop trigger if exists set_structural_opportunity_signals_updated_at on public.structural_opportunity_signals;
create trigger set_structural_opportunity_signals_updated_at
before update on public.structural_opportunity_signals
for each row execute function public.set_trading_updated_at();

drop trigger if exists set_technology_inflection_signals_updated_at on public.technology_inflection_signals;
create trigger set_technology_inflection_signals_updated_at
before update on public.technology_inflection_signals
for each row execute function public.set_trading_updated_at();

drop trigger if exists set_opportunity_assessments_updated_at on public.opportunity_assessments;
create trigger set_opportunity_assessments_updated_at
before update on public.opportunity_assessments
for each row execute function public.set_trading_updated_at();

-- New assessment outputs are read-only to the public dashboard; no anonymous writes.
alter table public.market_convergence_assessments enable row level security;
alter table public.opportunity_themes enable row level security;
alter table public.opportunity_theme_instruments enable row level security;
alter table public.structural_opportunity_signals enable row level security;
alter table public.technology_inflection_signals enable row level security;
alter table public.technology_inflection_events enable row level security;
alter table public.opportunity_assessments enable row level security;

drop policy if exists dashboard_read_market_convergence_assessments on public.market_convergence_assessments;
create policy dashboard_read_market_convergence_assessments
  on public.market_convergence_assessments for select to anon, authenticated using (true);

drop policy if exists dashboard_read_opportunity_themes on public.opportunity_themes;
create policy dashboard_read_opportunity_themes
  on public.opportunity_themes for select to anon, authenticated using (true);

drop policy if exists dashboard_read_opportunity_theme_instruments on public.opportunity_theme_instruments;
create policy dashboard_read_opportunity_theme_instruments
  on public.opportunity_theme_instruments for select to anon, authenticated using (true);

drop policy if exists dashboard_read_structural_opportunity_signals on public.structural_opportunity_signals;
create policy dashboard_read_structural_opportunity_signals
  on public.structural_opportunity_signals for select to anon, authenticated using (true);

drop policy if exists dashboard_read_technology_inflection_signals on public.technology_inflection_signals;
create policy dashboard_read_technology_inflection_signals
  on public.technology_inflection_signals for select to anon, authenticated using (true);

drop policy if exists dashboard_read_technology_inflection_events on public.technology_inflection_events;
create policy dashboard_read_technology_inflection_events
  on public.technology_inflection_events for select to anon, authenticated using (true);

drop policy if exists dashboard_read_opportunity_assessments on public.opportunity_assessments;
create policy dashboard_read_opportunity_assessments
  on public.opportunity_assessments for select to anon, authenticated using (true);
