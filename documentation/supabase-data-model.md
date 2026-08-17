# Supabase Data Model

Supabase project reference: `glvbqcplgjdfgjyknzsa`

**Last verified against the live database:** 18 August 2026

This document groups the public schema by business purpose and records both the structural model and current implementation maturity. Supabase is the persisted-data system of record; GitHub holds the canonical assessment methodology and project-control documentation.

## Maturity labels

- **Operational** — implemented and actively used with persisted production results; this does not override the project plan's stricter end-to-end `Definition of Operational` where a workflow still has an explicit verification gate.
- **Partial / advanced** — substantial schema and real data exist, but one or more operational gates remain open.
- **Scaffolded** — schema exists but the intended workflow is not yet producing current production results.
- **Legacy / review** — overlaps a newer model or requires an explicit keep/retire decision.

---

## 1. Provider and instrument reference data

### `data_providers`

Registry for external market-data providers. Current active providers include Twelve Data for scheduled current/live quotes and Tiingo for on-demand daily historical backfill.

Relationships include `provider_instruments`, `market_observations` and `sync_runs`. Provider identity is part of observation provenance and must be preserved.

Status: **Operational**.

### `instruments`

Internal master list of tradeable instruments and the central reference used by market data, assessments, opportunities, research and strategy features.

Key fields include `id`, `symbol`, `instrument_name`, `exchange_code`, `asset_type`, `currency_code`, `country_code`, `is_active` and `created_at`.

Historical records should normally be retained when an instrument leaves the active universe; deactivate rather than delete where reproducibility depends on its history.

Status: **Operational**.

### `provider_instruments`

Maps an internal instrument to a provider-specific symbol. Important uniqueness rules are `(provider_id, instrument_id)` and `(provider_id, provider_symbol)`.

Status: **Operational**.

---

## 2. Market data and loader monitoring

### `market_observations`

Persistent provider-specific market history. Twelve Data current-loader rows use `interval_code = 'quote'`; Tiingo historical backfill uses `interval_code = '1day'`.

The important uniqueness model is:

```text
(instrument_id, provider_id, interval_code, observed_at)
```

This lets current quotes and historical daily records coexist and supports idempotent backfill upserts.

Status: **Operational**.

### `latest_market_observations`

Latest live/current quote view used by the Markets dashboard. It filters to `interval_code = 'quote'` so historical Tiingo rows cannot become the apparent current quote.

Status: **Operational**.

### `sync_runs`

Execution audit for market-data loads, including start/finish timestamps, counts, status, errors and provider-specific metadata.

Status: **Operational**.

Relevant pipeline documentation:

- `documentation/pipelines/market-data-pipeline.md`
- `documentation/pipelines/historical-market-data-backfill.md`

---

## 3. Independent Technical Engine

The Technical Engine is intentionally independent from the AI Market Assessment. It may use market observations and indicator inputs, but must not use GPT conclusions when forming its technical result.

### `technical_indicators`

Versioned calculated indicators attached to instruments and optionally source observations.

Key fields include `instrument_id`, `observation_id`, `indicator_code`, `interval_code`, `calculated_at`, `value`, `values` and `calculation_version`.

**Live verification on 18 August 2026:** 0 rows.

Status: **Scaffolded**.

### `market_scores`

Intended persisted technical market scoring by instrument, including component/overall scoring and confidence/versioning once the Technical Engine is implemented.

**Live verification on 18 August 2026:** 0 rows.

Status: **Scaffolded**.

### `market_opinions`

Older/simple instrument-level opinion table that overlaps conceptually with newer opinion and GPT-assessment models.

Status: **Legacy / review**.

---

## 4. AI Market Assessment

This is the independent short-term AI assessment answering: **Is this instrument attractive now?**

Canonical methodology: `automation/daily-market-assessment.md`.

### `gpt_market_runs`

Run-level metadata for AI Market Assessment passes, including lifecycle status, model/prompt metadata, analysis mode, requested/completed ticker counts and notes.

Status: **Partial / advanced** — real runs exist, but the project plan still contains operational verification and historical-cleanup work.

### `gpt_market_assessments`

Instrument-level AI Market Assessment containing rating, confidence, score, summary, bull/bear cases, technical/macro/valuation views, catalysts, risks, evidence summary and methodology/independence metadata.

The AI assessment is analytically independent from `technical_indicators`, `market_scores`, Market Convergence and the long-term Opportunity system.

Status: **Partial / advanced**.

### `gpt_market_evidence`

Evidence supporting AI Market Assessments.

Status: **Partial / advanced**.

### `market_assessment_queue`

Internal queued work for the daily Market Assessment process.

Status: **Operational control table / pipeline still being hardened**.

### `market_assessment_schedule_log`

Internal scheduler audit trail for assessment requests.

Status: **Operational control table / pipeline still being hardened**.

---

## 5. Opportunity Assessment system

The Opportunity system is a separate long-term research system answering: **What could become important next?** It must not use short-term AI ratings, Technical Engine results or Market Convergence as analytical inputs.

Canonical specification: `automation/daily-opportunity-assessment.md`.

Pipeline documentation: `documentation/pipelines/opportunity-assessment-pipeline.md`.

### `opportunity_themes`

Master list of multi-year structural or technology themes.

Key fields include `theme_code`, `theme_name`, `description`, minimum/maximum horizon and `status`.

**Live verification on 18 August 2026:** 10 rows.

Status: **Partial / advanced with live production data**.

### `opportunity_assessment_runs`

Execution audit for Opportunity Assessment invocations. Each invocation receives a distinct run record while daily theme-level signal/assessment rows remain idempotent.

The run model records execution source, current GitHub specification identity/model telemetry where available, requested/completed theme counts, lifecycle status and timestamps.

Status: **Partial / advanced with live run history**.

### `structural_opportunity_signals`

Independent Structural Opportunity Signal by theme/date.

Key score fields are demand, adoption, capital investment, capacity constraint and economics, with `overall_score`, `confidence`, `signal_label`, `summary`, `evidence_summary`, `methodology_version` and `assessment_run_id`.

**Live verification on 18 August 2026:** 43 rows.

Status: **Partial / advanced with live production data**.

### `technology_inflection_signals`

Independent Technology Inflection Signal by theme/date.

Key fields describe the bottleneck/unlock, maturity stage, bottleneck-unlock/evidence/commercialisation/impact scores, overall score, confidence, label, summary, methodology version and `assessment_run_id`.

**Live verification on 18 August 2026:** 43 rows.

Status: **Partial / advanced with live production data**.

### `technology_inflection_events`

Material event-level evidence supporting Technology Inflection Signals, including event date/type, title, description, source and evidence strength.

**Live verification on 18 August 2026:** 16 rows.

Status: **Partial / advanced with live production data**.

### `opportunity_assessments`

Opportunity Convergence result produced only after the Structural and Technology signals have been assessed independently.

Key fields include linked structural/technology signal IDs, component scores/confidences, `opportunity_score`, `opportunity_confidence`, `opportunity_level`, `commercial_readiness`, `time_horizon`, `summary`, `methodology_version` and `assessment_run_id`.

**Live verification on 18 August 2026:** 43 rows.

Status: **Partial / advanced with live production data**.

### `opportunity_theme_instruments`

Maps Opportunity themes to instruments already tracked in the Trading universe. Exposure scoring measures economic/theme relevance, not a Buy/Hold/Sell recommendation.

Status: **Populated / active**.

### `opportunity_theme_external_instruments`

Stores credible publicly listed theme exposures that are not part of the internal Trading market-data universe. External exposures are research references only and do not automatically create `instruments` rows.

Status: **Populated / active**.

### `opportunity_theme_all_exposures`

Unified read view across tracked and external Opportunity exposures. This is a view rather than a persisted source table.

Status: **Active read model**.

---

## 6. Research & Evidence model

Research is a cross-assessment content layer rather than an Opportunity-only table pair.

### `assessment_research_documents`

Stores TipTap/ProseMirror research documents. A document has `document_scope` and may link to an AI Market Assessment, Market Convergence Assessment or Opportunity Assessment.

Important fields include:

- `document_scope`
- `market_assessment_id`
- `market_convergence_id`
- `opportunity_assessment_id`
- `title`
- `tiptap_json`
- `plain_text`
- `content_schema_version`
- `document_version`
- `status`
- `generated_by`
- editor/timestamps

**Live verification on 18 August 2026:** 43 rows.

Status: **Partial / advanced; actively populated by Opportunity Assessment**.

### `assessment_research_embeds`

Structured embedded evidence associated with a Research document. Embeds can reference instruments, Technical Engine rows, Market Convergence, AI Market Assessments, Structural/Technology signals, Technology events and Opportunity Assessments.

Important fields include source provenance, asset/link data, typed foreign-key references, chart/data/snapshot JSON, relevance, confidence and sort order.

**Live verification on 18 August 2026:** 301 rows.

Status: **Partial / advanced; actively populated by Opportunity Assessment**.

The Research model is deliberately capable of supporting more than one assessment family, even though current production population is concentrated in Opportunity Research & Evidence.

---

## 7. Market Convergence

Market Convergence combines the **independent Technical Engine** and **independent AI Market Assessment** only after both source results exist.

### `market_convergence_assessments`

The schema already supports:

- `instrument_id`
- `assessment_date`
- linked `technical_score_id`
- linked `ai_assessment_id`
- technical score/signal/confidence snapshot
- AI score/signal/confidence snapshot
- `convergence_score`
- `convergence_confidence`
- `convergence_label`
- `summary`
- `methodology_version`

This table must not be confused with `opportunity_assessments`: Market Convergence is short-term instrument convergence; Opportunity Convergence is long-term theme convergence.

**Live verification on 18 August 2026:** 0 rows.

Status: **Scaffolded**. The table and access model exist, but production convergence cannot be populated until the independent Technical Engine produces real results and the convergence methodology is finalised.

---

## 8. RLS and client-access maturity

RLS state was re-verified directly against the live database on 18 August 2026.

### Assessment/output tables with RLS enabled and dashboard-readable SELECT policies

The following targeted tables have RLS enabled and an explicit `SELECT` policy for `anon` and `authenticated` users:

- `opportunity_themes`
- `structural_opportunity_signals`
- `technology_inflection_signals`
- `technology_inflection_events`
- `opportunity_assessments`
- `opportunity_theme_instruments`
- `opportunity_theme_external_instruments`
- `assessment_research_documents`
- `assessment_research_embeds`
- `market_convergence_assessments`
- `gpt_market_runs`
- `gpt_market_assessments`
- `gpt_market_evidence`

These policies provide dashboard read access; they are not permission for anonymous client writes.

### Internal Market Assessment control tables

`market_assessment_queue` and `market_assessment_schedule_log` both have RLS enabled with explicit `ALL` policies for `anon`/`authenticated` whose conditions are `false`. Client access is therefore deliberately blocked.

### Technical tables

`technical_indicators` and `market_scores` have RLS enabled. `market_scores` currently exposes an authenticated-read policy; the Technical Engine remains scaffolded and has no current rows.

### View caution

`opportunity_theme_all_exposures` is a view, not an RLS-bearing table. Its security behaviour must be reviewed through view ownership/security-invoker configuration and underlying-table policies rather than by looking for `relrowsecurity` on the view itself.

### Current security maturity

The targeted assessment tables no longer match the older documentation statement that RLS was disabled across Market Assessment/control tables. The live state is materially more deliberate: published assessment/research output has explicit read policies, while internal queue/schedule controls block client access.

This does **not** complete the wider security-hardening phase. `SEC-001` through `SEC-005` still own the formal access classification, policy review, helper-function search-path hardening, `pg_net` warning review and frontend environment-secret work.

---

## 9. Watchlists and alerts

### `watchlists` / `watchlist_items`

User-owned instrument lists and membership.

Status: **Partial**.

### `alerts` / `alert_events`

Alert definitions and trigger history.

Status: **Scaffolded**.

---

## 10. External opinion and research-source model

### `opinion_sources`

Approved opinion/research source catalogue.

Status: **Partial**.

### `opinion_reviews`

Opinion/research collection-run audit.

Status: **Partial / tested**.

### `instrument_opinions`

Source-specific opinions attached to instruments, including stance, confidence, ratings/targets, rationale, provenance and materiality.

Status: **Partial / tested**.

### `instrument_opinion_consensus`

Aggregate opinion state by instrument/review.

Status: **Partial / tested**.

---

## 11. Trading strategies and decision framework

### `trading_strategies`

User-owned strategy definitions.

Status: **Scaffolded**.

### `trading_test_runs`

Backtest, paper-trading or live test results for a strategy.

Status: **Scaffolded**.

### `trading_decision_trees`, `trading_decision_nodes`, `trading_decision_edges`

Reusable strategy-review workflow definitions and transitions.

Status: **Operational template**.

### `trading_decision_evaluations`

Stores the decision path/final outcome for a strategy test run.

Status: **Scaffolded**.

---

## 12. Application settings

### `app_settings`

Generic application configuration store.

Status: **Scaffolded**.

---

## Relationship summary

```text
data_providers
   +-- provider_instruments -- instruments
   +-- market_observations -- instruments
   +-- sync_runs

instruments
   +-- technical_indicators
   +-- market_scores
   +-- gpt_market_assessments -- gpt_market_runs
   |                          +-- gpt_market_evidence
   +-- opportunity_theme_instruments -- opportunity_themes
   +-- watchlist_items -- watchlists
   +-- alerts -- alert_events
   +-- instrument_opinions -- opinion_sources

opportunity_themes
   +-- structural_opportunity_signals
   +-- technology_inflection_signals
   |      +-- technology_inflection_events
   +-- opportunity_assessments
   +-- opportunity_theme_instruments
   +-- opportunity_theme_external_instruments

Technical Engine                       Independent AI Market Assessment
technical_indicators                   gpt_market_assessments
        |                                      |
        v                                      v
market_scores ----------------> market_convergence_assessments

assessment_research_documents
   +-- assessment_research_embeds
   +-- may link to AI Market, Market Convergence or Opportunity assessments

trading_strategies
   +-- trading_test_runs
          +-- trading_decision_evaluations
                 +-- trading_decision_trees
                 +-- trading_decision_nodes
```

## Independence boundaries

1. Opportunity Structural and Technology signals are formed independently from short-term Market Assessment and Technical Engine conclusions.
2. Opportunity Convergence combines only the independent Structural and Technology Opportunity signals.
3. AI Market Assessment and the Technical Engine remain independent until Market Convergence.
4. `market_convergence_assessments` must therefore reference independently completed technical and AI results rather than allowing either system to consume the other's conclusion upstream.
5. Research & Evidence may display/support multiple systems, but evidence presentation does not erase analytical independence.

## Historical onboarding rule

For a new instrument:

```text
Add instrument
-> create/verify live provider mapping
-> create/verify Tiingo historical mapping
-> Tiingo backfill for requested history
-> verify coverage and idempotency
-> ready as source data for future indicators/backtesting
```

Historical market data availability does not by itself make the Technical Engine or Market Convergence operational.
