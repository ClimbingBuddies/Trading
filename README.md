# Discover Boulders Markets

> **Before modifying this shared project:** check the [live development lock](https://github.com/ClimbingBuddies/Trading/blob/coordination/state.json) and [development warning](https://github.com/ClimbingBuddies/Trading/issues/39). If occupied, stay read-only. Start with [agent instructions](AGENTS.md) and the [compact project context](documentation/project-context.md).

Discover Boulders Markets is a Supabase-backed trading research, monitoring and strategy-validation platform with a Next.js frontend deployed on Vercel.

Both contributors retain equal project input and existing access. Cody operates the AI accounts and schedules; see the [AI execution handover](documentation/ai-execution-handover.md) for the account-side cutover and stock ticker cadence.

## Canonical systems

- **GitHub:** `ClimbingBuddies/Trading` — application source, canonical methodology, specifications, documentation and audit evidence.
- **Supabase:** project `glvbqcplgjdfgjyknzsa` — persisted market data, assessments, operational state, user-owned data and strategy evidence.
- **Vercel:** project `boulders-market`. Discovery on 9 November 2026 matched production to `project/decision-lab-completion`, not `main`; see the [baseline record](documentation/project-context.md). Integration and production deployment require separate authorization.
- **Production:** https://discoverbouldersmarkets.vercel.app

Do not create or use a duplicate Trading deployment project. The frontend uses the Supabase publishable key only; service-role and provider secrets must never be exposed to the browser.

## Platform capabilities

- Fifteen-minute market-data ingestion and operational monitoring.
- Independent short-term Technical Engine and ChatGPT Market Assessment branches.
- Persisted Market Convergence after both independent branches have completed.
- Independent long-term Structural Opportunity and Technology Inflection research, Opportunity Assessment, exposure mapping and Research & Evidence.
- Approved external-opinion collection with provenance, deduplication and consensus lineage.
- Private user-owned watchlists.
- Private user-owned alerts with persisted event history and evaluator telemetry.
- A private strategy laboratory with immutable backtest provenance and database-driven review outcomes.
- Responsive dashboards, drill-through routes and semantic colour palettes.

The assessment systems remain analytically separate. A long-term Opportunity score is not a Buy recommendation, and a short-term Market result is not an input to Opportunity Assessment.

## Documentation

Start with:

- [Documentation index](documentation/README.md)
- [Canonical project plan](documentation/project-plan.md)
- [Platform architecture](documentation/platform-architecture.md)
- [Supabase data model](documentation/supabase-data-model.md)
- [Frontend route map](documentation/frontend-route-map.md)
- [Operational runbook](documentation/operational-runbook.md)
- [Development workflow](documentation/development-workflow.md)

Canonical execution specifications live under [automation](automation/), focused technical specifications under [documentation/specifications](documentation/specifications/), pipeline documentation under [documentation/pipelines](documentation/pipelines/) and independent completion evidence under [documentation/project-audits](documentation/project-audits/).

## Application routes

| Area | Routes | Access |
|---|---|---|
| Admin | `/admin`, `/admin/loads/[id]` | Operational dashboard |
| Markets | `/markets`, `/markets/[symbol]` | Public read-only |
| Assessments | `/assessments`, `/assessments/[symbol]` | Deliberately published completed output |
| Opportunities | `/opportunities`, `/opportunities/[theme]` | Public read-only |
| Watchlists | `/watchlists` | Permanent authenticated owner |
| Alerts | `/alerts` | Permanent authenticated owner |
| Strategies | `/strategies`, `/strategies/[id]`, `/strategies/[id]/tests/[runId]` | Authenticated owner |

Blank data is a supported state. The product must show an intentional empty state and must never fabricate production rows, metrics, prices, evidence or links.

## Delivery status

The authorised platform plan through QUAL-004 is complete and independently audited. DOC-RECON-001 reconciles the current documentation set after that delivery programme. The strategy platform is operational, but its first persisted strategy outcome is `VALIDATE_ROBUSTNESS / continue_testing`; live execution remains disabled.
