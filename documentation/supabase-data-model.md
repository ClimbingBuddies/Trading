# Supabase Data Model

Supabase project reference: `glvbqcplgjdfgjyknzsa`

This document groups the public schema by business purpose and records the implementation state through 15 August 2026.

## 1. Provider and instrument reference data

### `data_providers`

Purpose: external market-data provider registry.

Key fields:

- `id`
- `provider_code`
- `provider_name`
- `base_url`
- `is_active`
- `created_at`

Current active market-data providers:

- `twelvedata` / Twelve Data — scheduled current/live quotes.
- `tiingo` / Tiingo — on-demand daily historical backfill.

Relationships:

- one provider to many `provider_instruments`
- one provider to many `market_observations`
- one provider to many `sync_runs`

Provider identity is part of the observation uniqueness model. Data retrieved from Tiingo must use the Tiingo provider ID and must not be labelled as Twelve Data.

Status: **Operational**.

### `instruments`

Purpose: internal master list of tradeable instruments.

Key fields:

- `id`
- `symbol`
- `instrument_name`
- `exchange_code`
- `asset_type`
- `currency_code`
- `country_code`
- `is_active`
- `created_at`

Current active universe:

- 30 active instruments
- 15 equities
- 5 ETFs
- 5 forex pairs
- 5 crypto pairs

This table is the central instrument reference for market data, assessments, opportunities, research and strategy features.

Historical data should normally be retained when an instrument leaves the active universe. Deactivate the instrument or provider mapping rather than deleting historical observations needed for reproducible analysis.

Status: **Operational**.

### `provider_instruments`

Purpose: maps an internal instrument to the provider-specific symbol used by an external market-data provider.

Key fields:

- `id`
- `provider_id`
- `instrument_id`
- `provider_symbol`
- `metadata`
- `is_active`
- `created_at`

Important unique constraints:

- `(provider_id, instrument_id)`
- `(provider_id, provider_symbol)`

An instrument can therefore have one mapping per provider, for example:

```text
NVDA
  +-- Twelve Data -> NVDA
  +-- Tiingo      -> NVDA
```

The Tiingo mapping is required before `backfill-market-history` can load history for an instrument.

Do not assume provider symbols are identical across providers. Resolve and verify mappings before creating them.

Status: **Operational**.

## 2. Market data and loader monitoring

### `market_observations`

Purpose: persistent provider-specific market observation history.

Key fields:

- `id`
- `instrument_id`
- `provider_id`
- `interval_code`
- `observed_at`
- `open`
- `high`
- `low`
- `close`
- `adjusted_close`
- `volume`
- `currency_code`
- `is_delayed`
- `raw_payload`
- `loaded_at`

Current usage:

- Twelve Data scheduled loader writes `interval_code = 'quote'`.
- Tiingo historical backfill writes `interval_code = '1day'`.

Historical Tiingo rows store the actual historical market date in `observed_at`, raw OHLC values, adjusted close when available, volume and provenance in `raw_payload._backfill`.

Important uniqueness constraint:

```text
(instrument_id, provider_id, interval_code, observed_at)
```

This allows current and historical records to coexist and makes the Tiingo historical workflow idempotent when it upserts on the same provider/date key.

Useful constraints also enforce non-negative OHLC/volume values and `high >= low` when both values exist.

### NVDA historical control result

The production Tiingo test on 15 August 2026 created:

- instrument: NVDA
- provider: Tiingo
- interval: `1day`
- first date: 16 August 2021
- last date: 14 August 2026
- rows: 1,255
- duplicate date groups: 0

An immediate rerun inserted 0 new rows and updated the existing 1,255 rows, leaving the total unchanged at 1,255.

Status: **Operational for live quotes and Tiingo EOD equity history**.

### `latest_market_observations`

Purpose: one latest **live/current quote** per instrument for the Markets dashboard.

The view is `security_invoker = true` and now filters:

```sql
interval_code = 'quote'
```

This prevents Tiingo daily historical rows from becoming the apparent latest market observation on the live Markets dashboard.

Ordering remains by instrument, then `observed_at`, `loaded_at` and row ID as deterministic tie-breakers.

Status: **Operational**.

### `sync_runs`

Purpose: execution audit for market-data loads.

Key fields:

- `id`
- `provider_id`
- `started_at`
- `finished_at`
- `requested_count`
- `received_count`
- `inserted_count`
- `status`
- `error_message`
- `metadata`

Twelve Data current-loader metadata includes operational fields such as function, batch size, market-hours state and evaluated time.

Tiingo historical metadata includes:

- function
- provider
- symbol
- provider symbol
- asset type
- years
- interval
- requested start/end
- endpoint family
- received/normalised/upsert counts
- inserted count
- updated-existing count
- actual coverage start/end
- total coverage rows

Failed provider calls are retained as failed audit rows rather than silently discarded.

Status: **Operational**.

### Market-data pipeline documentation

Current/live pipeline:

`documentation/pipelines/market-data-pipeline.md`

Authoritative historical backfill procedure:

`documentation/pipelines/historical-market-data-backfill.md`

## 3. Technical analysis and scoring

### `technical_indicators`

Purpose: calculated technical indicators attached to instruments and optionally source observations.

Key fields:

- `instrument_id`
- `observation_id`
- `indicator_code`
- `interval_code`
- `calculated_at`
- `value`
- `values`
- `calculation_version`

The new Tiingo `1day` history provides the daily source series required for future indicator calculations and strategy backtesting.

Status: **Scaffolded**.

### `market_scores`

Purpose: daily momentum/trend/volatility/volume scoring by instrument.

Status: **Scaffolded**.

### `market_opinions`

Purpose: older/simple instrument-level opinion table containing rating, confidence, score and key factors.

This overlaps conceptually with the newer opinion and GPT-assessment models and should be reviewed before further development.

Status: **Scaffolded / possible legacy model**.

## 4. Watchlists and alerts

### `watchlists`

Purpose: user-owned lists of instruments.

Owner relationship: `owner_user_id -> auth.users.id`.

Status: **Partial**.

### `watchlist_items`

Purpose: instruments assigned to a watchlist, including sort order and notes.

Status: **Partial**.

### `alerts`

Purpose: user-owned alert definitions against an instrument or watchlist.

Status: **Scaffolded**.

### `alert_events`

Purpose: individual alert trigger history.

Status: **Scaffolded**.

## 5. External opinion and research model

### `opinion_sources`

Purpose: catalogues approved sources such as analyst consensus, financial news, official company information, regulatory sources, market commentary and research.

Status: **Partial**.

### `opinion_reviews`

Purpose: records an opinion/research collection run.

Status: **Partial / tested**.

### `instrument_opinions`

Purpose: detailed source-specific opinions attached to instruments.

Key concepts include opinion type, stance, confidence, rating/target price, headline/summary/rationale, source URL/publish time, materiality and content hash.

Status: **Partial / tested**.

### `instrument_opinion_consensus`

Purpose: aggregate opinion state for an instrument and review.

Status: **Partial / tested**.

## 6. GPT market assessments

### `gpt_market_runs`

Purpose: run-level metadata for GPT assessment passes.

Key fields include run status, model name, prompt version, analysis mode, requested/completed ticker counts and notes.

Status: **Operational pipeline with ongoing monitoring**.

### `gpt_market_assessments`

Purpose: instrument-level GPT market assessment.

Key concepts include rating, confidence, score, summary, bull/bear case, technical/macro/valuation views, catalysts, risks, evidence summary and model version.

Status: **Operational for stored assessment records**.

### `gpt_market_evidence`

Purpose: evidence records supporting GPT assessments.

Status: **Operational**.

## 7. Scheduled assessment queue

### `market_assessment_queue`

Purpose: queued work for the daily market-assessment process.

Status: **Operational/under active pipeline development**.

### `market_assessment_schedule_log`

Purpose: scheduler audit trail for assessment requests.

Status: **Operational**.

## 8. Opportunity assessment and structural signal model

The schema also contains the opportunity-assessment and independent structural/technology signal tables used by the Opportunities dashboard and daily opportunity workflow, including:

- `opportunity_assessment_runs`
- `opportunity_assessments`
- `opportunity_themes`
- `opportunity_theme_instruments`
- `opportunity_theme_external_instruments`
- `opportunity_theme_all_exposures`
- `structural_opportunity_signals`
- `technology_inflection_signals`
- `technology_inflection_events`
- `market_convergence_assessments`
- `assessment_research_documents`
- `assessment_research_embeds`

These models are independent from the market-data provider design but use the same instrument master where applicable.

## 9. Trading strategies and test results

### `trading_strategies`

Purpose: user-owned strategy definitions.

Typical statuses include draft, testing, approved, paused and retired.

Status: **Scaffolded**.

### `trading_test_runs`

Purpose: backtest, paper-trading or live test results for a strategy.

Important metrics include trade count, net profit, return percentage, win rate, profit factor, expectancy, max drawdown, Sharpe ratio and out-of-sample return.

Tiingo daily history is intended to provide reproducible historical source data for future backtests.

Status: **Scaffolded**.

## 10. Strategy decision framework

### `trading_decision_trees`

Purpose: reusable strategy-review workflow definitions.

Status: **Operational template**.

### `trading_decision_nodes`

Purpose: start, decision and outcome nodes within a decision tree.

Status: **Operational template**.

### `trading_decision_edges`

Purpose: true/false or workflow transitions between decision nodes.

Status: **Operational template**.

### `trading_decision_evaluations`

Purpose: stores the decision path and final outcome for a test run evaluated against a decision tree.

Status: **Scaffolded**.

## 11. Application settings

### `app_settings`

Purpose: generic application configuration store.

Status: **Scaffolded**.

## Relationship summary

```text
data_providers
   +-- provider_instruments -- instruments
   +-- market_observations -- instruments
   +-- sync_runs

instruments
   +-- technical_indicators
   +-- watchlist_items -- watchlists
   +-- alerts -- alert_events
   +-- instrument_opinions -- opinion_sources
   +-- instrument_opinion_consensus
   +-- market_scores
   +-- market_opinions
   +-- gpt_market_assessments -- gpt_market_runs
                              +-- gpt_market_evidence
   +-- opportunity and structural signal models

trading_strategies
   +-- trading_test_runs
          +-- trading_decision_evaluations
                 +-- trading_decision_trees
                 +-- trading_decision_nodes

trading_decision_trees
   +-- trading_decision_nodes
   +-- trading_decision_edges
```

## Historical onboarding rule

For a new instrument:

```text
Add instrument
-> create/verify live provider mapping
-> create/verify Tiingo historical mapping
-> Tiingo 5-year backfill
-> verify coverage and idempotency
-> ready for indicators/backtesting
```
