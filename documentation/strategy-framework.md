# Strategy Framework

## Purpose

The strategy layer moves a trading idea through definition, testing, review and promotion using persisted strategy rules, recorded test metrics and a database-driven decision tree.

The first real strategy is defined under STRAT-001. STRAT-002 now defines the test-run ingestion, immutable provenance and metric contract; loading the first real result remains STRAT-003.

## Strategy lifecycle

```text
Define versioned strategy
    |
    v
Capture immutable strategy snapshot/hash
    |
    v
Backtest / paper test / live test
    |
    v
Record versioned trading_test_runs evidence
    |
    v
Evaluate against decision tree
    |
    v
Promote / continue testing / revise / pause / reject
```

## `trading_strategies`

Purpose: user-owned, versioned strategy definitions.

Core identity fields:

- `owner_user_id`
- `strategy_code`
- `strategy_name`
- `description`
- `status`
- `strategy_version`
- `methodology_version`

Structured strategy-definition fields added for STRAT-001:

- `universe_definition`
- `entry_rules`
- `exit_rules`
- `risk_rules`
- `execution_rules`
- `data_requirements`
- `live_execution_enabled`

The uniqueness boundary is `(owner_user_id, strategy_code, strategy_version)`, allowing later versions without overwriting the tested definition of an earlier version.

Allowed strategy statuses:

- `draft`
- `testing`
- `approved`
- `paused`
- `retired`

Ownership is tied to `auth.users` through `owner_user_id` and remains owner-scoped by RLS.

## First real strategy — STRAT-001

The first persisted strategy is:

- code: `DAILY_TREND_PULLBACK`
- name: `Daily Trend Pullback — US Equities & ETFs`
- version: `1`
- methodology: `strategy-definition-v1`
- status: `testing`
- live execution: disabled

Canonical methodology: `documentation/specifications/daily-trend-pullback-strategy.md`.

The strategy uses a fixed 24 August 2026 snapshot of 20 active US equities/ETFs with sufficient daily history. It is long-only and uses point-in-time SMA20/SMA50/SMA200/RSI14 trend-pullback rules, an 8% protective stop, an SMA50 trend exit, a 60-session time exit, 0.75% initial portfolio risk per trade, a 10% notional cap, four-position maximum and 40% gross-long cap.

The strategy exists to be tested. No profitability claim is made by STRAT-001 and no automatic/live trade execution is authorised.

## `trading_test_runs` — STRAT-002 contract

Purpose: stores reproducible evidence from a strategy test.

Canonical specification: `documentation/specifications/strategy-test-run-ingestion.md`.

Allowed test types remain:

- `backtest`
- `paper`
- `live`

The table now separates strategy identity, test lifecycle, source/execution provenance and result metrics.

### Test-run identity and lifecycle

Key fields include:

- `run_key` — required owner-scoped idempotency key;
- `source_run_id` — optional engine/paper/broker run identity;
- `ingestion_version = strategy-test-ingestion-v1`;
- `run_status` — `draft`, `running`, `succeeded`, `failed`, `cancelled`;
- `started_at`;
- `completed_at`;
- `failure_message`.

A retry of the same logical test reuses the same `run_key` instead of creating duplicate evidence.

### Immutable strategy provenance

At test-run insert time, `capture_trading_test_run_provenance_v1` snapshots the exact strategy definition into:

- `strategy_code`;
- `strategy_version`;
- `strategy_methodology_version`;
- `strategy_snapshot`;
- `strategy_snapshot_hash`;
- `strategy_hash_method = sha256-jsonb-v1`;
- `strategy_snapshot_captured_at`.

These fields cannot be changed afterward. Historical results therefore remain tied to the exact rules tested even if the current strategy row is edited later.

### Data and execution provenance

The test-run contract also stores:

- `engine_version`;
- `input_data_cutoff`;
- in-sample and out-of-sample date ranges;
- `base_currency`;
- `initial_equity` and `ending_equity`;
- structured `data_provenance`;
- structured `execution_provenance`;
- `metric_definition_version = strategy-test-metrics-v1`.

Backtest, paper and live runs have distinct provenance requirements. Live-test schema support does not enable or authorise live trading.

### Result metrics

Core result fields remain:

- `period_start`
- `period_end`
- `instrument_count`
- `trade_count`
- `net_profit`
- `return_pct`
- `win_rate_pct`
- `profit_factor`
- `expectancy`
- `max_drawdown_pct`
- `sharpe_ratio`
- `out_of_sample_return_pct`
- `notes`
- `source_metadata`

`strategy-test-metrics-v1` defines these metrics precisely, including cost treatment, completed-trade counting, drawdown, Sharpe and out-of-sample semantics.

STRAT-002 creates no real `trading_test_runs` rows. STRAT-003 is responsible for producing and loading the first real backtest evidence under this contract.

## Standard decision tree

The database contains one active system template:

- code: `STANDARD_STRATEGY_REVIEW`
- name: `Standard Trading Strategy Review`
- version: 1
- system template: true
- active: true

The template is database-driven through:

- `trading_decision_trees`
- `trading_decision_nodes`
- `trading_decision_edges`

## Decision gates

### Gate 1 — Enough trades?

Metric: `trade_count`

```text
trade_count >= 30
```

If false: `MORE_DATA` / continue testing.

### Gate 2 — Positive expectancy?

Metric: `expectancy`

```text
expectancy > 0
```

If false: `REVISE_EDGE` / revise entry or exit rules.

### Gate 3 — Profit factor acceptable?

Metric: `profit_factor`

```text
profit_factor >= 1.2
```

If false: `REVISE_EFFICIENCY` / revise trade efficiency.

### Gate 4 — Drawdown controlled?

Metric: `max_drawdown_pct`

```text
max_drawdown_pct <= 20
```

If false: `REDUCE_RISK` / pause or reduce risk.

### Gate 5 — Out-of-sample result positive?

Metric: `out_of_sample_return_pct`

```text
out_of_sample_return_pct > 0
```

If false: `VALIDATE_ROBUSTNESS` / continue testing.

If all five gates pass: `PROMOTE` / promote to the next testing stage.

## Decision flow

```text
START
  |
  v
MIN_TRADES --No--> MORE_DATA
  |
 Yes
  v
EXPECTANCY --No--> REVISE_EDGE
  |
 Yes
  v
PROFIT_FACTOR --No--> REVISE_EFFICIENCY
  |
 Yes
  v
DRAWDOWN --No--> REDUCE_RISK
  |
 Yes
  v
OUT_OF_SAMPLE --No--> VALIDATE_ROBUSTNESS
  |
 Yes
  v
PROMOTE
```

## `trading_decision_evaluations`

Purpose: stores the result of applying a decision tree to a test run.

Important fields:

- `owner_user_id`
- `test_run_id`
- `tree_id`
- `final_node_id`
- `outcome_code`
- `outcome_status`
- `decision_path`
- `evaluated_at`

Allowed outcome statuses:

- `promote`
- `continue_testing`
- `revise`
- `pause`
- `reject`

No decision evaluation exists yet because STRAT-003 has not loaded a real test run. STRAT-004 owns execution of the Standard Strategy Review after test evidence exists.

## RLS and ownership

Strategies, test runs and evaluations are authenticated, owner-specific data.

Authenticated users can only access rows where `owner_user_id = auth.uid()`. The test-run provenance trigger derives `owner_user_id` from the selected strategy, and the existing RLS insert policy independently prevents cross-owner test attachment.

The system decision-tree template can be read by authenticated users, and the public dashboard has read-only access to system-template trees, nodes and edges.

## Frontend status

Routes already exist for strategy and test records:

- `/strategies`
- `/strategies/[id]`
- `/strategies/[id]/tests/[runId]`

STRAT-002 does not redesign strategy UI. STRAT-005 remains the project-plan stage for surfacing real strategy results deliberately.

## Next implementation step

STRAT-003 must produce and persist the first real `DAILY_TREND_PULLBACK` v1 backtest under `strategy-test-ingestion-v1` and `strategy-test-metrics-v1`, including the immutable strategy hash, declared data cutoff, in/out-of-sample periods, cost assumptions and complete result provenance. It must not bypass the STRAT-002 evidence contract or fabricate missing metrics.
