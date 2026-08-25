# Supabase Data Model

**Project:** `glvbqcplgjdfgjyknzsa`  
**Last reconciled against production:** 25 August 2026

This document is the current logical model. Exact columns, constraints and function bodies remain authoritative in Supabase production and the committed migrations. Dynamic row counts are intentionally omitted because they become stale; operational dashboards and audit records provide point-in-time evidence.

## Market-data foundation

| Tables | Purpose |
|---|---|
| `data_providers`, `provider_instruments` | Provider identity and instrument mappings |
| `instruments` | Canonical instrument universe and active/inactive state |
| `market_observations` | Timestamped price/volume observations |
| `sync_runs` | Loader lifecycle, counts, timing and errors |
| `historical_backfill_batches`, `historical_backfill_queue` | Controlled history backfill and retry state |

Thirty instruments are active in the production assessment universe. Additional inactive/history-bearing instruments are retained deliberately.

## Independent short-term Market system

| Tables | Purpose |
|---|---|
| `technical_indicators` | Versioned deterministic indicator snapshots |
| `market_scores` | Versioned Technical component/overall/confidence results |
| `technical_engine_runs` | Scheduled/manual/retry telemetry |
| `gpt_market_runs` | AI Market run lifecycle and methodology metadata |
| `gpt_market_assessments` | Independent per-instrument AI result |
| `gpt_market_evidence` | Evidence linked to the AI result |
| `market_assessment_queue`, `market_assessment_schedule_log` | Trusted orchestration and schedule history |
| `market_convergence_assessments` | Versioned combination of independent Technical and AI results with source lineage |
| `market_convergence_runs` | Cutoff, freshness, skip, retry and terminal telemetry |

The Technical and AI branches are independent until Convergence. Published Market reads are restricted to completed non-test output and approved columns; control state and writes remain internal.

## Long-term Opportunity system

| Tables | Purpose |
|---|---|
| `opportunity_themes` | Long-term research themes |
| `structural_opportunity_signals` | Independent structural/economic signal |
| `technology_inflection_signals` | Independent technology-enablement signal |
| `technology_inflection_events` | Source-level real-world evidence |
| `opportunity_assessments` | Convergence of the two long-term signals |
| `opportunity_theme_instruments` | Exposure mapping to tracked instruments |
| `opportunity_theme_external_instruments` | Exposure mapping outside the active market universe |
| `opportunity_assessment_runs` | Invocation, completion, counts, errors and methodology |
| `assessment_research_documents` | TipTap-compatible explanatory research |
| `assessment_research_embeds` | Structured articles, charts, indicators, images and links |

Daily theme rows are idempotent while each execution receives its own run record. Opportunity outputs do not consume short-term Market conclusions.

## External opinion

| Tables | Purpose |
|---|---|
| `opinion_sources` | Canonical approved source identity |
| `opinion_reviews`, `opinion_source_review_results` | Collection/review lifecycle and per-source outcome |
| `instrument_opinions` | Atomic instrument-level opinion evidence |
| `instrument_opinion_consensus`, `opinion_consensus_members` | Derived consensus with explicit member lineage |
| `market_opinions` | Retained compatibility/scaffold table; not a substitute for the canonical lineage model |

The model prevents atomic evidence and its derived consensus from being double-counted.

## Private user monitoring

| Tables | Purpose |
|---|---|
| `watchlists`, `watchlist_items` | Private permanent-user lists and membership |
| `alerts` | Private owner alert definitions |
| `alert_events` | Owner-visible, evaluator-written event history |
| `alert_evaluation_state` | Internal transition/deduplication state |
| `alert_evaluator_runs` | Evaluator reason, filters, status, counts and errors |

Watchlist and alert ownership references `auth.users.id`. Anonymous users and other authenticated users cannot access an owner's rows. Clients cannot forge alert event history. Approved producers and cron trigger evaluation; deterministic event keys prevent duplicates.

## Strategy laboratory

| Tables | Purpose |
|---|---|
| `trading_strategies` | Private owner strategy identity, version, rules and live-enabled state |
| `trading_test_runs` | Immutable backtest/paper/live provenance and metrics |
| `trading_decision_trees` | Standard or owner decision-tree identity |
| `trading_decision_nodes`, `trading_decision_edges` | Ordered decision rules and transitions |
| `trading_decision_evaluations` | Persisted inputs, path and review outcome |

The first real strategy, backtest and evaluation are persisted. Its review outcome is `VALIDATE_ROBUSTNESS / continue_testing`; live execution remains disabled. Owners can read their evidence through RLS, while trusted database/service logic creates review outcomes.

## Supporting schemas and extensions

- `auth` — Supabase users, identities, sessions and authentication state.
- `cron` — active database schedules and execution ownership.
- `vault` — encrypted provider secrets used by trusted server-side paths.
- `net` — supported `pg_net` extension objects and HTTP queues.
- `storage` and `realtime` are available platform schemas but are not primary Trading data stores.

## Access model

- RLS is enabled on application-owned public tables.
- Public output is deliberately classified rather than opened by default.
- Permanent-user workspaces combine authenticated access with owner predicates.
- `service_role` and trusted database ownership are reserved for loaders, calculation, orchestration and evaluator writes.
- Views and RPCs must preserve the same source-table boundary.
- Frontend code uses the publishable key and never a service-role/provider secret.

## Canonical detail

- Migrations: [`supabase/migrations`](../supabase/migrations/)
- Security decisions: [security documentation](security/)
- Calculation and methodology contracts: [specifications](specifications/)
- Operational implementations: [pipelines](pipelines/)
- Independent verification: [project audits](project-audits/)
