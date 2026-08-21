# Technical Market Scoring Pipeline

**Methodology version:** `technical-score-v1`  
**Required indicator version:** `technical-engine-v1`  
**Implementation task:** TECH-003  
**Canonical methodology:** [Technical Market Scoring Specification](../specifications/technical-market-scoring-specification.md)

## Purpose

The pipeline converts persisted Technical Engine indicators into independent, versioned `market_scores`. It does not read GPT Market Assessment, Opportunity Assessment, Market Convergence or downstream opinion data.

## Implementation

Migration:

- `supabase/migrations/20260821083000_implement_technical_market_scores_v1.sql`

Private service-only entry point:

```sql
select * from technical_engine.refresh_scores_v1(null);
```

Passing `null` refreshes every instrument with eligible `technical-engine-v1` output. Passing an instrument UUID refreshes one instrument. The function is `SECURITY INVOKER`, fixes its search path to `pg_catalog`, and fully qualifies application objects.

## Inputs and outputs

Inputs:

- latest `technical-engine-v1` daily and weekly SMA, EMA, RSI, MACD and volatility snapshots;
- the canonical Tiingo adjusted-close observations referenced by those snapshots;
- deduplicated Tiingo daily volume history through the score date.

Output identity:

```text
(instrument_id, score_date, methodology_version)
```

Outputs include momentum, trend, volatility and volume components, overall score, confidence, methodology versions, status, calculation timestamp and a reproducibility snapshot in `score_details`.

## Failure and partial-data behaviour

The scorer reweights only across available signals/components. It records `partial` when an overall score can be calculated with incomplete intended inputs, and `insufficient_input` only when no component can be calculated. It does not impute neutral scores or use quote, AI, Opportunity or convergence data as a substitute.

Volume requires exactly 40 valid non-negative Tiingo daily volume observations divided into current and prior 20-observation windows. If that condition is not met, volume remains null and confidence falls by its intended coverage weight.

## Access model

- `service_role`: explicit function execution and table writes.
- `public`, `anon`, `authenticated`: no scoring-function execution.
- `public.market_scores`: RLS enabled; authenticated read policy retained; no client write policy.
- The function is security-invoker and does not bypass RLS for untrusted callers.

## Builder verification — 21 August 2026

A production refresh persisted `technical-score-v1` results for 71 instruments:

| Measure | Result |
|---|---:|
| Rows / instruments | 71 / 71 |
| Complete | 61 |
| Partial | 10 |
| Insufficient input | 0 |
| Duplicate identities | 0 |
| Rows with complete reproducibility metadata | 71 |
| Wrong scoring or indicator versions | 0 |

All component, overall and confidence extrema were within `[0, 100]`.

A full committed retry kept 71 rows, preserved all 71 row IDs, changed zero deterministic score payloads and produced zero duplicate identities.

The real `service_role` path successfully executed a targeted NVDA refresh. Privilege inspection showed `service_role` execution enabled and `public`, `anon` and `authenticated` disabled. An authenticated no-op update affected zero rows under RLS.

For the persisted NVDA sample, the stored inputs independently reproduce the saved values:

- trend: 100.00;
- momentum: 90.27;
- volatility stability: 23.53;
- volume: 41.49;
- overall: 79.27;
- confidence: 100.00.

Post-migration database advisors reported no new `market_scores` finding. Existing unrelated informational findings remain governed by their own project-plan items.

## Current operational boundary

TECH-003 implements the deterministic scoring contract and persisted scores. Recurring scheduling, ownership, retry/error monitoring and Admin visibility remain TECH-004. Formal independence verification remains TECH-005. Market Convergence remains a later phase.
