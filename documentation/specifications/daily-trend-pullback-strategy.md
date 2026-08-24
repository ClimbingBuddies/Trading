# Daily Trend Pullback — US Equities & ETFs

**Task:** STRAT-001 — Define first real strategy  
**Strategy code:** `DAILY_TREND_PULLBACK`  
**Strategy version:** `1`  
**Definition methodology:** `strategy-definition-v1`  
**Status:** `testing`  
**Date:** 24 August 2026  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

Define the first real, persisted Trading strategy as a deterministic long-only daily trend-pullback system that can be backtested from existing `public.market_observations` history.

This strategy is a research/test artefact. It does **not** authorise automatic or live trading. The persisted strategy row has `live_execution_enabled = false` and its execution contract also records `live_execution_authorised = false`.

## Strategy thesis

The strategy attempts to enter established medium/long-term uptrends after a short pullback toward the 20-day moving average, while avoiding entries that are already strongly overbought. It exits on a fixed protective stop, a break of the medium-term trend or a maximum holding period.

The purpose of v1 is not to assert that the strategy is profitable. It is to provide one precise, reproducible hypothesis for STRAT-002 and STRAT-003 to test.

## Universe

Universe mode: **fixed snapshot** as at 24 August 2026.

Eligibility used to form the v1 snapshot:

- `instruments.is_active = true`;
- asset type is `equity` or `etf`;
- USD-denominated Trading universe;
- at least 250 daily `market_observations` rows.

Persisted symbols:

`AMD, ANET, AVGO, CCJ, COP, DOCS, FCX, MP, NEM, NVDA, PHR, TDOC, TEM, VEEV, VRT, COPX, GLD, QQQ, SMH, XLV`

There are 20 symbols. Builder verification found all 20 valid and the least-covered symbol still had 543 daily observations.

### Survivorship-bias disclosure

This is a current-universe snapshot used retrospectively for the first backtest. Historical results therefore must not be described as survivorship-bias-free. STRAT-002 must preserve this provenance in each test-run record.

## Data and indicator contract

Source: `public.market_observations`, interval `1day`.

Required daily fields:

- `observed_at`;
- `open`;
- `high`;
- `low`;
- `close`;
- `adjusted_close` where available.

Signals use adjusted close where available, otherwise close. Execution simulation uses the recorded open/high/low fields.

The strategy requires at least 200 completed daily observations before a signal may form and prefers at least 250 warm-up observations.

Indicators are recomputed **point in time** from the historical observation stream using the formulas defined by `technical-engine-v1` in `documentation/specifications/technical-calculation-specification.md`:

- SMA20;
- SMA50;
- SMA200;
- RSI14.

Do not use today's persisted `technical_indicators` snapshot as though it were historical indicator data. No future observation may influence an earlier signal.

## Entry rules

Evaluate after each completed daily session.

An instrument produces an eligible long-entry signal only when **all** conditions are true:

1. SMA50 > SMA200.
2. Current close > SMA200.
3. RSI14 is between 45 and 65 inclusive.
4. Previous session close <= previous session SMA20.
5. Current close > current SMA20.
6. Current close > previous session close.

This means the instrument is in an established uptrend and has just closed back above its 20-day average after a one-session-or-longer pullback.

### Entry timing

- Enter at the next available session open.
- Skip the signal when the next session open is more than 3% above the signal-session close.
- Never hold more than one position in the same instrument.

### Competing signals

When more signals exist than portfolio capacity allows, rank them by:

1. descending `(SMA50 / SMA200 - 1)`;
2. ascending instrument symbol as the deterministic tie-breaker.

Allocate in that order subject to all risk limits.

## Exit rules

Exit precedence is:

1. protective stop;
2. trend exit;
3. time exit.

### Protective stop

Initial stop = 8% below the actual entry price.

For daily-bar simulation:

- if a later session opens below the stop, exit at that session open;
- otherwise, if the session low reaches or breaches the stop, exit at the stop price.

The strategy does not move the v1 stop and does not average down.

### Trend exit

When the completed daily close is below SMA50, exit at the next available session open unless the protective stop has already exited the position.

### Time exit

After 60 completed trading sessions in the position, exit at the next available session open unless an earlier exit already applies.

There is no fixed profit target in v1.

## Risk rules

Portfolio risk is defined independently of whether the strategy later proves profitable.

- target initial risk per trade: 0.75% of portfolio equity;
- maximum position notional: 10% of portfolio equity;
- maximum concurrent positions: 4;
- maximum gross long exposure: 40%;
- maximum total initial open risk: 3%;
- no short selling;
- no leverage;
- no averaging down.

Position size is calculated from 0.75% portfolio risk to the 8% initial stop, then capped at 10% notional. Reduce or skip an entry if portfolio exposure or open-risk limits would be exceeded.

## Test execution assumptions

For reproducible backtesting/paper testing:

- signals are formed only after the session close;
- entries and non-stop exits execute at the next session open;
- protective-stop gaps execute at the session open when that open is through the stop;
- otherwise a stop touched by the daily low fills at the stop price;
- slippage assumption: 10 basis points per side;
- fee assumption: 5 basis points per side;
- fractional shares are allowed for the test model to avoid share-price rounding dominating position sizing;
- same-day signals are ranked before capital is allocated;
- no look-ahead to future prices or indicators is permitted.

These assumptions are testing rules, not a live broker/execution specification.

## Missing-data behaviour

Do not form a signal until all required point-in-time indicators and fill fields are available. Skip incomplete sessions rather than imputing prices.

Corporate-action handling uses adjusted close for signal calculations when available. Every test report must disclose the limitation that open/high/low fields may not have the same adjustment convention as adjusted close unless the test pipeline explicitly normalises them.

## Analytical boundaries

The first strategy deliberately uses price history and deterministic indicators only. It does not use:

- AI Market Assessment ratings/scores;
- Market Convergence conclusions;
- Opportunity Assessment or exposure conclusions;
- external-opinion consensus;
- alerts.

That keeps the first test reproducible over the available five-year market history. Later separately versioned strategies may test other platform signals without changing v1.

## Persisted contract

`public.trading_strategies` now persists structured fields for:

- `strategy_version`;
- `methodology_version`;
- `universe_definition`;
- `entry_rules`;
- `exit_rules`;
- `risk_rules`;
- `execution_rules`;
- `data_requirements`;
- `live_execution_enabled`.

The live `DAILY_TREND_PULLBACK` version-1 row is the authoritative persisted strategy definition. This GitHub document explains the same contract for review and future test implementation.

## STRAT-001 Definition of Done mapping

Project-plan requirement: **Rules, universe, entry/exit logic, risk and version are persisted.**

The live strategy row contains all of those elements as structured persisted fields. Version 1 has a fixed 20-symbol universe, deterministic entry and exit rules, explicit portfolio risk limits, deterministic test execution assumptions and live execution disabled.