# Market Convergence Population Pipeline

**Methodology:** `market-convergence-v1`  
**Live Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Last verified:** 22 August 2026

## Purpose

This pipeline persists Market Convergence only after the independent Technical Engine and independent AI Market Assessment have each produced an eligible result for the same instrument.

The canonical calculations and labels are defined in the [Market Convergence Specification](../specifications/market-convergence-specification.md). This document describes the trusted implementation and its verified persistence contract.

## Trusted execution surface

The implementation is the private PostgreSQL function:

```sql
market_convergence.refresh_v1(p_instrument_id uuid default null)
```

- The function is owned by `postgres`, runs as `security invoker`, and uses `search_path = pg_catalog`.
- Every table reference is schema-qualified.
- Only `service_role` has schema usage and function execution.
- `anon` and `authenticated` cannot access the private schema or execute the function.
- The destination table remains read-only to clients: `anon` and `authenticated` have `SELECT` only, while `service_role` has trusted write privileges.
- Row-level security remains enabled on `public.market_convergence_assessments`.

Trusted full refresh:

```sql
select *
from market_convergence.refresh_v1(null);
```

Trusted single-instrument refresh:

```sql
select *
from market_convergence.refresh_v1('<instrument-uuid>'::uuid);
```

The returned `rows_changed` count reports inserts or material payload changes. An unchanged retry returns zero.

## Eligible inputs

### Technical branch

The pipeline selects the latest eligible row per instrument from `public.market_scores` where:

- `methodology_version = 'technical-score-v1'`;
- `score_status` is `complete` or `partial`;
- `overall_score` and `confidence_score` are present and within 0–100;
- `calculated_at` is not in the future.

Selection is deterministic:

1. `score_date desc`;
2. `calculated_at desc`;
3. `id desc`.

### AI Market branch

The pipeline independently selects the latest eligible row per instrument from `public.gpt_market_assessments` where:

- `methodology_version = 'independent-market-ai-v1'`;
- `technical_engine_input_used is false`;
- `score` and `confidence` are present and within 0–100;
- `rating` is one of Strong Buy, Buy, Hold, Sell or Strong Sell;
- `created_at` is not in the future.

Selection is deterministic:

1. `assessment_date desc`;
2. `created_at desc`;
3. `assessment_id desc`.

Only instruments with one eligible result from both branches are populated.

## Persisted contract

For every eligible pair, the pipeline writes one `public.market_convergence_assessments` row with:

- `assessment_date` equal to the later source date;
- mandatory `technical_score_id` and `ai_assessment_id` lineage;
- immutable source score, signal and confidence snapshots;
- the canonical equal-weight convergence score;
- the canonical confidence penalty and cap;
- the canonical `mixed` / `conflict` precedence and convergence label;
- a deterministic summary containing both branch results, combined result, agreement class, score gap, source dates, source methodologies, separation from Opportunity Assessment, and the non-advice disclaimer;
- `methodology_version = 'market-convergence-v1'`.

A database constraint prevents incomplete `market-convergence-v1` rows from being stored. Identity remains:

```text
(instrument_id, assessment_date, methodology_version)
```

The refresh uses an upsert against that identity and updates only when the persisted payload differs. It does not read prior convergence rows as analytical inputs.

## Independence boundary

Permitted inputs are limited to:

- `public.market_scores`;
- `public.gpt_market_assessments`.

The implementation requires the AI independence flag and does not read Opportunity Assessment, Opportunity Convergence, prior Market Convergence conclusions, or frontend state.

## Live Builder verification

A trusted `service_role` refresh on 22 August 2026 produced:

- 30 eligible Technical/AI instrument pairs;
- 30 persisted `market-convergence-v1` rows;
- 30 distinct instruments;
- zero missing lineage values;
- zero missing output values;
- zero out-of-range scores or confidence values;
- zero invalid labels;
- zero duplicate identities;
- zero independent formula or selected-source mismatches.

A full retry reported `rows_changed = 0`. All 30 row identities and calculation payloads remained unchanged.

Verified label distribution:

| Label | Rows |
|---|---:|
| `strong_bullish` | 7 |
| `moderate_bullish` | 4 |
| `neutral` | 12 |
| `moderate_bearish` | 1 |
| `mixed` | 3 |
| `conflict` | 3 |

Client privilege verification confirmed:

- `service_role`: execute and write allowed;
- `anon`: read allowed, execute/write denied;
- `authenticated`: read allowed, execute/write denied.

## Deliberate next-stage boundaries

CONV-002 establishes real current-state persistence only. The following remain separate project-plan items:

- convergence history, stale-input policy and retry rules: CONV-003;
- frontend presentation of Technical, AI and Convergence results as distinct views: CONV-004.
