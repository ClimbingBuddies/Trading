# Technical Calculation Specification

**Task:** TECH-001 — Define technical calculation specification  
**Specification version:** `technical-engine-v1`  
**Status:** Design baseline

## Purpose

This document defines the calculation contract for the Independent Technical Engine. The engine answers:

> Is this instrument technically attractive based only on market observations and technical calculations?

The Technical Engine is independent from the ChatGPT Market Assessment, Opportunity Assessment and Market Convergence systems until the defined convergence phase.

## Source data

Primary input:

- `market_observations`

The engine must only use validated market observations. It must not consume:

- GPT Market Assessment outputs;
- Buy/Hold/Sell conclusions;
- Opportunity Assessment signals;
- Technology Inflection Signals;
- Market Convergence outputs.

## Calculation intervals

Initial supported intervals:

| Interval | Purpose |
|---|---|
| Daily | Primary trend and scoring timeframe |
| Weekly | Medium-term trend confirmation |
| Intraday observations | Future extension only after scheduler requirements are defined |

The first production implementation should calculate daily indicators from available historical observations.

## History requirements

Minimum history requirements:

| Indicator family | Required history |
|---|---|
| Moving averages | Maximum lookback window + warm-up period |
| RSI | 14 periods minimum |
| MACD | 26-period EMA, 12-period EMA and 9-period signal EMA inputs |
| Volatility | 20 periods minimum for rolling volatility |

If insufficient history exists, the indicator must not fabricate values.

## Indicator definitions

### Simple Moving Average (SMA)

Formula:

`SMA(n) = Sum(close prices for n periods) / n`

Initial periods:

- SMA-20
- SMA-50
- SMA-200

### Exponential Moving Average (EMA)

Formula:

`EMA(today) = (Close(today) × multiplier) + (EMA(previous) × (1 - multiplier))`

where:

`multiplier = 2 / (n + 1)`

Initial periods:

- EMA-12
- EMA-26

### Relative Strength Index (RSI)

Formula:

`RSI = 100 - (100 / (1 + RS))`

where:

`RS = Average Gain / Average Loss`

Initial period:

- RSI-14

### Moving Average Convergence Divergence (MACD)

Formula:

`MACD Line = EMA-12 - EMA-26`

`Signal Line = EMA-9(MACD Line)`

`Histogram = MACD Line - Signal Line`

### Rolling volatility

Formula:

`Volatility = Standard Deviation(period returns) × sqrt(periods per year)`

Initial period:

- 20 trading days

## Missing-data behaviour

The Technical Engine must:

- never invent missing observations;
- mark calculations incomplete when required history is unavailable;
- preserve the reason for incomplete calculations;
- avoid partial scores being interpreted as complete assessments.

Examples:

- missing price observation: calculation waits for valid data;
- insufficient history: indicator status is `insufficient_history`;
- invalid input data: calculation status is `invalid_input`.

## Versioning

Every calculation result must record methodology version:

`technical-engine-v1`

Future changes to formulas, parameters, weighting or missing-data rules require a new methodology version.

## Output contract

Future `technical_indicators` records should contain:

- instrument identifier;
- calculation date/time;
- indicator name;
- interval;
- calculated value;
- methodology version;
- status;
- data quality metadata where required.

## Relationship to market scoring

TECH-001 defines calculations only. It does not define investment conclusions or market scores.

Scoring is a separate task:

- TECH-002: indicator implementation;
- TECH-003: technical market scoring.

## Acceptance criteria

This specification is complete when:

- indicators are defined;
- intervals are defined;
- history requirements are documented;
- formulas are explicit;
- versioning rules exist;
- missing-data behaviour is deterministic;
- independence boundaries are documented.
