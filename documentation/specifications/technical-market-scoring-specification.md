# Technical Market Scoring Specification

**Methodology version:** `technical-score-v1`  
**Required indicator version:** `technical-engine-v1`  
**Implementation task:** TECH-003  
**Canonical indicator formulas:** [Technical Calculation Specification](technical-calculation-specification.md)

## Purpose and independence boundary

This specification converts the independent Technical Engine's persisted indicators into reproducible 0–100 market scores. It uses only `technical-engine-v1` indicator snapshots and canonical Tiingo daily price/volume observations.

GPT Market Assessment, Opportunity Assessment, Market Convergence, opinions, ratings and downstream conclusions are prohibited inputs. Technical scoring must be complete before a later convergence process may combine it with any AI result.

## Score identity and source selection

A score is uniquely identified by:

```text
(instrument_id, score_date, methodology_version)
```

For each instrument, the scorer selects the latest persisted `technical-engine-v1` row for each indicator code and interval. The daily and weekly source prices are the adjusted closes referenced by the selected indicator observation IDs. The score date is the UTC date of the latest available selected daily or weekly source observation.

All component, overall and confidence values are rounded to two decimal places and constrained to `[0, 100]`.

## Trend score

Each available Boolean signal contributes either its full weight when true or zero when false:

| Signal | Weight |
|---|---:|
| Daily price > daily SMA-20 | 10 |
| Daily price > daily SMA-50 | 15 |
| Daily price > daily SMA-200 | 20 |
| Weekly price > weekly SMA-20 | 10 |
| Weekly price > weekly SMA-50 | 10 |
| Weekly price > weekly SMA-200 | 15 |
| Daily EMA-12 > daily EMA-26 | 10 |
| Weekly EMA-12 > weekly EMA-26 | 10 |

Let `earned` be the sum of passing available-signal weights and `available` the sum of all available-signal weights:

```text
trend_score = 100 × earned / available
```

The component is null only when no trend signal is available. Missing signals are excluded from both numerator and denominator.

## Momentum score

RSI is converted to a bounded signal score:

```text
rsi_signal = clamp((rsi14 - 30) × 2.5, 0, 100)
```

Available signals are weighted as follows:

| Signal | Weight | Signal value |
|---|---:|---:|
| Daily RSI-14 | 25 | `rsi_signal` |
| Weekly RSI-14 | 25 | `rsi_signal` |
| Daily MACD line > daily signal line | 20 | 100 if true, otherwise 0 |
| Weekly MACD line > weekly signal line | 20 | 100 if true, otherwise 0 |
| Daily MACD line > 0 | 5 | 100 if true, otherwise 0 |
| Weekly MACD line > 0 | 5 | 100 if true, otherwise 0 |

```text
momentum_score = weighted available signal total / available weight
```

The component is null only when no momentum signal is available.

## Volatility score

The indicator pipeline supplies annualised simple-return volatility. Lower volatility receives a higher stability score:

```text
stability(interval) = clamp(100 - 200 × annualised_volatility(interval), 0, 100)
volatility_score = weighted available stability total / available weight
```

Daily stability has weight 60 and weekly stability has weight 40. A missing interval is excluded and the remaining available weight is normalised. The component is null when neither volatility value is available.

## Volume score

Volume uses deduplicated Tiingo `1day` observations on or before `score_date`. Duplicate timestamps retain the row with greatest `loaded_at`, then greatest `id`. Rows are ordered newest first.

The score requires 40 valid, non-negative volume observations:

```text
current_average = average of newest observations 1–20
prior_average   = average of observations 21–40
ratio           = current_average / prior_average
volume_score    = clamp(50 + 50 × (ratio - 1), 0, 100)
```

If fewer than 40 valid observations exist, or the prior average is not positive, `volume_score` is null. No substitute or fabricated volume is permitted.

## Overall score and confidence

Component weights are:

| Component | Overall weight |
|---|---:|
| Trend | 40 |
| Momentum | 35 |
| Volatility | 15 |
| Volume | 10 |

```text
overall_score =
  Σ(component_score × available component weight)
  / Σ(available component weight)
```

A missing component is removed from numerator and denominator.

Confidence measures intended input coverage, not predictive certainty:

```text
confidence_score =
  40 × trend_signal_availability
+ 35 × momentum_signal_availability
+ 15 × volatility_signal_availability
+ 10 × volume_availability
```

Each availability is a fraction from 0 to 1; volume availability is 1 only when its score can be calculated.

## Missing-data status

- `complete` — `overall_score` exists and `confidence_score = 100`.
- `partial` — `overall_score` exists but one or more intended inputs are unavailable.
- `insufficient_input` — no component is available, so `overall_score` is null.

Partial results remain explicit; they are never padded with neutral values. Constraints permit null component scores while requiring a bounded confidence value and a recognised status.

## Persistence and reproducibility

`public.market_scores` persists:

- component scores: momentum, trend, volatility and volume;
- overall score and input-coverage confidence;
- scoring and indicator methodology versions;
- status and calculation timestamp;
- `score_details` containing source observation IDs, component weights, available signal weights and the exact numeric input snapshot.

Re-running the same methodology for the same instrument and score date updates the existing identity, preserving its row ID. A new score date or methodology version creates a separate historical identity.

## Security and execution

The implementation entry point is the private, `SECURITY INVOKER` function:

```sql
select * from technical_engine.refresh_scores_v1(null);
```

A UUID refreshes one instrument; `null` refreshes all instruments with eligible technical output. Only `service_role` has schema/function execution. `public`, `anon` and `authenticated` cannot execute the scorer, and `market_scores` remains protected by row-level security from client writes.
