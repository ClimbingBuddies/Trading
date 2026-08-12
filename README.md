# Discover Boulders Markets

Trading dashboard application backed by the existing Supabase Trading project.

## Documentation

The platform is documented from the live Supabase structure outward. Start here:

- [Trading Platform Documentation](documentation/README.md)
- [Platform Architecture](documentation/platform-architecture.md)
- [Supabase Data Model](documentation/supabase-data-model.md)
- [Market Data Pipeline](documentation/pipelines/market-data-pipeline.md)
- [Market Assessment Pipeline](documentation/pipelines/market-assessment-pipeline.md)
- [Strategy Framework](documentation/strategy-framework.md)
- [Frontend Route Map](documentation/frontend-route-map.md)
- [Security and Operational Notes](documentation/security-and-operational-notes.md)

The documentation distinguishes between operational features, partially implemented pipelines and schema that is currently only scaffolded.

## Canonical deployment

Use only:

- Vercel project: `discoverbouldersmarkets`
- Intended public URL: `https://discoverbouldersmarkets.vercel.app`

Do not use the historical duplicate Vercel projects `trading` or `trading-admin-monitor` for application development or deployment.

### Current alias state

The Next.js dashboard is deployed successfully to the canonical Vercel project `discoverbouldersmarkets`.

However, the clean alias `discoverbouldersmarkets.vercel.app` is still owned by the legacy Vercel project `trading-admin-monitor`. The alias must be removed from that legacy project and attached to `discoverbouldersmarkets` before the intended clean URL can serve this dashboard.

This is an alias-routing issue only; the dashboard build itself compiles and deploys successfully.

## Architecture

- GitHub: `ClimbingBuddies/Trading`
- Supabase project: `Trading`
- Supabase project ref: `glvbqcplgjdfgjyknzsa`
- Frontend: Next.js App Router + TypeScript
- Deployment: Vercel project `discoverbouldersmarkets`

Supabase remains responsible for persistence, scheduled market-data loading and Edge Functions. The Next.js application is the monitoring, research and drill-through presentation layer.

The application uses only the Supabase publishable key. Never add the service-role key or Twelve Data API key to the frontend.

## Dashboard areas

### Admin

- `/admin` — loader health, load KPIs, observation volumes, freshness and recent sync history
- `/admin/loads/[id]` — individual sync-run drill-through

### Markets

- `/markets` — active instrument overview, asset filters, search and freshness
- `/markets/[symbol]` — instrument price/history drill-through

### Assessments

- `/assessments` — assessment distribution, conviction and recent assessment rows
- `/assessments/[symbol]` — analyst-style assessment detail and supporting evidence

### Strategies

- `/strategies` — strategy laboratory, test state and decision framework
- `/strategies/[id]` — strategy detail when strategy rows exist
- `/strategies/[id]/tests/[runId]` — test-run detail when test rows exist

## Empty-state rule

Blank data is a supported application state, not a build failure.

Every dashboard should retain its layout when a dataset has no rows and show an intentional empty state such as `No strategies created yet`, `No assessments loaded yet`, or `Price history will appear after more observations are loaded`.

Never create fabricated production rows or metrics simply to populate the interface. Values must come from Supabase, a clearly defined calculation over Supabase data, or a deliberate empty state.

## Visual direction

The four dashboards share one application shell:

- persistent dark navy navigation
- light main content surface
- compact KPI strip
- restrained blue accents
- green/amber/red only for meaningful state
- dense, readable operational tables
- desktop-first responsive layout

The visual reference is the agreed Admin / Markets / Assessments / Strategies four-panel concept, but conceptual numbers in that image are not data sources.

## Vercel configuration

`vercel.json` explicitly configures the project as Next.js and uses `.next` as the deployment output. This overrides the historical Vercel project setting that previously expected a static `public` output directory.

## Data access

The app is read-only for this stage. Supabase RLS and Data API policy still determine which rows are visible through the publishable key. If a protected table has no read policy, the correct UI behaviour is an empty state until an appropriate read policy is deliberately approved and added.
