# Trading Platform Documentation

This documentation describes the current Discover Boulders Markets trading platform as implemented in the Supabase project `glvbqcplgjdfgjyknzsa` and the GitHub repository `ClimbingBuddies/Trading`.

The documentation is intentionally based on the live platform structure rather than chat history. Where the database contains scaffolding for future functionality, that is identified explicitly.

## Source of truth

Use the following order when resolving uncertainty:

1. Supabase schema, functions, scheduled jobs and Edge Functions.
2. GitHub application code in `ClimbingBuddies/Trading`.
3. Vercel deployment configuration.
4. Historical chat notes only as supporting context.

## Documentation map

- [Canonical Project Plan](project-plan.md) — task-by-task delivery plan, dependencies, status and next action.
- [Platform Architecture](platform-architecture.md) — major platform layers and how they connect.
- [Supabase Data Model](supabase-data-model.md) — tables, relationships and current implementation status.
- [Functional Roadmap](functional-roadmap.md) — Phase 1 working now, Phase 2 finish next, and Phase 3 future capability.
- [Phase 2 Progress](phase2-progress.md) — implementation status, completed work, activation gates and next actions.
- [Market Data Pipeline](pipelines/market-data-pipeline.md) — Twelve Data ingestion, scheduling and load monitoring.
- [Market Assessment Pipeline](pipelines/market-assessment-pipeline.md) — scheduled assessment queue, GPT assessment records and current gaps.
- [Strategy Framework](strategy-framework.md) — strategy/test tables and the standard decision tree.
- [Frontend Route Map](frontend-route-map.md) — Next.js routes and the Supabase data each page uses.
- [Security and Operational Notes](security-and-operational-notes.md) — RLS, public dashboard access, secrets and known technical debt.

## Current platform status

### Operational

- Twelve Data market-data ingestion.
- 30 active instruments across equities, ETFs, forex and crypto.
- 15-minute market-data scheduler.
- Market-hours-aware loading for US equities and ETFs.
- Market observation history and sync-run monitoring.
- Admin and Markets dashboards.
- GPT assessment records for all 30 instruments from the current test run.
- Assessments dashboard and instrument assessment drill-through.
- Standard Trading Strategy Review decision-tree template.

### Partially implemented

- Daily market-assessment automation: queue lifecycle and worker are now deployed; OpenAI configuration, backlog handling and recurring worker activation remain outstanding.
- External opinion/research capture.
- Watchlists and alerts.
- Strategy testing and evaluation workflow.

### Scaffolded but not yet populated

- Technical indicators.
- Market scores.
- Legacy market opinions table.
- Trading strategies.
- Trading test runs.
- Trading decision evaluations.

## Important principle

A table existing in Supabase does not mean the associated product feature is complete. Documentation in this folder distinguishes between:

- **Operational** — actively populated and used by the platform.
- **Partial** — some pipeline/database pieces exist but the end-to-end process is incomplete.
- **Scaffolded** — schema is ready but there are no production records yet.
