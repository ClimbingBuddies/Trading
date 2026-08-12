# Platform Architecture

## Purpose

Discover Boulders Markets is a Supabase-backed trading research and monitoring platform with a Next.js presentation layer.

The current architecture is deliberately split so that:

- **Supabase** owns persistent data, scheduled jobs, Edge Functions and server-side integrations.
- **Next.js** owns dashboards, research views and drill-through navigation.
- **Vercel** hosts the Next.js application.
- **Twelve Data** is the active market-data provider.

## High-level architecture

```text
Twelve Data
    |
    v
Supabase Edge Function: full-twelve-data-load
    |
    +--> sync_runs
    +--> market_observations
             |
             v
        instruments
             |
             +--> Markets dashboard
             +--> Admin monitoring
             +--> GPT assessments
             +--> future indicators/scores/alerts

Scheduled assessment request
    |
    v
market_assessment_queue
    |
    v
[analysis worker not yet implemented end-to-end]
    |
    v
gpt_market_runs
    |
    +--> gpt_market_assessments
             |
             +--> gpt_market_evidence

Strategy definition
    |
    v
trading_strategies
    |
    v
trading_test_runs
    |
    v
trading_decision_evaluations
    |
    v
trading_decision_trees / nodes / edges
```

## Platform layers

### 1. Market reference and provider layer

Core tables:

- `data_providers`
- `instruments`
- `provider_instruments`

This layer defines what is tracked and how internal instruments map to an external provider.

Current state:

- One active provider: Twelve Data.
- 30 active instruments.
- 30 active provider mappings.
- Asset mix: 15 equities, 5 ETFs, 5 forex pairs and 5 crypto pairs.

### 2. Market-data ingestion and operational monitoring

Core tables:

- `market_observations`
- `sync_runs`

Server-side components:

- Edge Function `full-twelve-data-load`
- Edge Function `test-twelve-data-load`
- pg_cron job `trading-market-data-every-15-minutes`

This is the most mature end-to-end pipeline in the platform.

### 3. Research, opinions and alerts

Core tables:

- `opinion_sources`
- `opinion_reviews`
- `instrument_opinions`
- `instrument_opinion_consensus`
- `watchlists`
- `watchlist_items`
- `alerts`
- `alert_events`
- `technical_indicators`
- `market_scores`
- `market_opinions`

This layer is mostly scaffolded or lightly tested. It should not yet be described as a complete production research engine.

### 4. GPT market-assessment layer

Core tables:

- `market_assessment_schedule_log`
- `market_assessment_queue`
- `gpt_market_runs`
- `gpt_market_assessments`
- `gpt_market_evidence`

Database functions:

- `queue_daily_market_assessment()`
- `process_market_assessment_queue()`

Scheduler:

- `daily_market_assessment`

The schema and scheduling trigger exist, and one test GPT run has produced 30 assessments. The queue-to-analysis execution path is not yet complete.

### 5. Strategy laboratory

Core tables:

- `trading_strategies`
- `trading_test_runs`
- `trading_decision_trees`
- `trading_decision_nodes`
- `trading_decision_edges`
- `trading_decision_evaluations`

A complete system decision-tree template exists, but there are currently no strategy, test-run or evaluation records.

## Frontend application

The Next.js application uses the App Router and reads Supabase through `lib/dashboard.ts`.

Current top-level areas:

- Admin
- Markets
- Assessments
- Strategies

The frontend is currently read-oriented. Strategy owner tables are designed for authenticated user ownership, but the present public dashboard primarily uses public read policies for operational market data and the system decision-tree template.

## Design principle

The platform should continue to use Supabase as the system of record. Frontend pages should calculate presentation metrics from Supabase data but should not invent production values to fill empty areas.
