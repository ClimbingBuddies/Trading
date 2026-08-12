# Supabase Data Model

Supabase project reference: `glvbqcplgjdfgjyknzsa`

This document groups the public schema by business purpose and records the implementation state observed on 12 August 2026.

## 1. Provider and instrument reference data

### `data_providers`

Purpose: external market-data provider registry.

Key fields:

- `id`
- `provider_code`
- `provider_name`
- `base_url`
- `is_active`

Current data: one active provider, `twelvedata` / Twelve Data.

Relationships:

- one provider to many `provider_instruments`
- one provider to many `market_observations`
- one provider to many `sync_runs`

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

Current data:

- 30 active instruments
- 15 equities
- 5 ETFs
- 5 forex pairs
- 5 crypto pairs

This table is the central reference table for most market and research features.

Status: **Operational**.

### `provider_instruments`

Purpose: maps an internal instrument to the provider-specific symbol used by Twelve Data or future providers.

Key fields:

- `provider_id`
- `instrument_id`
- `provider_symbol`
- `metadata`
- `is_active`

Current data: 30 mappings.

Status: **Operational**.

## 2. Market data and loader monitoring

### `market_observations`

Purpose: persistent market observation history.

Key fields:

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

The current loader writes quote observations with `interval_code = 'quote'`.

The table contains the raw provider response in `raw_payload`, which is useful for audit and troubleshooting.

Status: **Operational**.

### `sync_runs`

Purpose: execution audit for market-data loads.

Key fields:

- `provider_id`
- `started_at`
- `finished_at`
- `requested_count`
- `received_count`
- `inserted_count`
- `status`
- `error_message`
- `metadata`

Current metadata from `full-twelve-data-load` includes:

- `function`
- `batch_size`
- `market_hours_aware`
- `eligible_count`
- `skipped_out_of_session`
- `evaluated_at`

Status: **Operational**.

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

Current data: no rows.

Status: **Scaffolded**.

### `market_scores`

Purpose: daily momentum/trend/volatility/volume scoring by instrument.

Current data: no rows.

Status: **Scaffolded**.

### `market_opinions`

Purpose: older/simple instrument-level opinion table containing rating, confidence, score and key factors.

Current data: no rows.

This appears to overlap conceptually with the newer opinion and GPT-assessment models and should be reviewed before further development.

Status: **Scaffolded / possible legacy model**.

## 4. Watchlists and alerts

### `watchlists`

Purpose: user-owned lists of instruments.

Current data: one row.

Owner relationship: `owner_user_id -> auth.users.id`.

Status: **Partial**.

### `watchlist_items`

Purpose: instruments assigned to a watchlist, including sort order and notes.

Current data: one row.

Status: **Partial**.

### `alerts`

Purpose: user-owned alert definitions against an instrument or watchlist.

Current data: no rows.

Status: **Scaffolded**.

### `alert_events`

Purpose: individual alert trigger history.

Current data: no rows.

Status: **Scaffolded**.

## 5. External opinion and research model

### `opinion_sources`

Purpose: catalogues approved sources such as analyst consensus, financial news, official company information, regulatory sources, market commentary and research.

Current data: five sources.

Status: **Partial**.

### `opinion_reviews`

Purpose: records an opinion/research collection run.

Current data: one succeeded review.

The current review checked one instrument, inserted two opinions and recorded two material changes.

Status: **Partial / tested**.

### `instrument_opinions`

Purpose: detailed source-specific opinions attached to instruments.

Key concepts include:

- opinion type
- stance
- confidence
- rating / target price
- headline / summary / rationale
- source URL and publish time
- materiality
- content hash

Current data: two rows.

Status: **Partial / tested**.

### `instrument_opinion_consensus`

Purpose: aggregate opinion state for an instrument and review.

Current data: one row.

Status: **Partial / tested**.

## 6. GPT market assessments

### `gpt_market_runs`

Purpose: run-level metadata for a GPT assessment pass.

Key fields:

- `run_id`
- `started_at`
- `completed_at`
- `analysis_cutoff_time`
- `status`
- `model_name`
- `prompt_version`
- `analysis_mode`
- `tickers_requested`
- `tickers_completed`
- `notes`

Current state: one test run exists. It requested 30 tickers but remains marked `running`, with `tickers_completed = 0`, even though 30 assessment records exist.

Status: **Partial; data-quality issue exists**.

### `gpt_market_assessments`

Purpose: instrument-level GPT market assessment.

Key fields:

- `run_id`
- `instrument_id`
- `assessment_date`
- `rating`
- `confidence`
- `score`
- `summary`
- `bull_case`
- `bear_case`
- `technical_view`
- `macro_view`
- `valuation_view`
- `key_catalysts`
- `key_risks`
- `evidence_summary`
- `model_version`

Current data: 30 rows from the current test run.

Status: **Operational for display; generation pipeline not yet fully operational**.

### `gpt_market_evidence`

Purpose: evidence records supporting a GPT assessment.

Key fields:

- `assessment_id`
- `evidence_type`
- `source_name`
- `source_url`
- `evidence_text`
- `relevance_score`
- `confidence`

Current data: 30 rows.

Status: **Operational for current assessment records**.

## 7. Scheduled assessment queue

### `market_assessment_queue`

Purpose: daily work queue for the assessment process.

Current data: seven pending requests, one for each scheduled weekday from 3 August through 11 August 2026.

No current rows have `processed_at` populated.

Status: **Partial; queue is accumulating without a consumer**.

### `market_assessment_schedule_log`

Purpose: scheduler audit trail.

Current data: seven `triggered` records corresponding to the queued assessment requests.

Status: **Operational as scheduler logging, but downstream process incomplete**.

## 8. Trading strategies and test results

### `trading_strategies`

Purpose: user-owned strategy definitions.

Status values:

- `draft`
- `testing`
- `approved`
- `paused`
- `retired`

Current data: no rows.

Status: **Scaffolded**.

### `trading_test_runs`

Purpose: backtest, paper-trading or live test results for a strategy.

Important metrics include:

- trade count
- net profit
- return percentage
- win rate
- profit factor
- expectancy
- max drawdown
- Sharpe ratio
- out-of-sample return

Current data: no rows.

Status: **Scaffolded**.

## 9. Strategy decision framework

### `trading_decision_trees`

Purpose: reusable strategy-review workflow definitions.

Current data: one active system template, `STANDARD_STRATEGY_REVIEW`.

Status: **Operational template**.

### `trading_decision_nodes`

Purpose: start, decision and outcome nodes within a decision tree.

Current data: 12 nodes.

Status: **Operational template**.

### `trading_decision_edges`

Purpose: true/false or workflow transitions between decision nodes.

Current data: 11 edges.

Status: **Operational template**.

### `trading_decision_evaluations`

Purpose: stores the decision path and final outcome for a test run evaluated against a decision tree.

Current data: no rows.

Status: **Scaffolded**.

## 10. Application settings

### `app_settings`

Purpose: generic application configuration store.

Current data: no rows.

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

trading_strategies
   +-- trading_test_runs
          +-- trading_decision_evaluations
                 +-- trading_decision_trees
                 +-- trading_decision_nodes

trading_decision_trees
   +-- trading_decision_nodes
   +-- trading_decision_edges
```
