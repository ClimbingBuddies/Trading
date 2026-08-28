# Discover Boulders Markets

Discover Boulders Markets is a Supabase-backed trading research, monitoring and strategy-validation platform with a Next.js frontend deployed on Vercel.

## Canonical systems

- **GitHub:** `ClimbingBuddies/Trading` — application source, canonical methodology, specifications, documentation and audit evidence.
- **Supabase:** project `glvbqcplgjdfgjyknzsa` — persisted market data, assessments, operational state, user-owned data and strategy evidence.
- **Vercel:** project `boulders-market`, production branch `main`.
- **Production:** https://discoverbouldersmarkets.vercel.app

Do not create or use a duplicate Trading deployment project. The frontend uses the Supabase publishable key only; service-role and provider secrets must never be exposed to the browser.

The tracked `.env` contains only the production Supabase URL and modern publishable key required by public and pull-request builds. These values identify the public API boundary and do not bypass authentication or row-level security. Service-role keys, provider credentials and other secrets remain outside the repository and must never use a `NEXT_PUBLIC_` name.

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
