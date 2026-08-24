# STRAT-003 — Load first real test run

## Review — 24 August 2026, 17:07 AWST

**Project-plan status at review start:** `IN REVIEW`  
**Decision:** `PASS WITH ADVICE`

### Definition of Done

Project-plan requirement: **Real results populate `trading_test_runs`.**

| Check | Verdict | Independent evidence |
|---|---|---|
| First real strategy test result exists | VERIFIED | Live `public.trading_test_runs` contains exactly one `DAILY_TREND_PULLBACK` v1 baseline row for the locked logical run key. |
| Result is terminal and valid | VERIFIED | The row is `test_type = backtest`, `run_status = succeeded`, has `completed_at`, no failure message, complete periods, immutable strategy hash and non-empty data/execution provenance. |
| Pre-result design was locked before performance | VERIFIED | `documentation/specifications/daily-trend-pullback-backtest-v1.md` fixes source range, 1-Jun-2022 to 14-Aug-2026 test period, 15-Aug-2025 to 14-Aug-2026 holdout, execution assumptions, indicator rules, risk limits and required evidence without containing performance results. |
| Real source data is validated | VERIFIED | Independent production recomputation found 24,388 Tiingo `1day` rows across 20 instruments, zero invalid included OHLC/adjusted-close rows, and source SHA-256 `209df1371e5a674d15e7f798531218b39c9bd0f29aae7c5a9ce8c9bd574c30c0`, exactly matching persisted provenance. |
| Strategy provenance is immutable | VERIFIED | Persisted strategy snapshot hash is 64-character SHA-256 `2004f34ad4ffd66ee712a91e0aec6745d7f0f7a62d98fdd1cf9791dc15497689`; runner reuses the captured hash and refuses a changed current strategy definition for the same logical run. |
| Backtest logic follows the locked contract | VERIFIED | Fresh GitHub inspection confirmed point-in-time SMA20/SMA50/SMA200 plus audited Wilder RSI14, adjusted OHLC normalisation, deterministic signal ranking, next-open execution, fee/slippage, 8% stop, trend/time exits and portfolio risk/capacity limits. |
| Persisted metrics/accounting reconcile | VERIFIED | `net_profit = ending_equity - initial_equity` and `return_pct = net_profit / initial_equity * 100` independently match within the configured tolerance. Event counts also reconcile: opened entries = completed trades + open positions and exit-reason counts sum to completed trades. |
| Evidence hashes are present | VERIFIED | Persisted source-row, trade-ledger and equity-curve hashes are all 64-character SHA-256 values. |
| Retry is idempotent | VERIFIED | Independent call of `strategy_lab.run_daily_trend_pullback_v1('2bbe6f7dfb2f7addcbcf0bc2085054681919d3e9')` returned `already_complete` for the same run ID/key and left exactly one persisted run. |
| Incomplete success is rejected | VERIFIED | Independent probe attempted an incomplete `succeeded` backtest and the live success gate rejected it with `Successful backtest requires engine_version`. |
| Failure handling is durable | VERIFIED | Runner implementation catches execution exceptions and updates the run to terminal `failed` with `completed_at` and a bounded failure message rather than leaving partial success. |
| Access boundary is deliberate | VERIFIED | Runner is executable by `service_role` only; `authenticated` and `anon` cannot execute it. Live RLS test confirmed owner visibility, second-user isolation and anonymous denial for the persisted run. |
| STRAT-004 has not been pre-executed | VERIFIED | `trading_decision_evaluations` count for this run is zero. The negative out-of-sample result remains evidence only. |
| Production remains healthy | VERIFIED | Latest production deployment `dpl_G2FN6zgsryaXnKh71rLUoWuh5TCL` is `READY`; palette, Next.js compilation and TypeScript passed; `/strategies` returned HTTP 200 and correctly hides private strategy/test evidence from signed-out users. |

### Primary evidence inspected

#### GitHub

- `automation/project-plan-auditor.md` v1.1 — fresh-read at audit start.
- `documentation/project-plan.md` — fresh-read; STRAT-003 was the single `IN REVIEW` item.
- `documentation/specifications/daily-trend-pullback-backtest-v1.md` — locked pre-result design.
- `supabase/migrations/20260824163500_implement_daily_trend_pullback_backtest_v1.sql` — authoritative service-only runner and durable failure path.
- `supabase/migrations/20260824165000_enforce_strategy_backtest_success_v1.sql` — successful-backtest evidence gate.
- `documentation/backtests/daily-trend-pullback-v1-baseline-result.md` — persisted-result evidence record.
- `documentation/project-audits/STRAT-003.md` did not exist before this review.

#### Supabase production (`glvbqcplgjdfgjyknzsa`)

- Exactly one persisted baseline test run exists and is terminal `succeeded`.
- Independent source reconstruction reproduced the locked 24,388-row / 20-instrument source set, zero invalid rows and the exact persisted source hash.
- Accounting identities and event reconciliation independently passed.
- Persisted source/trade/equity evidence hashes are present and correctly shaped.
- Same-run retry returned `already_complete` without creating a duplicate.
- Incomplete-success probe was rejected by the live validation trigger.
- Runner/service privileges and owner RLS isolation were independently checked.
- No decision evaluation exists yet.

#### Vercel / production

- Latest production deployment at audit time: `dpl_G2FN6zgsryaXnKh71rLUoWuh5TCL`, `READY`, repository commit `291ac2651d642682685ed82601e0099b1f13f412`.
- Build passed palette compliance, Next.js compilation and TypeScript.
- Production `/strategies` returned HTTP 200.
- A runtime-log query for the deployment returned Vercel `403 Forbidden`; therefore runtime logs were not used as evidence. This does not block STRAT-003 because the task is a persisted database/backtest result and the required build/route checks succeeded.

### Persisted result reviewed

The accepted baseline row records 249 completed trades, USD 128,219.93 ending equity from USD 100,000, 28.22% total return, 30.92% win rate, 1.3231 profit factor, USD 100.9984 expectancy per completed trade, 16.29% maximum drawdown, 0.5845 Sharpe and **-8.27% out-of-sample return**. Four positions remain open at the cutoff and are excluded from completed-trade statistics.

### Assessment

STRAT-003 satisfies the project-plan gate: a genuine first backtest result is persisted from real production market history under the accepted STRAT-001/STRAT-002 contracts. The source set is independently reproducible, the logical run is idempotent, accounting and event identities reconcile, successful evidence is guarded by a trusted validation trigger, access is owner-private and no strategy-review outcome has been manufactured early.

The negative out-of-sample result is important evidence, not a STRAT-003 failure. Whether the strategy should proceed is explicitly the responsibility of STRAT-004 and its database-driven Standard Strategy Review.

### Non-blocking advice

STRAT-004 must evaluate this exact immutable test-run record through the existing Standard Strategy Review without changing the strategy rules, test period, holdout period or historical metrics. In particular, the persisted `out_of_sample_return_pct = -8.26559237643118` should naturally drive the decision tree rather than being reinterpreted or replaced by a more favourable rerun.

### Final state

**Audit decision:** `PASS WITH ADVICE`  
**Final project-plan status:** `DONE`  
**Next promoted task:** `STRAT-004 — Execute Standard Strategy Review`
