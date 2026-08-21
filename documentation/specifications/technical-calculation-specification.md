# Technical Calculation Specification

**Task:** TECH-001 — Define technical calculation specification  
**Specification version:** `technical-engine-v1`  
**Status:** Builder complete — awaiting Auditor review

## Purpose

This document defines the calculation contract for the Independent Technical Engine. The engine answers:

> Is this instrument technically attractive based only on market observations and technical calculations?

The Technical Engine is independent from ChatGPT Market Assessment, Opportunity Assessment and Market Convergence until the defined convergence phase.

## Source data

Primary input:

- `market_observations`

Required ordering:

- observations are processed in ascending observation timestamp order;
- duplicate instrument/date observations must be removed deterministically using the canonical observation identifier and latest valid persisted observation rule;
- calculations must never depend on query return order.

Invalid observations:

- null, zero or negative prices are invalid inputs for price-based calculations;
- invalid observations are excluded from calculation windows and recorded as data-quality failures;
- calculations are not produced when exclusion causes insufficient history.

The engine must not consume GPT Market Assessment outputs, Buy/Hold/Sell conclusions, Opportunity Assessment signals, Technology Inflection Signals or Market Convergence outputs.

## Calculation intervals

Initial supported intervals:

| Interval | Purpose |
|---|---|
| Daily | Primary trend and scoring timeframe |
| Weekly | Medium-term trend confirmation |
| Intraday observations | Future extension only after scheduler requirements are defined |

Weekly aggregation:

- weekly candles are derived only from validated daily observations;
- week boundaries use the platform market calendar definition;
- weekly open is first valid observation, high is maximum price, low is minimum price, close is final valid observation, and volume is aggregated where available.

## History requirements

Minimum history requirements:

| Indicator family | Required history |
|---|---|
| SMA | Period length plus complete available periods |
| EMA | Period length plus warm-up observations |
| RSI | 14 periods plus initial average gain/loss seed |
| MACD | 26-period EMA, 12-period EMA and 9-period signal warm-up |
| Volatility | 20 return observations |

No indicator value may be fabricated when history is unavailable.

## Indicator definitions

### Simple Moving Average (SMA)

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

EMA seeding:

- the first EMA value is seeded using the SMA of the first n valid closing prices;
- subsequent values use the recursive EMA formula;
- no EMA is emitted until the complete seed window exists.

Initial periods:

- EMA-12
- EMA-26

### Relative Strength Index (RSI)

Formula:

`RSI = 100 - (100 / (1 + RS))`

where:

`RS = Average Gain / Average Loss`

RSI smoothing:

- RSI uses Wilder's smoothing method after the initial 14-period seed;
- initial average gain and loss are arithmetic averages of the first 14 periods;
- later values use Wilder recursive smoothing.

Initial period:

- RSI-14

### Moving Average Convergence Divergence (MACD)

Formula:

`MACD Line = EMA-12 - EMA-26`

`Signal Line = EMA-9(MACD Line)`

`Histogram = MACD Line - Signal Line`

MACD warm-up:

- MACD requires completed EMA-12 and EMA-26 series;
- signal values begin only after nine MACD line values exist;
- histogram values begin only after signal warm-up completes.

### Rolling volatility

Return calculation:

`return = (close_today / close_previous) - 1`

Volatility:

`annualised volatility = standard deviation(period returns) × sqrt(252)`

Initial period:

- 20 trading-day rolling volatility.

## Calculation timestamps

Each calculation must record:

- source observation timestamp range;
- calculation timestamp in UTC;
- calculation interval;
- methodology version.

The calculation timestamp represents when the engine produced the result, not the market observation timestamp.

## Missing-data behaviour

The Technical Engine must:

- never invent missing observations;
- mark calculations incomplete when required history is unavailable;
- preserve the reason for incomplete calculations;
- avoid partial scores being interpreted as complete assessments.

Statuses:

- `complete`
- `insufficient_history`
- `invalid_input`
- `data_quality_failure`

## Versioning

Every calculation result records:

`technical-engine-v1`

Formula, parameter, smoothing, aggregation or missing-data changes require a new methodology version.

## Output contract

Future `technical_indicators` records should contain:

- instrument identifier;
- calculation timestamp;
- source observation range;
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
