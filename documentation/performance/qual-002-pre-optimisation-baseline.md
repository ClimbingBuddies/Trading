# QUAL-002 — Pre-optimisation performance baseline

**Measured:** 25 August 2026, Australia/Perth  
**Builder run:** `manual-20260825-1446-qual002`  
**Task:** `QUAL-002 — Add performance budgets/query monitoring`  
**Scope:** measurement only; no query, schema, frontend or trading optimisation was applied.

## Purpose

Capture a repeatable baseline before optimisation so later changes can be compared against real production-used query and network behaviour rather than assumptions.

## Production query surfaces inspected

### Markets overview

`app/markets/page.tsx` calls `getMarketsData()` from `lib/markets-data.ts`. That helper issues three concurrent Supabase/PostgREST reads:

1. active `instruments` ordered by asset type/symbol;
2. active `provider_instruments` with `data_providers` metadata;
3. `latest_market_status` for price/freshness/session state.

### Strategies owner view

`components/StrategyResultsClient.tsx` issues owner-scoped browser reads for:

1. `trading_strategies`;
2. `trading_test_runs` for the returned strategy IDs;
3. `trading_decision_evaluations` for the returned test-run IDs.

## SQL/PostgREST baseline

Source: live production `pg_stat_statements`, filtered to PostgREST-generated statements (`pgrst_source`) for the inspected dashboard tables/views.

| Surface | Calls observed | Mean execution | Max execution | Notes |
|---|---:|---:|---:|---|
| `latest_market_status` dashboard read | 4 | 65.399 ms | 98.956 ms | Current clear dashboard SQL hotspot in the inspected set. |
| `provider_instruments` + `data_providers` dashboard read | 89 | 1.719 ms | 12.397 ms | Production-used Markets provider metadata query. |
| `trading_test_runs` owner results read | 4 | 1.581 ms | 5.081 ms | Current owner strategy page query shape. |
| `trading_decision_evaluations` owner results read | 4 | 1.349 ms | 4.308 ms | Current owner strategy page query shape. |
| `trading_strategies` owner results read | 4 | 0.850 ms | 2.742 ms | Current owner strategy page query shape. |
| high-volume provider mapping read | 2,976 | 1.942 ms | 16.753 ms | Operational provider/instrument lookup; included as a broader loader/query reference point. |

One-off Builder/Auditor/backtest SQL statements were deliberately excluded from the dashboard baseline even when their execution times were much larger, because they are not representative page-query traffic.

## Production request / network baseline

Vercel production runtime logs for the current production deployment show uncached successful serverless requests for the representative dynamic routes:

- `/markets` — HTTP 200, cache MISS;
- `/opportunities` — HTTP 200, cache MISS;
- `/strategies` — HTTP 200, cache MISS.

A fresh production fetch of `/markets` returned HTTP 200 with `cache-control: private, no-cache, no-store, max-age=0, must-revalidate`, `x-vercel-cache: MISS`, and the expected current market data. The returned document references the current Next.js stylesheet and JavaScript chunk set.

### Important measurement boundary

The connected Vercel runtime/fetch APIs expose request status, route, cache state, deployment identity and response content, but do **not** expose browser Navigation Timing / Resource Timing start/end timestamps for every stylesheet/script/Supabase request. Therefore the evidence above is a production request/resource baseline, **not yet a complete browser network waterfall**. QUAL-002 must not claim its Definition of Done is complete until a repeatable browser/resource-timing capture is persisted.

## Initial monitoring interpretation

No optimisation has been applied. The current baseline suggests:

- `latest_market_status` is the first SQL surface worth investigating after QUAL-002 measurement is complete, because its observed mean/max execution time is materially above the other dashboard PostgREST statements;
- current strategy evidence reads are inexpensive at the database execution layer in the observed sample;
- network/browser optimisation decisions must wait until a true resource waterfall is captured rather than inferred from server request logs.

## Repeatability

SQL baseline can be repeated with `pg_stat_statements` by filtering PostgREST statements for the same named tables/views and recording calls, mean execution time and max execution time.

The remaining network baseline should use a browser-capable measurement path that records navigation/resource timing for a fixed representative route set, at minimum `/markets`, `/opportunities` and `/strategies`, with cache state and authentication state recorded. That capture should be persisted before any performance optimisation is proposed or applied.
