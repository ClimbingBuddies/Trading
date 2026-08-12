# Strategy Framework

## Purpose

The strategy layer is designed to move a trading idea through definition, testing, review and promotion using recorded test metrics and a database-driven decision tree.

The schema and decision framework are present, but no user strategy or test-run records have been created yet.

## Strategy lifecycle

```text
Define strategy
    |
    v
Backtest / paper test / live test
    |
    v
Record trading_test_runs metrics
    |
    v
Evaluate against decision tree
    |
    v
Promote / continue testing / revise / pause / reject
```

## `trading_strategies`

Purpose: user-owned strategy definitions.

Important fields:

- `owner_user_id`
- `strategy_code`
- `strategy_name`
- `description`
- `status`

Allowed strategy statuses:

- `draft`
- `testing`
- `approved`
- `paused`
- `retired`

Ownership is tied to `auth.users` through `owner_user_id`.

Current records: 0.

## `trading_test_runs`

Purpose: stores measurable results from a strategy test.

Allowed test types:

- `backtest`
- `paper`
- `live`

Important result fields:

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
- `source_metadata`
- `completed_at`

Current records: 0.

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

Rule:

```text
trade_count >= 30
```

If false: `MORE_DATA` / continue testing.

### Gate 2 — Positive expectancy?

Metric: `expectancy`

Rule:

```text
expectancy > 0
```

If false: `REVISE_EDGE` / revise entry or exit rules.

### Gate 3 — Profit factor acceptable?

Metric: `profit_factor`

Rule:

```text
profit_factor >= 1.2
```

If false: `REVISE_EFFICIENCY` / revise trade efficiency.

### Gate 4 — Drawdown controlled?

Metric: `max_drawdown_pct`

Rule:

```text
max_drawdown_pct <= 20
```

If false: `REDUCE_RISK` / pause or reduce risk.

### Gate 5 — Out-of-sample result positive?

Metric: `out_of_sample_return_pct`

Rule:

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

Current records: 0.

## RLS and ownership

Strategies, test runs and evaluations are designed as authenticated, owner-specific data.

Authenticated users can only access rows where `owner_user_id = auth.uid()`.

The system decision-tree template can be read by authenticated users, and the public dashboard has read-only access to system-template trees, nodes and edges.

## Frontend status

The Strategies dashboard currently:

- shows the system decision framework;
- reports zero real strategies and zero real test runs;
- retains intentional empty-state messaging.

Routes already exist for future populated records:

- `/strategies`
- `/strategies/[id]`
- `/strategies/[id]/tests/[runId]`

## Recommended next implementation step

The next meaningful strategy milestone is not additional UI. It is creating one real strategy and one real backtest record, then implementing evaluation logic that traverses the decision tree and writes `trading_decision_evaluations`.
