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

Canonical v1 daily source selection:

- use only `market_observations.interval_code = '1day'`;
- use the Tiingo daily provider series; `quote` observations and intraday snapshots are excluded from v1 calculations;
- use positive `adjusted_close` as the canonical price input so split/dividend adjustments do not create false technical moves;
- never mix `adjusted_close` and raw `close` within one calculation series;
- if a required daily row lacks a valid `adjusted_close`, mark the affected calculation `invalid_input` rather than silently substituting another price basis.

Required ordering and deduplication:

1. filter to the canonical instrument, provider and `1day` interval;
2. identify a source period by `observed_at`;
3. if more than one candidate survives for the same source period, retain the row with greatest `loaded_at`, then greatest `id` as the final tie-breaker;
4. process the resulting rows by `observed_at ASC, loaded_at ASC, id ASC`;
5. calculations must never depend on database return order.

The live table already enforces uniqueness on `(instrument_id, provider_id, interval_code, observed_at)`; the explicit deduplication rule remains mandatory for deterministic corrections, imports and future provider expansion.

Invalid observations:

- null, zero, non-finite or negative required prices are invalid;
- OHLC rows are also invalid when `high < low`, `high < open`, `high < close`, `low > open` or `low > close`;
- negative volume is invalid; null volume is permitted and yields null aggregated weekly volume;
- invalid observations are excluded from valid windows and recorded with the affected observation ID and reason;
- a missing/invalid source period does not compress time or become an invented replacement period: any indicator whose exact window crosses it is not emitted and receives `data_quality_failure`;
- calculations are not produced when valid history is below the exact threshold.

The engine must not consume GPT Market Assessment outputs, Buy/Hold/Sell conclusions, Opportunity Assessment signals, Technology Inflection Signals or Market Convergence outputs.

## Calculation intervals

Initial supported intervals:

| Interval | Purpose |
|---|---|
| Daily | Primary trend and scoring timeframe |
| Weekly | Medium-term trend confirmation |
| Intraday observations | Future extension only after scheduler requirements are defined |

Weekly aggregation:

- weekly candles are derived only from validated canonical `1day` observations;
- v1 week boundaries are ISO-8601 weeks in UTC: Monday 00:00:00 inclusive to the following Monday 00:00:00 exclusive;
- within a week, order rows by the deterministic ordering rule above;
- weekly open is the first valid raw `open`, high is the maximum valid raw `high`, low is the minimum valid raw `low`, and raw close is the final valid raw `close`;
- the weekly technical price is the final valid `adjusted_close`;
- weekly volume is the sum only when every included daily row has non-null, non-negative volume; otherwise weekly volume is null with `volume_complete = false`;
- a week with no valid daily row is absent rather than synthesised;
- weekly indicator windows count completed weekly periods, not calendar weeks.

## History requirements

Exact minimum history requirements:

| Output | First eligible output | Exact valid input requirement |
|---|---:|---|
| SMA-20 | period 20 | 20 closes |
| SMA-50 | period 50 | 50 closes |
| SMA-200 | period 200 | 200 closes |
| EMA-12 | period 12 | 12 closes; first value is the 12-close SMA seed |
| EMA-26 | period 26 | 26 closes; first value is the 26-close SMA seed |
| RSI-14 | period 15 | 15 closes producing 14 consecutive price changes |
| MACD line | period 26 | 26 closes; EMA-12 and EMA-26 must both exist |
| MACD signal | period 34 | 34 closes producing 9 MACD-line values; first signal is their 9-value SMA seed |
| MACD histogram | period 34 | same 34-close requirement as the first signal |
| Volatility-20 | period 21 | 21 closes producing 20 consecutive returns |

The thresholds apply independently to daily and weekly series. A daily SMA-200 therefore requires 200 valid daily periods; a weekly SMA-200 requires 200 completed valid ISO weeks. No indicator value may be fabricated or backfilled before its threshold.

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

- define `change_t = price_t - price_(t-1)`, `gain_t = max(change_t, 0)`, and `loss_t = max(-change_t, 0)`;
- the first RSI uses arithmetic average gain and arithmetic average loss across the first 14 changes;
- later averages use Wilder recursion: `avg_gain_t = ((avg_gain_(t-1) × 13) + gain_t) / 14` and equivalently for loss;
- when average loss is zero and average gain is positive, RSI is 100; when both are zero, RSI is 50; when average gain is zero and loss is positive, RSI is 0.

Initial period:

- RSI-14

### Moving Average Convergence Divergence (MACD)

Formula:

`MACD Line = EMA-12 - EMA-26`

`Signal Line = EMA-9(MACD Line)`

`Histogram = MACD Line - Signal Line`

MACD warm-up:

- MACD requires completed EMA-12 and EMA-26 series;
- the first MACD line is emitted at close 26;
- signal values begin only after nine MACD-line values exist, at close 34;
- the first signal value is seeded as the SMA of those first nine MACD-line values; later signal values use the recursive EMA-9 formula with multiplier `2 / 10`;
- histogram values begin at the same period as the first signal value.

### Rolling volatility

Return calculation:

`return = (close_today / close_previous) - 1`

Volatility:

- returns are simple arithmetic close-to-close returns, not log returns;
- use the sample standard deviation of the 20-return window (denominator `n - 1 = 19`);
- daily annualised volatility is `sample_stddev(20 daily returns) × sqrt(252)`;
- weekly annualised volatility is `sample_stddev(20 weekly returns) × sqrt(52)`;
- store volatility as a decimal ratio (for example `0.20` means 20%), not percentage points.

Initial period:

- 20-return rolling volatility, requiring 21 valid consecutive prices.

## Calculation timestamps

Each calculation must record:

- `observation_id`: the final source observation in the calculated window;
- `source_observed_from` and `source_observed_to`: inclusive source timestamp range;
- `calculated_at`: the UTC transaction timestamp at which the engine produced the persisted result;
- calculation interval;
- methodology/calculation version.

`calculated_at` is not the observation timestamp. Recalculating the same final observation and version must upsert the deterministic indicator identity rather than create a duplicate; the existing unique key is `(instrument_id, observation_id, indicator_code, calculation_version)`.

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

The current `technical_indicators` schema is the v1 persistence target:

- `instrument_id`: instrument identity;
- `observation_id`: final source observation;
- `indicator_code`: stable code such as `sma_20`, `ema_12`, `rsi_14`, `macd`, or `volatility_20`;
- `interval_code`: `1day` or `1week`;
- `calculated_at`: UTC calculation time;
- `value`: primary scalar value (null for a non-complete status);
- `calculation_version`: `technical-engine-v1`;
- `values` JSONB: component values and provenance.

For scalar indicators, `values` contains at least `status`, `source_observed_from`, `source_observed_to`, `required_periods`, `valid_periods`, and `price_basis`. MACD additionally stores `macd_line`, `signal_line`, and `histogram`. Incomplete/data-quality outputs store `reason_code` and affected observation IDs. No schema change is authorised by TECH-001; TECH-002 must implement against this contract or propose a migration explicitly.

## Live compatibility snapshot

Builder verification on 21 August 2026 confirmed:

- `market_observations` contains `1day` Tiingo history and separate Twelve Data `quote` rows;
- the live daily series spans 71 instruments, but history depth varies, so `insufficient_history` is a normal per-indicator outcome;
- all current persisted price fields are positive and `adjusted_close` is populated, while the specification still defines fail-closed invalid-input behaviour;
- the live uniqueness and ordering columns required above exist;
- `technical_indicators` has zero rows and remains scaffolded, so this specification does not claim TECH-002 implementation.

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
