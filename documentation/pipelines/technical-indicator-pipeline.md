# Technical Indicator Pipeline

**Methodology version:** `technical-engine-v1`  
**Implementation task:** TECH-002  
**Canonical formulas:** [Technical Calculation Specification](../specifications/technical-calculation-specification.md)

## Purpose

The Technical Indicator Pipeline produces reproducible indicator snapshots from canonical Tiingo daily market observations. It is independent from GPT Market Assessment, Opportunity Assessment, `market_scores` and every convergence output.

## Implementation

The private `technical_engine` database schema contains deterministic calculation helpers and the service-only entry point:

```sql
select * from technical_engine.refresh_v1(null);
```

Passing `null` refreshes every instrument with Tiingo `1day` history. Passing an instrument UUID refreshes one instrument. The function is `SECURITY INVOKER`; schema access and function execution are revoked from `public`, `anon` and `authenticated`. `service_role` has explicit schema usage plus execution on the refresh entry point and every private helper in its call chain.

The implementation is maintained by:

- `supabase/migrations/20260821064000_implement_technical_indicators_v1.sql`
- `supabase/migrations/20260821070000_add_technical_indicator_interval_identity.sql`
- `supabase/migrations/20260821073000_grant_technical_indicator_helper_execution.sql`

## Source and output

The engine reads only:

- `public.market_observations`
- `public.data_providers`

Canonical source selection is Tiingo `interval_code = '1day'`. Twelve Data `quote` rows are excluded.

Each refresh writes eight indicator codes for both `1day` and `1week`:

- `sma_20`
- `sma_50`
- `sma_200`
- `ema_12`
- `ema_26`
- `rsi_14`
- `macd`
- `volatility_20`

The weekly series uses completed ISO-8601 UTC weeks derived from validated daily rows. The persisted weekly `observation_id` is the final daily source observation in the completed week.

## Idempotency and identity

Results use the deterministic key:

```text
(instrument_id, observation_id, interval_code, indicator_code, calculation_version)
```

`interval_code` is part of the key because a daily and weekly output may end on the same source observation. Repeating a refresh updates the existing versioned snapshot; it does not create a duplicate. A later source observation creates a new historical snapshot and leaves the earlier versioned result intact.

## Data quality and provenance

Persisted `values` JSONB records:

- calculation status;
- source provider and interval;
- inclusive source timestamp range;
- required and available periods;
- `adjusted_close` price basis;
- methodology version;
- MACD components where applicable;
- reason code and affected observation IDs for incomplete/data-quality output.

The engine fails closed. It emits null-valued status rows for insufficient or invalid history and never substitutes quote data, a raw closing price, an AI assessment, or a fabricated observation.

## Builder verification — 21 August 2026

The production refresh processed 71 instruments and persisted 1,136 `technical-engine-v1` rows:

| Measure | Result |
|---|---:|
| Instrument/interval pairs | 142 |
| Daily rows | 568 |
| Weekly rows | 568 |
| Rows per indicator code | 142 |
| Complete outputs | 1,121 |
| Explicit insufficient-history outputs | 15 |
| Duplicate deterministic keys | 0 |

A full retry again upserted 1,136 calculations while the persisted row count remained 1,136 with zero duplicate keys. Formula smoke tests independently confirmed SMA and EMA seeding, rising/flat Wilder RSI, constant-series MACD and zero constant-series volatility.

After Auditor rework, the exact trusted caller path was exercised with `SET LOCAL ROLE service_role`. A targeted NVDA refresh succeeded with one instrument and 16 complete upserts. A committed retry retained the same 16 row IDs, kept the total at 1,136 and produced zero duplicate deterministic keys. Privilege inspection confirmed that `service_role` can execute the entry point and all five private helpers while `anon` and `authenticated` have neither schema usage nor function execution.

## Current operational boundary

TECH-002 implements and populates the calculation engine. TECH-003 consumes these outputs through the independent [Technical Market Scoring Pipeline](technical-market-scoring-pipeline.md). Frontend exposure and recurring refresh ownership remain controlled by later project-plan items.
