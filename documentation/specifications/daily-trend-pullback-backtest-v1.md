# Daily Trend Pullback — Baseline Backtest v1

**Task:** STRAT-003 — Load first real test run  
**Strategy:** `DAILY_TREND_PULLBACK` v1  
**Backtest engine version:** `daily-trend-pullback-backtest-v1`  
**Ingestion contract:** `strategy-test-ingestion-v1`  
**Metric contract:** `strategy-test-metrics-v1`  
**Design locked:** 24 August 2026, before performance calculation

## Purpose

Define the exact first real backtest design before calculating performance so the in-sample/out-of-sample split and execution assumptions cannot be selected after seeing the result.

This document does not contain a performance result. The real result is persisted only after the engine completes against production `market_observations` and passes the trusted finalisation checks.

## Strategy identity

The test uses the persisted `DAILY_TREND_PULLBACK` strategy version 1. The `trading_test_runs` insertion trigger must capture the immutable strategy JSON snapshot and SHA-256 hash before the test is finalised.

## Source data

- table: `public.market_observations`;
- provider: Tiingo (`provider_code = 'tiingo'`);
- interval: `1day`;
- fixed strategy universe: 20 symbols from the v1 strategy snapshot;
- source-history range available for the fixed universe: 16-Aug-2021 through 14-Aug-2026;
- source rows at design lock: 24,388;
- canonical signal price: positive `adjusted_close`;
- input cutoff for this baseline: the latest included Tiingo daily observation, 14-Aug-2026;
- no observation later than the persisted input cutoff may influence the run.

The engine must compute and persist a deterministic hash of the actual source rows used.

## Warm-up and test period

Nineteen of the 20 fixed-universe instruments reach their 200th daily observation on 31-May-2022. TEM reaches 200 observations on 2-Apr-2025 because its history starts later.

The baseline portfolio test period is therefore locked as:

- overall test period: **1-Jun-2022 through 14-Aug-2026**;
- in-sample period: **1-Jun-2022 through 14-Aug-2025**;
- out-of-sample period: **15-Aug-2025 through 14-Aug-2026**.

History before 1-Jun-2022 is warm-up input only and does not create portfolio positions. Instruments without 200 valid observations on a given date remain in the fixed universe but cannot form signals until they satisfy the strategy's point-in-time history requirement.

The one-year out-of-sample hold-out was selected before performance calculation and must not be moved after results are known.

## Portfolio accounting

- initial equity: **USD 100,000**;
- base currency: USD;
- fractional shares: enabled as required by the strategy test contract;
- cash plus mark-to-market open positions forms daily portfolio equity;
- daily close equity is used for the equity curve, maximum drawdown and Sharpe ratio;
- open positions at the final cutoff are marked to the final adjusted close and are not counted as completed trades;
- `trade_count`, win rate, profit factor and expectancy use completed round-trip positions only.

Out-of-sample return uses portfolio equity at the close immediately before the out-of-sample period as its starting equity and portfolio equity at the final cutoff as its ending equity. Positions carried across the boundary remain part of the portfolio rather than being artificially closed and reopened.

## Price normalisation

Signals use Tiingo `adjusted_close` exactly as required by `technical-engine-v1`.

For execution simulation, raw daily `open`, `high` and `low` are normalised onto the adjusted-close basis using the same row's factor:

```text
adjustment_factor = adjusted_close / close
adjusted_open = open * adjustment_factor
adjusted_high = high * adjustment_factor
adjusted_low = low * adjustment_factor
```

This explicitly addresses the STRAT-001 corporate-action limitation while retaining the observed intraday OHLC shape. The run provenance must disclose this convention.

## Indicators

Indicators are computed point-in-time from the historical Tiingo daily stream:

- SMA20;
- SMA50;
- SMA200;
- RSI14 using the audited `technical-engine-v1` Wilder formula.

Current persisted `technical_indicators` snapshots are not used as historical signals.

## Daily event order

For each test session:

1. At the open, apply protective-stop gap exits first for existing positions.
2. Apply previously scheduled trend/time exits at the open for positions not already stopped.
3. Process prior-close entry candidates in the strategy's deterministic ranking order, applying the 3% gap-up skip and all portfolio limits.
4. After open entries, apply intraday protective-stop touches using the adjusted daily low.
5. At the close, mark portfolio equity using adjusted close.
6. At the close, increment completed holding sessions and schedule next-open trend/time exits where required.
7. Form new entry candidates from completed-close data only for instruments not already held.

No future session value may affect an earlier decision.

## Execution costs and fills

- entry base price: next adjusted open;
- entry slippage: +10 bps;
- exit slippage: -10 bps;
- fee: 5 bps per side on executed notional;
- initial protective stop: 8% below actual entry fill price;
- existing-position gap below stop: sell at adjusted open, then apply sell slippage;
- otherwise a daily low touching the stop: sell at stop, then apply sell slippage;
- trend exit: next adjusted open after completed close < SMA50;
- time exit: next adjusted open after 60 completed sessions in the position.

Closed-trade P&L includes both entry and exit fees and both sides' slippage through the executed fill prices.

## Position sizing and portfolio limits

For each accepted entry, calculate target quantity from 0.75% of current portfolio equity divided by the 8% initial stop distance, capped at 10% of portfolio equity notional.

The engine must additionally enforce:

- at most four concurrent positions;
- no more than 40% gross long exposure;
- no more than 3% total initial open risk;
- one position per instrument;
- no leverage;
- no shorting;
- no averaging down.

When multiple candidates compete for capacity, rank by descending `(SMA50 / SMA200 - 1)` and then ascending symbol.

## Required persisted evidence

A successful STRAT-003 baseline row must include all fields required by `strategy-test-ingestion-v1`, including:

- stable `run_key`;
- engine version and implementation commit;
- immutable strategy snapshot/hash;
- input cutoff;
- source row hash/count and source range;
- fixed-universe identity and survivorship disclosure;
- explicit in/out-of-sample periods;
- initial/ending equity;
- complete `strategy-test-metrics-v1` metrics;
- data provenance and execution provenance;
- terminal `succeeded` plus `completed_at`.

The trusted finalisation path must reject `succeeded` if required metrics or provenance are absent or internally inconsistent. Same-run retries must return/reuse the existing logical run rather than create duplicate evidence.
