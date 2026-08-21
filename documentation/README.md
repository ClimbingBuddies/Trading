# Trading Platform Documentation

This documentation describes the current Discover Boulders Markets trading platform as implemented in the Supabase project `glvbqcplgjdfgjyknzsa` and the GitHub repository `ClimbingBuddies/Trading`.

The documentation is intentionally based on the live platform structure rather than chat history. Where the database contains scaffolding for future functionality, that is identified explicitly.

## Source of truth

Use the following order when resolving uncertainty:

1. Supabase schema, functions, scheduled jobs and persisted results.
2. GitHub application code and canonical methodology in `ClimbingBuddies/Trading`.
3. Vercel deployment configuration and production behaviour where relevant.
4. Historical chat notes only as supporting context.

Project delivery state is controlled by [project-plan.md](project-plan.md).

## Assessment systems

The platform contains two analytically independent assessment systems:

- **Short-term Market Assessment** — asks whether a tracked instrument is attractive now. The independent ChatGPT Market branch has persisted assessment results. The independent Technical Engine now persists versioned indicators and technical scores; recurring ownership and Market Convergence remain later stages.
- **Long-term Opportunity Assessment** — asks what structural or technological changes could become important over months or years. Structural Opportunity and Technology Inflection signals are assessed independently before Opportunity Assessment / Opportunity Convergence is calculated. Themes, signals, assessments, exposures and Research & Evidence are persisted.

The two systems may be displayed together only after each has independently produced its result. Neither system's score, rating or conclusion may be used to form the other.

Start with [Assessment System Overview](assessment-system-overview.md) for the architecture, independence rules, convergence boundaries, current maturity and UI cross-reference.

## Documentation map

### Project control and system overview

- [Canonical Project Plan](project-plan.md) — task-by-task delivery plan, dependencies, status and next action.
- [Assessment System Overview](assessment-system-overview.md) — Market vs Opportunity Assessment, independence, convergence and UI boundaries.
- [Platform Architecture](platform-architecture.md) — major platform layers and how they connect.
- [Supabase Data Model](supabase-data-model.md) — tables, relationships and current implementation status.
- [Functional Roadmap](functional-roadmap.md) — staged platform capability and future work.
- [Phase 2 Progress](phase2-progress.md) — implementation status, activation gates and next actions.

### Data and assessment pipelines

- [Market Data Pipeline](pipelines/market-data-pipeline.md) — Twelve Data ingestion, scheduling and load monitoring.
- [Technical Calculation Specification](specifications/technical-calculation-specification.md) — deterministic Technical Engine indicators, intervals, warm-up, formulas, provenance, versioning and missing-data rules.
- [Technical Indicator Pipeline](pipelines/technical-indicator-pipeline.md) — service-only calculation implementation, persistence, idempotency and verification.
- [Technical Market Scoring Specification](specifications/technical-market-scoring-specification.md) — deterministic component, overall, confidence, missing-data and versioning rules.
- [Technical Market Scoring Pipeline](pipelines/technical-market-scoring-pipeline.md) — service-only scoring implementation, persistence, security and verification.
- [Technical Engine Scheduling and Monitoring](pipelines/technical-engine-operations.md) — daily frequency, trusted ownership, durable errors, bounded retries and Admin visibility.
- [Market Assessment Pipeline](pipelines/market-assessment-pipeline.md) — AI Market Assessment records, lifecycle and known gaps.
- [Opportunity Assessment Pipeline](pipelines/opportunity-assessment-pipeline.md) — Structural Signal, Technology Inflection, Opportunity Convergence, exposure, Research & Evidence, retries and Operational definition.
- [Daily Market Assessment Specification](../automation/daily-market-assessment.md) — canonical short-term AI Market Assessment methodology and independence rules.
- [Daily Opportunity Assessment Specification](../automation/daily-opportunity-assessment.md) — canonical long-term Opportunity Assessment execution specification.

### Product, strategy and operations

- [Strategy Framework](strategy-framework.md) — strategy/test tables and the standard decision tree.
- [Frontend Route Map](frontend-route-map.md) — Next.js routes and the Supabase data each page uses.
- [Market Assessment Access Classification](security/market-assessment-access-classification.md) — canonical public-output and internal-control access decision for the Market Assessment system.
- [Security and Operational Notes](security-and-operational-notes.md) — RLS, public dashboard access, secrets and known technical debt.

## Current platform status

### Operational foundation

- Twelve Data market-data ingestion.
- 30 active instruments across equities, ETFs, forex and crypto.
- 15-minute market-data scheduler.
- Market-hours-aware loading for US equities and ETFs.
- Market observation history and sync-run monitoring.
- Admin and Markets dashboards.

### Assessment systems — partial / advanced

#### Market Assessment

- Independent ChatGPT Market Assessment rows and evidence are persisted.
- The `/assessments` and `/assessments/[symbol]` routes expose the AI Market branch.
- A canonical GitHub Market methodology now exists at `automation/daily-market-assessment.md`.
- The Daily Trading Market Assessment task still requires migration to the canonical GitHub specification and unattended-run verification under the project plan.
- The Technical Engine now persists versioned daily/weekly indicator snapshots and independent `technical-score-v1` market scores, with a daily Supabase scheduler, bounded retry, durable run telemetry and Admin monitoring.
- Market Convergence has no current persisted convergence output.

#### Opportunity Assessment

- Active/watch Opportunity Themes are persisted.
- Structural Opportunity Signals, Technology Inflection Signals and final Opportunity Assessments are populated.
- Technology Inflection Events, tracked/external exposure mappings and Research & Evidence are populated.
- The `/opportunities` and `/opportunities/[theme]` routes expose the long-term Opportunity system.
- The project plan retains a formal end-to-end Operational verification item before the workflow is labelled fully Operational.

### Other partial or future capability

- External opinion/research capture.
- Watchlists and alerts.
- Strategy testing and evaluation workflow.
- Trading strategies and test-run data remain unpopulated until the strategy laboratory is operationalised.

## Important principle

A table existing in Supabase or a dashboard existing in the frontend does not mean the associated workflow is complete. Documentation in this folder distinguishes between:

- **Operational** — implemented, scheduled/owned, verified end to end and documented under the project-plan definition.
- **Partial** — meaningful pipeline/database/UI pieces exist but the end-to-end process is incomplete or awaiting verification.
- **Scaffolded** — schema or UI structure exists but the production workflow or persisted output is not yet present.
