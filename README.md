# Discover Boulders Markets

Trading dashboard application backed by the existing Supabase Trading project.

## Documentation

The platform is documented from the live Supabase structure outward. Start here:

- [Canonical Project Plan](documentation/project-plan.md) — delivery status, dependencies and next action.
- [Assessment System Overview](documentation/assessment-system-overview.md) — short-term Market Assessment vs long-term Opportunity Assessment, independence and convergence boundaries.
- [Trading Platform Documentation](documentation/README.md)
- [Development Workflow](documentation/development-workflow.md) — required documentation-impact checklist for significant architecture, schema, security, automation and operational changes.
- [Platform Architecture](documentation/platform-architecture.md)
- [Supabase Data Model](documentation/supabase-data-model.md)
- [Market Data Pipeline](documentation/pipelines/market-data-pipeline.md)
- [Market Assessment Pipeline](documentation/pipelines/market-assessment-pipeline.md)
- [Opportunity Assessment Pipeline](documentation/pipelines/opportunity-assessment-pipeline.md)
- [Daily Market Assessment Specification](automation/daily-market-assessment.md)
- [Daily Opportunity Assessment Specification](automation/daily-opportunity-assessment.md)
- [Strategy Framework](documentation/strategy-framework.md)
- [Frontend Route Map](documentation/frontend-route-map.md)
- [Security and Operational Notes](documentation/security-and-operational-notes.md)

The documentation distinguishes between operational features, partially implemented pipelines and schema that is currently only scaffolded. A visible dashboard or populated table does not by itself make an underlying workflow Operational.

## Assessment systems

Discover Boulders Markets has two separate assessment systems:

- **Short-term Market Assessment** — answers **“Is this instrument attractive now?”** The independent ChatGPT Market Assessment has persisted results. The independent Technical Engine and Market Convergence remain scaffolded and are not yet operational.
- **Long-term Opportunity Assessment** — answers **“What could become important next?”** Structural Opportunity and Technology Inflection signals are produced independently and then combined into Opportunity Assessment / Opportunity Convergence. Themes, signals, assessments, exposure mappings and Research & Evidence are persisted, with formal Operational verification still governed by the project plan.

The systems may be displayed together after each has produced its own result, but neither system's scores or conclusions may be used to form the other. A high Opportunity score is not a Buy recommendation, and a strong Market rating does not prove a long-term structural opportunity.

See [Assessment System Overview](documentation/assessment-system-overview.md) for the authoritative architecture and independence rules.

## Canonical deployment

Use only:

- GitHub repository: `ClimbingBuddies/Trading`
- Production branch: `main`
- Vercel project: `boulders-market`
- Public URL: `https://discoverbouldersmarkets.vercel.app`

The intended production path is:

`ClimbingBuddies/Trading` → `main` → Vercel project `boulders-market` → `https://discoverbouldersmarkets.vercel.app`

Git integration for `boulders-market` was connected to `ClimbingBuddies/Trading` on 13 August 2026 so new commits to `main` can trigger production deployments automatically.

Do not create or use duplicate Trading deployment projects for application development. Vercel project/repository linkage is configured in Vercel rather than by repository name alone, so deployment ownership should be verified in Vercel when troubleshooting automatic deployments.

## Architecture

- GitHub: `ClimbingBuddies/Trading`
- Supabase project: `Trading`
- Supabase project ref: `glvbqcplgjdfgjyknzsa`
- Frontend: Next.js App Router + TypeScript
- Deployment target: Vercel project `boulders-market`
- Canonical public URL: `https://discoverbouldersmarkets.vercel.app`

Supabase remains responsible for persistence, scheduled market-data loading and Edge Functions. ChatGPT Scheduled Tasks perform independent assessment workflows defined in GitHub specifications. The Next.js application is the monitoring, research and drill-through presentation layer.

The application uses only the Supabase publishable key. Never add the service-role key or Twelve Data API key to the frontend.

## Dashboard areas

### Admin

- `/admin` — loader health, load KPIs, observation volumes, freshness and recent sync history
- `/admin/loads/[id]` — individual sync-run drill-through

### Markets

- `/markets` — active instrument overview, asset filters, search and freshness
- `/markets/[symbol]` — instrument price/history drill-through

### Assessments

- `/assessments` — short-term independent ChatGPT Market Assessment distribution, conviction and recent assessment rows
- `/assessments/[symbol]` — analyst-style market assessment detail and supporting evidence

These routes currently represent the AI Market branch, not completed Market Convergence.

### Opportunities

- `/opportunities` — long-term Opportunity Assessment overview, Structural Opportunity + Technology Inflection convergence and ranked themes
- `/opportunities/[theme]` — theme drill-through with component scores, history, technology events, instrument exposure and Research & Evidence / TipTap-compatible content

### Strategies

- `/strategies` — strategy laboratory, test state and decision framework
- `/strategies/[id]` — strategy detail when strategy rows exist
- `/strategies/[id]/tests/[runId]` — test-run detail when test rows exist

## Empty-state rule

Blank data is a supported application state, not a build failure.

Every dashboard should retain its layout when a dataset has no rows and show an intentional empty state such as `No strategies created yet`, `No assessments loaded yet`, `No Opportunity Themes exist yet`, or `Price history will appear after more observations are loaded`.

Never create fabricated production rows or metrics simply to populate the interface. Values must come from Supabase, a clearly defined calculation over Supabase data, or a deliberate empty state.

## Visual direction

The dashboard areas share one application shell:

- persistent dark navy navigation
- light main content surface
- compact KPI strip
- restrained blue accents
- green/amber/red only for meaningful state
- dense, readable operational tables
- desktop-first responsive layout

The visual reference is the agreed Admin / Markets / Assessments / Opportunities / Strategies concept, but conceptual numbers in design references are not data sources.

## Vercel configuration

`vercel.json` explicitly configures the project as Next.js and uses `.next` as the deployment output.

The repository does not itself choose which Vercel project receives a Git deployment. The Vercel project `boulders-market` must be connected to `ClimbingBuddies/Trading` with `main` as the Production Branch for automatic production deployments.

## Data access

The app is read-only for this stage. Supabase RLS and Data API policy determine which rows are visible through the publishable key. If a protected table has no read policy, the correct UI behaviour is an empty state until an appropriate read policy is deliberately approved and added.
