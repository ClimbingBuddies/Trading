# Strategy Framework

**Last reconciled:** 25 August 2026

The strategy laboratory persists private strategy definitions, immutable test evidence and reproducible review decisions. It does not execute live trades.

## Data model

- `trading_strategies` — owner, identity, version, rule contract, status and live-enabled state.
- `trading_test_runs` — backtest/paper/live type, engine and dataset provenance, immutable metric definitions and results.
- `trading_decision_trees` — standard or owner-specific review template.
- `trading_decision_nodes` and `trading_decision_edges` — ordered gates and outcomes.
- `trading_decision_evaluations` — immutable input snapshot, traversed path and persisted decision.

Owner rows are protected by Supabase Auth and RLS. Normal clients cannot forge test or evaluation evidence.

## First implemented strategy

The first real strategy is Daily Trend Pullback v1. Its canonical documents are:

- [Strategy contract](specifications/daily-trend-pullback-strategy.md)
- [Backtest specification](specifications/daily-trend-pullback-backtest-v1.md)
- [Test-run ingestion contract](specifications/strategy-test-run-ingestion.md)
- [Baseline result](backtests/daily-trend-pullback-v1-baseline-result.md)
- [Standard review](strategy-reviews/daily-trend-pullback-v1-standard-review.md)

The persisted baseline contains 249 completed trades, 28.2199% total return, 1.3231 profit factor, 16.2900% maximum drawdown and -8.2656% out-of-sample return. Four positions remain open at the final cutoff and are marked to the final adjusted close rather than counted as completed trades.

## Standard decision path

```text
START
  -> MIN_TRADES
  -> EXPECTANCY
  -> PROFIT_FACTOR
  -> DRAWDOWN
  -> OUT_OF_SAMPLE
  -> PROMOTE or VALIDATE_ROBUSTNESS
```

The current run passes the trade-count, expectancy, profit-factor and drawdown gates. It fails the positive out-of-sample-return gate, so the persisted outcome is:

- outcome: `VALIDATE_ROBUSTNESS`
- action: `continue_testing`
- strategy status: `testing`
- live execution: disabled

The negative holdout is preserved. It must not be replaced by a favourable rerun or hidden by the positive in-sample/total result.

## Frontend

- `/strategies` shows the private strategy workspace and persisted outcome.
- `/strategies/[id]` shows the versioned strategy definition.
- `/strategies/[id]/tests/[runId]` shows immutable provenance, metrics and the review path.

Visible figures are presentation-rounding of persisted Supabase values. The frontend performs no privileged strategy write.

## Next decision

No next strategy task is authorised by this document. Further robustness or paper-trading work requires a new project-plan item and an independent audit gate.
