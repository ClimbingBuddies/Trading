# Frontend Route Map

## Application structure

The frontend is a Next.js App Router application using TypeScript.

Supabase access is centralised through:

- `lib/supabase.ts`
- `lib/dashboard.ts`

Shared presentation components include:

- `components/AppNav.tsx`
- `components/LoadChart.tsx`
- `components/MarketsTable.tsx`
- `components/AssessmentDonut.tsx`
- `components/PriceHistoryChart.tsx`

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

Derived dashboard measures include:

- last load
- last successful load
- loads today
- observations today
- failures/partial runs today
- active instrument count
- latest observation
- 14-day observation/load history
- instrument freshness buckets

Implementation entry point:

- `getAdminDashboardData()` in `lib/dashboard.ts`

### `/admin/loads/[id]`

Purpose: load-run drill-through.

Primary Supabase sources:

- selected `sync_runs` row
- `market_observations` loaded around the run period

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

Current features:

- active instrument count
- asset-class counts
- latest prices
- provider display
- freshness state
- asset filters
- text search
- symbol drill-through

Implementation entry point:

- `getMarketsData()`

### `/markets/[symbol]`

Purpose: instrument detail and price history.

Primary Supabase sources:

- `instruments`
- `market_observations`
- latest `gpt_market_assessments` record for the instrument

Current features:

- latest price
- observation/load timestamps
- asset type
- assessment status
- price-history chart
- cross-link to the assessment detail page

Implementation entry point:

- `getMarketDetail(symbol)`

## Assessments

### `/assessments`

Purpose: overview of the latest GPT assessment set.

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

The page intentionally warns when assessment rows exist but the current run remains marked `running`.

Implementation entry point:

- `getAssessmentsData()`

### `/assessments/[symbol]`

Purpose: instrument assessment detail.

Primary Supabase sources:

- `instruments`
- latest `gpt_market_assessments` row
- associated `gpt_market_evidence`

Current fields displayed can include:

- rating
- score
- confidence
- summary
- bull case
- bear case
- technical view
- macro view
- valuation view
- catalysts
- risks
- evidence

Implementation entry point:

- `getAssessmentDetail(symbol)`

## Strategies

### `/strategies`

Purpose: strategy laboratory overview and standard decision framework.

Primary Supabase sources:

- `trading_strategies`
- `trading_test_runs`
- `trading_decision_trees`
- `trading_decision_nodes`
- `trading_decision_edges`

Current behaviour:

- shows zero real strategies/test runs when tables are empty;
- displays the active Standard Trading Strategy Review system template;
- preserves an intentional empty state rather than fabricating sample production records.

Implementation entry point:

- `getStrategiesData()`

### `/strategies/[id]`

Purpose: future populated strategy drill-through.

The route exists in GitHub and is intended for individual strategy records.

### `/strategies/[id]/tests/[runId]`

Purpose: future populated test-run drill-through.

The route exists in GitHub and is intended for recorded backtest/paper/live test evidence.

## Data-access approach

The current frontend creates a Supabase client using the project URL and publishable key.

The frontend does not use the service-role key or Twelve Data API key.

Database RLS policies therefore determine what the browser/server-rendered application can see.

## Important current behaviour

### Public operational data

The current public dashboard has read access to:

- `data_providers`
- `instruments`
- `provider_instruments`
- `market_observations`
- `sync_runs`
- system strategy decision-tree records

### Owner-specific strategy data

Strategy, test-run and decision-evaluation data is designed for authenticated owner-specific access. Because the current public dashboard is not authenticated, owner-specific records should not be expected to appear there without a deliberate authentication design.

## Development rule

Before adding a dashboard section, identify:

1. the Supabase table or query that owns the data;
2. whether the dataset is public, authenticated or service-only;
3. whether the table is operational, partial or scaffolded;
4. how empty-state behaviour should work.

Avoid building frontend features that imply a pipeline is operational when the supporting database workflow is not yet complete.
