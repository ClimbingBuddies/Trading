# Trading Platform Functional Roadmap

This roadmap classifies Discover Boulders Markets by what is working now, what should be finished next, and what remains future capability.

The roadmap is based on the live Supabase structure and current GitHub application.

## Roadmap principles

1. Supabase is the source of truth for persisted platform state.
2. A table existing does not mean the feature is operational.
3. Complete partially connected operating loops before expanding the UI.
4. Do not fabricate production data.
5. Keep public dashboard access read-only unless a feature explicitly needs authenticated writes.
6. Make scheduling ownership explicit so two schedulers cannot process the same workflow.

---

# Phase 1 — Working Now

## Market-data ingestion — Operational

Current foundation:

- Twelve Data provider integration.
- 30 active instruments:
  - 15 equities
  - 5 ETFs
  - 5 forex
  - 5 crypto
- provider/instrument mappings.
- `full-twelve-data-load` Edge Function.
- `test-twelve-data-load` single-symbol test function.
- 15-minute Supabase pg_cron schedule.
- US-market-hours rules for equities/ETFs.
- continuous forex/crypto eligibility.
- `market_observations` history.
- `sync_runs` operational monitoring.

## Admin dashboard — Operational

- loader health and freshness.
- loads/observations today.
- active instruments.
- failed/partial run counts.
- daily observation chart.
- sync history and drill-through.

## Markets dashboard — Operational

- active universe.
- asset-class filters and search.
- latest observations/prices.
- provider and freshness information.
- price-history drill-through.
- latest assessment cross-link where available.

## GPT assessment data model — Operational as a data model/test dataset

Working structures:

- `gpt_market_runs`
- `gpt_market_assessments`
- `gpt_market_evidence`
- 30 current test assessments.
- 30 current evidence rows.
- Assessments dashboard and detail pages.

The historical 30-row test dataset is not evidence that the previous daily scheduler was fully unattended.

## Strategy decision framework — Operational as a framework

The active `STANDARD_STRATEGY_REVIEW` system template currently evaluates:

1. trade count >= 30
2. expectancy > 0
3. profit factor >= 1.2
4. maximum drawdown <= 20%
5. out-of-sample return > 0

Possible outcomes include continue testing, revise, reduce risk/pause, validate robustness, and promote.

---

# Phase 2 — Finish Next

## Priority 1 — Complete daily market-assessment automation

**Status: In progress.**

### Architecture decision

The daily reasoning/assessment layer will run as a **ChatGPT Scheduled Task** with access to the connected Trading Supabase project.

Supabase continues to own market-data loading and persistence. ChatGPT owns the assessment schedule and research/analysis step.

The old Supabase pg_cron job `daily_market_assessment` has been unscheduled so there is only one assessment scheduler.

### Target flow

```text
ChatGPT Scheduled Task
      |
      v
check current New York date + market-data freshness
      |
      v
prepare_chatgpt_market_assessment()
      |
      +--> create/resume queue row
      +--> create/resume gpt_market_run
      |
      v
read active instruments + observations + available research context
      |
      v
ChatGPT assessment/research
      |
      +--> gpt_market_assessments
      +--> gpt_market_evidence
      |
      v
finalize_chatgpt_market_assessment()
      |
      +--> tickers_completed
      +--> completed_at
      +--> succeeded / partial / failed
      |
      v
notify user
```

### Completed foundations

- explicit queue lifecycle and attempt tracking.
- queue-to-run linking.
- idempotent prepare/resume helper.
- finalisation helper based on actual assessment rows.
- unique `(run_id, instrument_id)` constraint prevents duplicate assessment rows.
- historical queue backlog is isolated from the current-date task path.
- inactive OpenAI-API Edge Function retained only as a fallback/prototype.

### Definition of done

Priority 1 moves to Phase 1 when:

- one recurring ChatGPT task runs unattended;
- it can read/write the connected Supabase project;
- the current date/run is created or resumed safely;
- all active instruments are assessed;
- evidence is persisted;
- retrying does not duplicate results;
- run and queue statuses finalise correctly;
- the user receives the run summary;
- at least one complete scheduled production-style run is verified.

## Priority 2 — Resolve assessment security model

RLS is currently disabled on:

- `market_assessment_schedule_log`
- `market_assessment_queue`
- `gpt_market_runs`
- `gpt_market_assessments`
- `gpt_market_evidence`

Recommended direction:

- published assessment outputs may remain read-only to the dashboard;
- internal queue/run-control data should be protected;
- anonymous writes should not be allowed;
- enable RLS only with deliberate policies so the dashboard is not accidentally broken.

## Priority 3 — Complete external opinion/research pipeline

Existing partial structures:

- `opinion_sources`
- `opinion_reviews`
- `instrument_opinions`
- `instrument_opinion_consensus`

Next work:

- define approved sources and trigger mechanism;
- automate collection/normalisation;
- update consensus;
- decide how this evidence feeds daily assessments;
- add RLS when the feature becomes active.

## Priority 4 — Turn strategy schema into an executable workflow

Existing schema is ready for:

- strategy definitions;
- backtest/paper/live test runs;
- performance metrics;
- decision-tree evaluation;
- persisted outcomes.

Still empty:

- `trading_strategies`
- `trading_test_runs`
- `trading_decision_evaluations`

Next work:

1. create the first real strategy;
2. define test-run ingestion format;
3. load real test results;
4. evaluate results against the system decision tree;
5. persist decision path/outcome;
6. expose the real results in the Strategies dashboard.

---

# Phase 3 — Future Platform Capability

## Technical indicators

Use the existing `technical_indicators` scaffold for server-side, versioned measures such as moving averages, RSI, MACD, ATR, volatility, volume and trend state.

## Market scoring

Use `market_scores` for momentum, trend, volatility, volume and overall rankings once the indicator layer is reliable.

## Watchlists

Use `watchlists` and `watchlist_items` for authenticated personal or strategy-specific instrument groups.

## Alerts

Use `alerts` and `alert_events` for price, assessment, data-freshness, strategy and indicator conditions.

## Authenticated multi-user workspace

Owner-aware tables already support a future model for private strategies, test runs, watchlists and user-specific decision trees.

## Additional market-data providers

The provider abstraction through `data_providers` and `provider_instruments` can support fallback providers, broader asset coverage and cross-provider validation.

## Broader strategy laboratory

Future strategy capability can include templates, parameters, instrument universes, backtests, paper/live stages, version comparisons, promotion/retirement and richer decision trees.

Do not build performance dashboards before real strategy test data exists.

---

# Recommended delivery order

```text
1. Keep Twelve Data ingestion stable
        |
        v
2. Prove ChatGPT Scheduled Task assessment end-to-end
        |
        v
3. Harden assessment RLS/security
        |
        v
4. Complete external opinion/research ingestion
        |
        v
5. Create first real strategy + test run
        |
        v
6. Implement automatic strategy decision evaluation
        |
        v
7. Add technical indicators and market scoring
        |
        v
8. Add watchlists / alerts / authenticated user features
```

# Working definition of platform maturity

A feature should only move into **Phase 1 — Working Now** when:

- schema exists;
- the worker/process exists;
- scheduling/manual triggering is explicit;
- lifecycle status finalises correctly;
- errors are recorded;
- access/RLS is deliberate;
- frontend access does not require privileged secrets;
- retries and empty/error states are handled;
- documentation explains the complete flow.
