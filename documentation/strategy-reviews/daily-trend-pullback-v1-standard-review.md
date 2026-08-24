# Daily Trend Pullback v1 — Standard Strategy Review

**Task:** STRAT-004 — Execute Standard Strategy Review  
**Strategy:** `DAILY_TREND_PULLBACK` v1  
**Test run:** `DAILY_TREND_PULLBACK:v1:backtest:2022-06-01_2026-08-14:daily-trend-pullback-backtest-v1:baseline`  
**Decision tree:** `STANDARD_STRATEGY_REVIEW` v1  
**Outcome code:** `VALIDATE_ROBUSTNESS`  
**Outcome status:** `continue_testing`

## Purpose

Record the first real execution of the database-driven Standard Trading Strategy Review against the immutable STRAT-003 baseline backtest.

The review does not modify the strategy rules, backtest/holdout periods, persisted historical metrics, strategy status or live-execution flag. It evaluates the existing evidence exactly as stored.

## Persisted decision path

The trusted evaluator traversed the live `trading_decision_nodes` and `trading_decision_edges` rows rather than using a hard-coded final answer.

| Step | Gate | Persisted metric | Rule | Result | Next |
|---|---|---:|---|---|---|
| 1 | START | — | Begin | — | `MIN_TRADES` |
| 2 | Enough trades? | 249 | `trade_count >= 30` | PASS | `EXPECTANCY` |
| 3 | Positive expectancy? | USD 100.99840393194626/trade | `expectancy > 0` | PASS | `PROFIT_FACTOR` |
| 4 | Profit factor acceptable? | 1.3230995409489577 | `profit_factor >= 1.2` | PASS | `DRAWDOWN` |
| 5 | Drawdown controlled? | 16.290033842716177% | `max_drawdown_pct <= 20` | PASS | `OUT_OF_SAMPLE` |
| 6 | Out-of-sample result positive? | -8.26559237643118% | `out_of_sample_return_pct > 0` | FAIL | `VALIDATE_ROBUSTNESS` |
| 7 | Outcome | — | — | — | `VALIDATE_ROBUSTNESS / continue_testing` |

The negative out-of-sample return is therefore preserved as the decisive evidence. The review does not rerun the strategy with a different period or change the result to obtain a more favourable outcome.

## Interpretation

The strategy has enough completed trades, positive expectancy, an acceptable profit factor and drawdown below the initial review limit. It does **not** pass the holdout-robustness gate because the persisted one-year out-of-sample return is negative.

The correct Standard Strategy Review outcome is therefore:

- outcome code: `VALIDATE_ROBUSTNESS`;
- outcome status: `continue_testing`.

This is not a promotion and does not authorise live trading. The strategy remains in `testing` with live execution disabled.

## Persistence and provenance

The review is stored in `public.trading_decision_evaluations` and includes:

- owner identity inherited from the test run;
- test-run ID and tree ID;
- final outcome node ID;
- outcome code/status;
- the ordered decision path;
- each decision node's metric code/value, comparison operator, threshold, boolean result and selected edge;
- decision-tree code/version;
- immutable test-run key;
- immutable strategy snapshot SHA-256;
- evaluation timestamp.

The evaluator is `strategy_lab.evaluate_standard_strategy_review_v1(uuid)`. It is executable by `service_role` only and is idempotent: a retry of the same test-run/tree identity returns the existing evaluation rather than creating a duplicate.

## Evidence security

STRAT-004 hardens `public.trading_decision_evaluations` as system-generated evidence:

- `anon` has no table privileges;
- authenticated clients have owner-scoped `SELECT` only;
- authenticated clients cannot insert, update, delete or truncate review evidence;
- only the trusted service/database evaluator creates the Standard Strategy Review row.

Builder RLS verification confirmed the owner can read the evaluation and a second permanent user cannot.

## STRAT-004 boundary

STRAT-004 persists the decision path and outcome only. It does not implement the STRAT-005 frontend surfacing work and it does not create a new strategy version or a replacement backtest.
