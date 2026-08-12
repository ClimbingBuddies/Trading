# Trading Platform Functional Roadmap

This roadmap classifies the Discover Boulders Markets platform by **what is actually working in Supabase today**, what should be completed next, and what is future platform capability.

It is intentionally based on the live Supabase structure and current GitHub application rather than historical chat assumptions.

## Roadmap principles

1. **Supabase is the source of truth for platform capability.**
2. A table existing does not mean a feature is operational.
3. Complete partially connected pipelines before adding new product surface area.
4. Do not fabricate data to make dashboards appear complete.
5. Keep the public dashboard read-only unless a feature explicitly requires authenticated write access.
6. Resolve security/RLS deliberately as each feature becomes operational.

---

# Phase 1 — Working Now

Phase 1 represents capabilities that are already materially operational and can be relied on as the current platform foundation.

## 1. Market-data ingestion

**Status: Operational**

Current flow:

```text
pg_cron
   |
   v
full-twelve-data-load Edge Function
   |
   +--> Twelve Data quote API
   |
   +--> market_observations
   +--> sync_runs
```

Working components:

- Twelve Data provider configuration.
- 30 active instruments.
- Current asset mix:
  - 15 equities
  - 5 ETFs
  - 5 forex
  - 5 crypto
- Provider-to-instrument mappings.
- `full-twelve-data-load` Edge Function.
- `test-twelve-data-load` Edge Function for single-symbol testing.
- 15-minute pg_cron schedule.
- Rolling 60-minute load exclusion per instrument.
- US market-hours logic for equities and ETFs.
- Continuous eligibility for forex and crypto.
- Sync-run logging and error capture.
- Market observation history.

### Phase 1 outcome

The platform already has a functioning market-data foundation suitable for monitoring, history and downstream analysis.

---

## 2. Admin monitoring dashboard

**Status: Operational**

Current capability:

- loader health;
- latest load;
- last successful load;
- loads today;
- observations today;
- failed/partial run count;
- active-instrument count;
- observation-volume chart;
- freshness/coverage summary;
- recent sync-run history;
- load-run drill-through.

Primary Supabase dependencies:

- `sync_runs`
- `market_observations`
- `instruments`
- `data_providers`

---

## 3. Markets dashboard

**Status: Operational**

Current capability:

- active instrument universe;
- asset-class filters;
- instrument search;
- latest price;
- observation/load freshness;
- provider information;
- instrument drill-through;
- price-history chart;
- cross-link to latest assessment where available.

Primary Supabase dependencies:

- `instruments`
- `provider_instruments`
- `data_providers`
- `market_observations`

---

## 4. GPT assessment data model and current test dataset

**Status: Data model operational; automation not yet operational**

Working components:

- `gpt_market_runs`
- `gpt_market_assessments`
- `gpt_market_evidence`
- 30 current assessment rows.
- 30 current evidence rows.
- assessment fields for rating, confidence, score, summary, bull/bear case, technical, macro, valuation, catalysts and risks.
- Assessments dashboard.
- instrument assessment drill-through.
- Market ↔ Assessment cross-linking.

### Important limitation

The current assessment records are a successful **test dataset**. They do not prove that the daily scheduled assessment pipeline is complete.

---

## 5. Strategy decision framework

**Status: Framework operational; strategy execution data not yet populated**

Working components:

- `trading_decision_trees`
- `trading_decision_nodes`
- `trading_decision_edges`
- one active system template: `STANDARD_STRATEGY_REVIEW`

Current review gates:

1. trade count >= 30
2. expectancy > 0
3. profit factor >= 1.2
4. maximum drawdown <= 20%
5. out-of-sample return > 0

Possible outcomes:

- Continue testing
- Revise entry or exit rules
- Revise trade efficiency
- Reduce risk or pause
- Validate robustness
- Promote to next testing stage

The Strategies dashboard correctly presents this framework while strategy/test tables are empty.

---

# Phase 2 — Finish Next

Phase 2 should focus on completing the partially built operating loops before expanding into additional features.

## Priority 1 — Complete daily market-assessment automation

**Status: Highest priority**

### What already works

The scheduler creates one assessment request at 6:00 pm New York time:

```text
pg_cron
   |
   v
queue_daily_market_assessment()
   |
   +--> market_assessment_queue
   +--> market_assessment_schedule_log
```

Current queue rows are being created successfully.

### What is missing

There is no end-to-end consumer connected to those queue rows.

The existing function:

`process_market_assessment_queue()`

only changes today's rows from `pending` to `ready_for_analysis`.

It does **not**:

- claim a queue row;
- create a GPT run;
- execute analysis;
- write assessment/evidence rows;
- update ticker completion counts;
- finalise the GPT run;
- mark the queue row complete;
- retry failures.

### Current evidence of the incomplete hand-off

The database contains:

- 30 assessment rows;
- 30 evidence rows;
- one GPT run still marked `running`;
- `tickers_completed = 0`;
- `completed_at = null`;
- seven scheduled queue rows still `pending`.

This strongly indicates that assessment generation has been tested independently, while the scheduler → worker → finalisation chain has not been connected.

### Target Phase 2 flow

```text
6:00 pm New York
      |
      v
queue_daily_market_assessment()
      |
      v
pending queue row
      |
      v
assessment worker claims row
      |
      +--> queue = processing
      +--> create gpt_market_run
      |
      v
analyse active instrument universe
      |
      +--> gpt_market_assessments
      +--> gpt_market_evidence
      |
      v
finalise run
      |
      +--> tickers_completed
      +--> completed_at
      +--> succeeded / partial / failed
      |
      v
finalise queue row
```

### Definition of done

- one scheduled request per business day;
- idempotent queue claiming;
- clear `pending → processing → succeeded/partial/failed` lifecycle;
- GPT run created and finalised automatically;
- `tickers_completed` accurately updated;
- `completed_at` populated;
- evidence persisted;
- failed instruments recorded without losing successful results;
- queue row finalised;
- retry strategy documented;
- Admin/Assessments can surface pipeline health.

---

## Priority 2 — Resolve assessment security model

**Status: Required before production hardening**

RLS is currently disabled on:

- `market_assessment_schedule_log`
- `market_assessment_queue`
- `gpt_market_runs`
- `gpt_market_assessments`
- `gpt_market_evidence`

A deliberate product decision is needed:

### Option A — Public research dashboard

- public read-only assessment results;
- internal queue/run-control data protected;
- no anonymous writes.

### Option B — Authenticated research workspace

- assessments visible only after login;
- user-specific research features can be added later.

### Recommended direction

Keep published assessment outputs readable by the dashboard, but protect scheduler/queue internals and all writes.

Do not simply enable RLS without policies, because that would break the current Assessments UI.

---

## Priority 3 — Complete external opinion/research pipeline

**Status: Partial**

Existing structure:

- `opinion_sources`
- `opinion_reviews`
- `instrument_opinions`
- `instrument_opinion_consensus`

Current data proves the concept has been tested:

- 5 opinion sources;
- 1 completed opinion review;
- 2 opinion records;
- 1 consensus record.

Next work:

- define how opinion reviews are triggered;
- define approved source types;
- automate collection/normalisation;
- calculate/update consensus;
- decide whether external opinions feed GPT assessments directly or remain a separate evidence layer;
- add deliberate RLS policies when the feature becomes active.

---

## Priority 4 — Turn the strategy schema into an executable workflow

**Status: Partial/scaffolded**

Existing schema is ready for:

- strategy definitions;
- test runs;
- test metrics;
- decision-tree evaluation;
- decision outcomes.

But currently:

- `trading_strategies` = 0 rows;
- `trading_test_runs` = 0 rows;
- `trading_decision_evaluations` = 0 rows.

Next work:

1. create first real strategy definition;
2. define test-run ingestion format;
3. load real backtest/paper-test results;
4. implement evaluation of test metrics against the system decision tree;
5. persist the decision path and outcome;
6. update the Strategies dashboard from empty-state to live strategy/test results.

---

# Phase 3 — Future Platform Capability

Phase 3 should build on stable market-data, assessment and strategy pipelines rather than bypassing unfinished Phase 2 work.

## 1. Technical indicator engine

Existing scaffold:

- `technical_indicators`

Potential capability:

- moving averages;
- RSI;
- MACD;
- ATR;
- volatility measures;
- volume indicators;
- trend-state calculations.

These should be calculated server-side and versioned using `calculation_version`.

---

## 2. Market scoring model

Existing scaffold:

- `market_scores`

Available fields include:

- momentum score;
- trend score;
- volatility score;
- volume score;
- overall score.

Future use:

- ranking instruments;
- screening candidates;
- supporting assessments;
- feeding strategy selection rules.

---

## 3. Watchlists

Existing scaffold:

- `watchlists`
- `watchlist_items`

Potential capability:

- personal instrument groups;
- themed watchlists;
- ordering/notes;
- watchlist-specific dashboard views;
- strategy universes.

Because the model already includes `owner_user_id`, this should be implemented alongside authentication rather than opened anonymously.

---

## 4. Alerts

Existing scaffold:

- `alerts`
- `alert_events`

Potential capability:

- price thresholds;
- assessment/rating changes;
- freshness/data-load issues;
- strategy decision outcomes;
- technical indicator conditions;
- notification lifecycle.

---

## 5. Authenticated multi-user workspace

Several tables already contain `owner_user_id`, including strategy and watchlist structures.

Future capability could include:

- individual watchlists;
- private strategies;
- private test runs;
- user-specific decision trees;
- shared/team research later if required.

Authentication should be added only when a product feature genuinely needs user ownership.

---

## 6. Expanded market-data providers

The provider abstraction already supports multiple providers through:

- `data_providers`
- `provider_instruments`

Future capability:

- secondary/fallback provider;
- provider-specific asset coverage;
- cross-provider validation;
- provider latency/quality comparison.

---

## 7. Broader strategy laboratory

Future strategy capability could include:

- reusable strategy templates;
- parameter sets;
- strategy-to-instrument mappings;
- backtest import;
- paper-trading results;
- live test stages;
- parameter/version comparison;
- promotion/retirement workflow;
- richer decision trees.

Do not build performance dashboards before real test-run data exists.

---

# Recommended delivery order

The recommended sequence from the current state is:

```text
1. Keep market-data ingestion stable
        |
        v
2. Complete daily assessment automation
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

## Why this order

The platform already has a reliable market-data layer. The highest-value next step is to make the existing assessment schema genuinely automatic rather than building another disconnected feature.

Once assessment generation is dependable, the opinion/research layer can become an input to assessments, and real strategy test data can then use both market and assessment information.

---

# Working definition of platform maturity

A feature should only move into **Phase 1 — Working Now** when all of the following are true:

- database schema exists;
- required loader/worker exists;
- scheduled/manual trigger exists;
- lifecycle status is finalised correctly;
- errors are recorded;
- access/RLS model is deliberate;
- frontend can read the feature without privileged secrets;
- empty/error states are handled;
- documentation explains the flow.

This prevents partially built schema from being mistaken for completed platform functionality.
