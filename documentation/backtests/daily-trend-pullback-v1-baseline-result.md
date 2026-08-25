# Daily Trend Pullback v1 — First Real Baseline Result

**Task:** STRAT-003 — Load first real test run  
**Strategy:** `DAILY_TREND_PULLBACK` v1  
**Run status:** `succeeded`  
**Run ID:** `49a0686b-0039-42d2-97b9-83ff19edb1bd`  
**Run key:** `DAILY_TREND_PULLBACK:v1:backtest:2022-06-01_2026-08-14:daily-trend-pullback-backtest-v1:baseline`  
**Engine:** `daily-trend-pullback-backtest-v1`  
**Ingestion:** `strategy-test-ingestion-v1`  
**Metrics:** `strategy-test-metrics-v1`

## Scope

This is the first real persisted strategy test result in the Trading platform. It is a historical backtest produced from real Tiingo daily rows in production Supabase under the test design locked in `documentation/specifications/daily-trend-pullback-backtest-v1.md` before performance was calculated.

This document records evidence only. It does **not** execute the Standard Strategy Review, approve the strategy, enable live trading, or change the strategy rules. STRAT-004 owns the decision path.

## Locked periods

- source/warm-up history: 16-Aug-2021 through 14-Aug-2026;
- test period: 1-Jun-2022 through 14-Aug-2026;
- in-sample: 1-Jun-2022 through 14-Aug-2025;
- out-of-sample: 15-Aug-2025 through 14-Aug-2026;
- input-data cutoff: 14-Aug-2026 Tiingo daily observation;
- initial equity: USD 100,000.

## Persisted result

| Metric | Result |
|---|---:|
| Instruments processed | 20 |
| Completed trades | 249 |
| Ending equity | 128,219.93231051364 USD |
| Net profit | 28,219.932310513635 USD |
| Total return | 28.219932310513638% |
| Win rate | 30.923694779116467% |
| Profit factor | 1.3230995409489577 |
| Expectancy | 100.99840393194626 USD per completed trade |
| Maximum drawdown | 16.290033842716177% |
| Sharpe ratio | 0.5845107282938247 |
| In-sample return | 39.772998629546706% |
| Out-of-sample return | -8.26559237643118% |
| Open positions at cutoff | 4 |

The four positions still open at the cutoff are included in ending portfolio equity at the final adjusted close but are not counted as completed trades. No hypothetical final exit cost is deducted until an actual strategy exit occurs.

## Source provenance

The successful row persists:

- source table: `public.market_observations`;
- provider: Tiingo;
- interval: `1day`;
- source rows: 24,388;
- fixed strategy universe: 20 symbols;
- source-row SHA-256: `209df1371e5a674d15e7f798531218b39c9bd0f29aae7c5a9ce8c9bd574c30c0`;
- immutable strategy snapshot SHA-256: `2004f34ad4ffd66ee712a91e0aec6745d7f0f7a62d98fdd1cf9791dc15497689`;
- execution OHLC convention: raw open/high/low normalised by `adjusted_close / close` so execution simulation is on the same corporate-action-adjusted basis as the signal series;
- fixed-current-universe survivorship-bias disclosure;
- no future observation beyond the input cutoff is permitted.

Builder verification independently recomputed the locked source hash from production source rows and matched the persisted value.

## Execution provenance

- engine implementation commit: `2bbe6f7dfb2f7addcbcf0bc2085054681919d3e9`;
- pre-result design commit: `2ac3997e80b4f63f342d189729e87c238029acbe`;
- success-validation gate commit: `18e64b6cdd4b1ea4d4da38b67922da5790c67352`;
- trade-ledger SHA-256: `0410624fbd503a682484303d425e6091bb2e053855ae48a8fa113dd18d5021c9`;
- daily equity-curve SHA-256: `c23be3dfd7f1bf01776fc0aeaeadc58fe4c1768653049cdaa18cb9c1fb713716`;
- indicators: point-in-time `technical-engine-v1` SMA20/SMA50/SMA200 and Wilder RSI14;
- entries: next adjusted open, 10 bps adverse slippage, 5 bps fee;
- exits: 10 bps adverse slippage, 5 bps fee;
- protective stop: 8% below actual entry fill;
- daily-close equity sampling for drawdown and Sharpe;
- Sharpe convention: daily portfolio returns, risk-free rate 0, annualisation `sqrt(252)`;
- no random/stochastic component.

## Event reconciliation

The run generated 563 close signals:

- 253 entries opened;
- 22 signals skipped by the >3% next-open gap rule;
- 287 signals skipped because portfolio capacity/risk limits prevented entry;
- 1 signal remained pending at the final cutoff.

The 253 opened entries reconcile to 249 completed trades plus 4 open positions.

The 249 completed trades reconcile exactly to:

- 11 protective-stop gap exits;
- 26 protective-stop intraday-touch exits;
- 197 SMA50 trend exits;
- 15 60-session time exits.

## Accounting and lifecycle verification

Builder checks confirmed:

- `net_profit = ending_equity - initial_equity`;
- `return_pct = net_profit / initial_equity * 100`;
- the run is terminal `succeeded` with `completed_at` and no failure message;
- the same-run retry returns `already_complete` and leaves exactly one row for the owner/run key;
- the database success-validation trigger rejects incomplete `succeeded` backtests;
- strategy owner can read the result;
- a second permanent authenticated user cannot read it;
- `anon` cannot read it;
- the private backtest runner is executable by `service_role` only;
- no `trading_decision_evaluations` row exists for this run;
- the strategy remains `testing` and `live_execution_enabled = false`.

## Interpretation boundary

STRAT-003 recorded the result without making the strategy decision. In particular, the negative out-of-sample return is persisted as evidence rather than hidden or converted into a different test design. STRAT-004 subsequently evaluated the persisted metrics through the existing database-driven decision tree without changing this historical run.
