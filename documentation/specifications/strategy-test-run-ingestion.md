# Strategy Test-Run Ingestion Specification

**Task:** STRAT-002 — Define test-run ingestion format  
**Specification version:** 1.0  
**Persistence version:** `strategy-test-ingestion-v1`  
**Metric definition version:** `strategy-test-metrics-v1`  
**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

Define one reproducible persistence contract for strategy **backtest**, **paper** and **live** test evidence before the first real result is loaded.

A `trading_test_runs` row is an evidence record. It must identify exactly which strategy definition was tested, where its data/fills came from, which calculation conventions produced its metrics, and whether the run reached a terminal state.

STRAT-002 defines the format only. It does **not** load a real backtest, claim profitability, perform a strategy review, enable live trading or change the `DAILY_TREND_PULLBACK` strategy rules.

## 1. Test types

`test_type` remains one of:

- `backtest` — simulated historical signals/orders/fills against historical data;
- `paper` — forward test against current data with simulated/non-capital fills;
- `live` — observed real-capital execution evidence from an explicitly authorised live process.

The presence of `test_type = 'live'` is only a data format. It does not authorise live execution. Live execution requires its own explicit platform and human approval gates.

## 2. Run identity and idempotency

Every logical test run has a required `run_key`.

`run_key` is owner-scoped and unique through:

```text
(owner_user_id, run_key)
```

A retry or resumed ingestion of the same logical test must reuse the same `run_key`; it must not create a second evidence row.

Recommended structure:

```text
<strategy_code>:v<strategy_version>:<test_type>:<logical-period-or-session>:<engine-version>:<variant>
```

Example shape only:

```text
DAILY_TREND_PULLBACK:v1:backtest:2021-08-16_2026-08-14:backtest-engine-v1:baseline
```

`source_run_id` may store an external engine, paper-account or broker run identifier when one exists. It must never contain credentials, access tokens or secret account data.

## 3. Lifecycle

`run_status` is one of:

- `draft` — row created/prepared but execution evidence is not complete;
- `running` — test is actively being produced or ingested;
- `succeeded` — complete valid result persisted;
- `failed` — test/ingestion failed and the failure is recorded;
- `cancelled` — deliberately stopped without a valid result.

Terminal states (`succeeded`, `failed`, `cancelled`) require `completed_at`.

`failed` also requires a non-empty `failure_message`.

A `draft` or `running` row must not have `completed_at`.

## 4. Immutable strategy provenance

A test result must remain interpretable even if the current `trading_strategies` row is edited later.

On insertion, the database trigger `capture_trading_test_run_provenance_v1` copies the strategy definition into immutable test-run provenance fields:

- `strategy_code`;
- `strategy_version`;
- `strategy_methodology_version`;
- `strategy_snapshot`;
- `strategy_snapshot_hash`;
- `strategy_hash_method = 'sha256-jsonb-v1'`;
- `strategy_snapshot_captured_at`.

The snapshot contains the exact persisted definition used by the test:

- strategy identity/version;
- universe definition;
- entry rules;
- exit rules;
- risk rules;
- execution rules;
- data requirements;
- live-execution flag.

`strategy_snapshot_hash` is SHA-256 of PostgreSQL JSONB text representation of that snapshot.

After insertion, the strategy ID, version identity, snapshot and hash are immutable on the test-run row. A different strategy definition must be tested as a different logical run and, where rules changed, normally as a new `strategy_version`.

## 5. Core test-run fields

### Identity and provenance

Required/controlled fields:

- `owner_user_id` — strategy owner; captured/enforced through the existing owner model;
- `strategy_id` — strategy being tested;
- `run_key` — stable idempotency identity;
- `run_name` — human-readable run label;
- `test_type` — backtest, paper or live;
- `ingestion_version` — `strategy-test-ingestion-v1`;
- immutable strategy provenance fields from Section 4;
- `metric_definition_version` — `strategy-test-metrics-v1`;
- `engine_version` — code/engine version that generated the result when applicable;
- `source_run_id` — optional external run identity;
- `input_data_cutoff` — latest source timestamp the test was permitted to see;
- `data_provenance` — structured source/data lineage;
- `execution_provenance` — structured calculation/order/fill lineage.

### Period fields

- `period_start`, `period_end` — overall period represented by the result;
- `in_sample_period_start`, `in_sample_period_end` — development/in-sample segment when applicable;
- `out_of_sample_period_start`, `out_of_sample_period_end` — hold-out segment when applicable.

Period starts must not be after their corresponding period ends.

### Capital/accounting fields

- `base_currency` — reporting currency, default `USD`;
- `initial_equity` — starting portfolio equity for return/drawdown calculations;
- `ending_equity` — ending portfolio equity after costs.

### Existing result fields

- `instrument_count`;
- `trade_count`;
- `net_profit`;
- `return_pct`;
- `win_rate_pct`;
- `profit_factor`;
- `expectancy`;
- `max_drawdown_pct`;
- `sharpe_ratio`;
- `out_of_sample_return_pct`;
- `notes`;
- `source_metadata`;
- `started_at`;
- `completed_at`;
- `failure_message`.

`source_metadata` remains available for non-canonical supplementary details. Canonical provenance belongs in the explicit provenance/version fields.

## 6. Backtest provenance

For `test_type = 'backtest'`, `data_provenance` should record at minimum:

- source table/dataset identity;
- provider/source identity where known;
- interval/granularity;
- data query or extraction version;
- effective source date range;
- `input_data_cutoff`;
- instrument/universe snapshot identity;
- source row count processed;
- missing-data handling;
- price/corporate-action adjustment convention;
- known survivorship/look-ahead limitations;
- any data checksum/query hash available from the backtest engine.

For `DAILY_TREND_PULLBACK` v1 specifically, the fixed-current-universe survivorship limitation recorded by STRAT-001 must be carried into backtest provenance.

`execution_provenance` should record at minimum:

- backtest engine/code version;
- implementation commit or build identity when available;
- signal evaluation timing;
- order/fill model;
- fee assumption;
- slippage assumption;
- fractional-share convention;
- stop-gap handling;
- portfolio allocation/ranking implementation version;
- deterministic random seed if any stochastic component is ever introduced.

A backtest must never use observations after `input_data_cutoff` to form an earlier signal.

## 7. Paper-test provenance

For `test_type = 'paper'`, persist enough evidence to distinguish a real forward paper test from a historical backtest.

`data_provenance` should include:

- live/current market-data source;
- observation timestamps used to generate signals;
- interval/granularity;
- delayed/realtime status when known;
- source data cutoff for each decision or a run-level maximum cutoff;
- missing-data/freshness handling.

`execution_provenance` should include:

- paper simulator/venue identity;
- engine version;
- order timestamps;
- simulated fill source/model;
- fee/slippage convention;
- redacted paper-account identifier where useful;
- order/fill export or ledger identity if available.

No real-money implication may be inferred from a paper run.

## 8. Live-test provenance

For `test_type = 'live'`, provenance must be stricter, while still storing no secrets.

`data_provenance` should include:

- signal market-data source and timestamps;
- data delay/realtime classification;
- data cutoff used for each decision or run-level maximum;
- source quality/freshness exceptions.

`execution_provenance` should include:

- broker/venue name;
- redacted account identity only;
- strategy/execution engine version;
- explicit live-authorisation reference;
- order IDs and fill IDs where safe to persist;
- order/fill timestamps;
- fees/commissions actually charged where available;
- any slippage calculation convention;
- reconciliation source/export identity.

Never persist API keys, passwords, session tokens, broker secrets or full sensitive account credentials in either provenance JSON object.

A future live test must be rejected operationally if no explicit live-authorisation evidence exists, even though the schema supports the `live` test type.

## 9. Metric definitions — `strategy-test-metrics-v1`

All stored metrics must be calculated after the execution-cost model applicable to the run unless explicitly identified otherwise.

### `instrument_count`

Count of distinct universe instruments actually processed by the test engine, not merely instruments that generated a trade.

### `trade_count`

Count of completed round-trip positions used in closed-trade statistics. Open positions at the reporting cutoff are not counted as completed trades.

### `net_profit`

```text
ending_equity - initial_equity
```

in `base_currency`, after fees/commissions and modeled/actual slippage.

### `return_pct`

```text
(net_profit / initial_equity) * 100
```

when `initial_equity > 0`.

### `win_rate_pct`

```text
(winning_completed_trades / trade_count) * 100
```

where a winning trade has net closed-trade P&L > 0 after allocated execution costs.

### `profit_factor`

```text
gross_profit / abs(gross_loss)
```

using completed trades after allocated execution costs. If there are no losing trades, the producer must document the convention in provenance/notes rather than inventing an arbitrary capped value.

### `expectancy`

```text
sum(net_closed_trade_pnl) / trade_count
```

reported in `base_currency` per completed trade. The current Standard Strategy Review only tests whether this value is greater than zero.

### `max_drawdown_pct`

Maximum peak-to-trough percentage decline in the portfolio equity curve over the test period:

```text
max((prior_peak_equity - later_equity) / prior_peak_equity * 100)
```

The equity-curve sampling frequency used must be recorded in `execution_provenance` (daily close for the first daily-bar backtest unless a more granular engine is explicitly used).

### `sharpe_ratio`

Annualised Sharpe ratio from periodic portfolio returns using the run's declared return frequency and risk-free-rate convention.

For the first daily-bar backtest, use daily portfolio returns, annualisation factor `sqrt(252)`, and risk-free rate `0` unless STRAT-003 explicitly versions and documents another convention. If return standard deviation is zero or insufficient observations exist, store `NULL` and record why.

### `out_of_sample_return_pct`

Return percentage calculated only over the declared out-of-sample period using the same cost/accounting conventions as `return_pct`.

A backtest intended for the Standard Strategy Review must declare the out-of-sample period explicitly. A missing out-of-sample result must remain `NULL`; it must not be converted to zero.

## 10. Result validation

A run must not be represented as `succeeded` unless the producer has enough primary evidence to support its declared metrics and provenance.

For a successful backtest intended for review, STRAT-003 should normally persist:

- strategy snapshot/hash;
- run key and engine version;
- source period and data cutoff;
- in-sample and out-of-sample periods;
- initial/ending equity and base currency;
- instrument/trade counts;
- net profit and return;
- win rate;
- profit factor;
- expectancy;
- maximum drawdown;
- Sharpe ratio when calculable;
- out-of-sample return;
- data and execution provenance;
- terminal `succeeded` status and `completed_at`.

If the run cannot be completed reliably, persist `failed` with `failure_message` rather than fabricating partial performance as a successful run.

## 11. Retry and correction rules

- Same logical run/retry: reuse `run_key`.
- Do not create a second row merely because ingestion is retried.
- Strategy snapshot/hash never changes after insertion.
- If strategy rules changed, use a new strategy version and a new test run.
- If a terminal result is later found invalid, retain enough history to explain the correction; do not silently reinterpret it under a changed strategy definition.
- STRAT-003 is responsible for the concrete upsert/finalisation path for the first real result.

## 12. Ownership and access

Existing owner RLS remains authoritative:

- an authenticated owner may access their own test runs;
- another authenticated user may not attach a run to or read another owner's strategy evidence;
- browser/public access does not expose private strategy/test data merely because the schema exists.

The provenance trigger copies `owner_user_id` from the selected strategy, and the existing insert policy independently enforces owner identity.

## 13. STRAT-002 implementation boundary

STRAT-002 changes the persistence/format contract only.

It adds:

- explicit ingestion and metric versions;
- lifecycle state;
- required owner-scoped idempotency key;
- immutable strategy snapshot/hash;
- source engine/run identity;
- data cutoff and in/out-of-sample periods;
- capital/accounting fields;
- structured data and execution provenance;
- lifecycle/provenance validation constraints.

It does **not** insert a real `trading_test_runs` row. That remains STRAT-003.

## 14. Auditor acceptance matrix

The STRAT-002 Auditor should independently verify:

1. `trading_test_runs` still supports exactly `backtest`, `paper`, `live` test types.
2. The new provenance/version/lifecycle fields exist in live Supabase.
3. `run_key` is required and owner-scoped unique.
4. A draft test insert automatically captures the exact current strategy snapshot and a 64-character SHA-256 hash.
5. Captured strategy provenance cannot be changed afterward.
6. A terminal status cannot exist without `completed_at`; failed runs require an error message.
7. Owner RLS still permits the owner path and denies cross-owner attachment.
8. No real test-result row was created by STRAT-002.
9. This specification defines backtest/paper/live provenance and the metric semantics used by the Standard Strategy Review.
10. STRAT-003 loaded the first real test run; STRAT-004 persisted its review and STRAT-005 deployed the owner-scoped result.
