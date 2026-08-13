# Frontend Route Map

## Application structure

The frontend is a Next.js App Router application using TypeScript.

Supabase access is centralised through:

- `lib/supabase.ts`
- `lib/dashboard.ts`
- `lib/opportunities.ts`

Shared presentation components include:

- `components/AppNav.tsx`
- `components/LoadChart.tsx`
- `components/MarketsTable.tsx`
- `components/AssessmentDonut.tsx`
- `components/PriceHistoryChart.tsx`
- `components/OpportunityHistoryChart.tsx`
- `components/ResearchDocument.tsx`

## Root route

### `/`

Purpose: entry point.

Current behaviour: redirects or routes into the Admin dashboard.

## Admin

### `/admin`

Purpose: operational market-data monitoring.

Primary Supabase sources:

- `sync_runs`
- `market_observations`
- `instruments`

Implementation entry point:

- `getAdminDashboardData()` in `lib/dashboard.ts`

### `/admin/loads/[id]`

Purpose: load-run drill-through.

Implementation entry point:

- `getLoadDetail(id)`

## Markets

### `/markets`

Purpose: current instrument universe, latest prices and data freshness.

Primary Supabase sources:

- `instruments`
- `provider_instruments`
- `data_providers`
- `market_observations`

Implementation entry point:

- `getMarketsData()`

### `/markets/[symbol]`

Purpose: instrument detail and price history.

Primary Supabase sources:

- `instruments`
- `market_observations`
- latest `gpt_market_assessments` record for the instrument

Implementation entry point:

- `getMarketDetail(symbol)`

## Market Assessments

### `/assessments`

Purpose: overview of the latest independent ChatGPT Market Assessment set.

Primary Supabase sources:

- `gpt_market_assessments`
- `gpt_market_runs`
- joined `instruments`

Current features:

- latest assessment date
- instruments assessed
- rating distribution
- average confidence
- highest-conviction instruments
- lowest-conviction instruments
- current run status
- recent assessment table

Implementation entry point:

- `getAssessmentsData()`

### `/assessments/[symbol]`

Purpose: instrument ChatGPT Market Assessment detail.

Primary Supabase sources:

- `instruments`
- latest `gpt_market_assessments` row
- associated `gpt_market_evidence`

Implementation entry point:

- `getAssessmentDetail(symbol)`

The ChatGPT Market Assessment should remain independent from the Technical Engine before Market Convergence is calculated.

## Opportunity Assessments

### `/opportunities`

Purpose: long-term Opportunity Assessment overview.

Primary Supabase sources:

- `opportunity_themes`
- `opportunity_assessments`
- `opportunity_theme_instruments`

Current features:

- active/watch Opportunity Theme count
- assessed theme count
- average Opportunity score
- Major / Transformational theme count
- highest Opportunity Convergence cards
- Structural Opportunity score
- Technology Inflection score
- confidence
- commercial readiness
- exposure count
- theme drill-through
- intentional empty state before the first scheduled Opportunity Assessment writes rows

Implementation entry point:

- `getOpportunityOverview()` in `lib/opportunities.ts`

### `/opportunities/[theme]`

Purpose: long-term Opportunity Theme drill-through using stable `theme_code` routing.

Primary Supabase sources:

- `opportunity_themes`
- `opportunity_assessments`
- `structural_opportunity_signals`
- `technology_inflection_signals`
- `technology_inflection_events`
- `opportunity_theme_instruments`
- `assessment_research_documents`
- `assessment_research_embeds`

Current features:

- Opportunity score and confidence
- Structural Opportunity component scores: demand, adoption, capital, capacity and economics
- Technology Inflection component scores: bottleneck unlock, evidence quality, commercialisation and impact
- bottleneck / potential unlock narrative
- maturity stage
- Opportunity score history chart
- Technology Inflection event cards with source links
- tracked-instrument exposure with cross-links back to Markets
- Research & Evidence rendering from TipTap/ProseMirror-compatible JSON
- rich article/link/image/evidence blocks
- Recharts-based chart blocks when chart snapshot data is available
- intentional empty states before scheduled data exists

Implementation entry point:

- `getOpportunityDetail(themeCode)` in `lib/opportunities.ts`

Important current limitation: the frontend renders TipTap-compatible JSON and structured embeds, but it is not yet an interactive TipTap editing surface. `data_reference` metadata is stored for future live-data resolution; current chart rendering uses available `snapshot_data` and otherwise displays a linked-chart placeholder.

## Strategies

### `/strategies`

Purpose: strategy laboratory overview and standard decision framework.

Primary Supabase sources:

- `trading_strategies`
- `trading_test_runs`
- `trading_decision_trees`
- `trading_decision_nodes`
- `trading_decision_edges`

Implementation entry point:

- `getStrategiesData()`

### `/strategies/[id]`

Purpose: populated strategy drill-through when strategy records exist.

### `/strategies/[id]/tests/[runId]`

Purpose: recorded backtest/paper/live test evidence when test-run rows exist.

## Data-access approach

The frontend creates a Supabase client using the Trading project URL and publishable key.

The frontend does not use the service-role key or Twelve Data API key.

Database RLS policies therefore determine what the browser/server-rendered application can see.

## Public assessment data

The new Opportunity Assessment and Research & Evidence tables have deliberate public read policies for the dashboard and no anonymous write policies.

Writes are expected to occur through controlled assessment workflows rather than the public frontend.

## Development rule

Before adding a dashboard section, identify:

1. the Supabase table or query that owns the data;
2. whether the dataset is public, authenticated or service-only;
3. whether the table is operational, partial or scaffolded;
4. how empty-state behaviour should work;
5. whether a displayed signal is an independent input or a convergence output.

Avoid building frontend features that imply a pipeline is operational when the supporting database workflow is not yet complete.
