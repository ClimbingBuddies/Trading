# QUAL-002 — Pre-optimisation performance baseline

**Measured:** 25 August 2026, Australia/Perth  
**Builder runs:** `manual-20260825-1446-qual002` through `manual-20260825-1607-qual002`  
**Task:** `QUAL-002 — Add performance budgets/query monitoring`  
**Scope:** measurement and monitoring only; no query, schema, trading-decision or application optimisation was applied.

## Purpose

Capture a repeatable baseline before optimisation so later changes can be compared against real production-used SQL/query and browser-network behaviour rather than assumptions.

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

Source: live production `pg_stat_statements`, filtered to PostgREST-generated statements (`pgrst_source`) for the inspected dashboard tables/views. The initial baseline was captured before any optimisation and was re-read during the final Builder run; no optimisation occurred between captures.

| Surface | Calls observed at final read | Mean execution | Max execution | Interpretation |
|---|---:|---:|---:|---|
| `latest_market_status` dashboard read | 8 | 78.036 ms | 121.355 ms | Clear SQL hotspot in the inspected dashboard set. |
| `provider_instruments` + `data_providers` dashboard read | 93 | 1.849 ms | 12.397 ms | Production-used Markets provider metadata query. |
| `trading_test_runs` owner results read | 14 | 1.666 ms | 6.692 ms | Current owner strategy page query shape. |
| `trading_decision_evaluations` owner results read | 14 | 1.510 ms | 6.617 ms | Current owner strategy page query shape. |
| `trading_strategies` owner results read | 14 | 0.786 ms | 3.826 ms | Current owner strategy page query shape. |
| high-volume provider mapping read | 2,981 | 1.944 ms | 16.753 ms | Broader loader/query reference point. |

One-off Builder/Auditor/backtest SQL statements are deliberately excluded from the dashboard baseline even when their execution times are much larger, because they are not representative page-query traffic.

## Production browser waterfall instrumentation

QUAL-002 added a bounded, privacy-conscious production measurement path:

- `components/PerformanceWaterfallReporter.tsx` uses the browser Navigation Timing and Resource Timing APIs only on `/markets`, `/opportunities` and `/strategies`;
- it waits until page load, then records the navigation timing and at most 100 resource entries;
- resource URLs are reduced to origin + pathname, stripping query strings and fragments;
- `app/api/performance-waterfall/route.ts` validates the payload and writes a structured `[performance-waterfall-v1]` record to Vercel runtime logs;
- no cookies, access tokens, user IDs, email addresses or query-string values are logged.

Production deployment `dpl_HEwx9WtekyUE13AQiXbkBWvcHs4K` at GitHub commit `622ed826c65ada0bd326f3afdfc2829f40d8bb6d` is `READY`. Its build passed palette compliance, Next.js compilation and TypeScript, and contains `/api/performance-waterfall` as a dynamic route.

## Genuine production browser waterfall baseline

Source: real browser navigation samples received by the deployed `/api/performance-waterfall` receiver on 25 August 2026. All three samples are `performance-waterfall-v1`, navigation type `navigate`, user-agent class `desktop_or_other`, and were produced by normal production browsing rather than synthetic HTML fetches.

| Route | Captured UTC | Response start | Response end | DOM interactive | DOM content loaded | Load end / duration | Document transfer | Resource count |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| `/markets` | 08:04:17.575Z | 57.4 ms | 1,331.4 ms | 1,416.7 ms | 1,417.1 ms | **1,448.9 ms** | 7,868 B | 19 |
| `/opportunities` | 08:04:23.265Z | 63.6 ms | 1,807.1 ms | 1,840.8 ms | 1,841.3 ms | **1,901.0 ms** | 20,000 B | 16 |
| `/strategies` | 08:04:52.718Z | 66.6 ms | 335.0 ms | 396.8 ms | 397.3 ms | **412.5 ms** | 3,385 B | 25 |

The `/markets` production GET corresponding to the measurement window was observed as HTTP 200 with Vercel cache `MISS`. Earlier fixed-route production request evidence also recorded the representative dynamic routes as successful cache-MISS requests. The browser telemetry receiver POSTs themselves are intentionally non-cacheable and returned HTTP 204.

### Resource-waterfall interpretation

The captured resources are dominated by current Next.js CSS and JavaScript chunks. The resource timing records preserve start time, duration, initiator type and body/transfer sizes, allowing later before/after comparison without exposing URL query parameters.

The first complete sample shows:

- `/opportunities` is the slowest of the three representative full navigations at 1.901 s;
- `/markets` completes in 1.449 s while its `latest_market_status` SQL remains the clearest database hotspot;
- `/strategies` shell/navigation completes quickly at 0.413 s, while the separately measured owner-scoped PostgREST reads remain low-cost at the database layer;
- no optimisation should be chosen from a single browser sample alone; these values establish a regression baseline and investigation threshold, not a user-facing SLA.

### Authentication measurement boundary

The telemetry deliberately does not record identity or session data. Therefore the `/strategies` sample proves the route's browser navigation/resource waterfall but does not assert a specific signed-in versus signed-out session state. Owner-scoped strategy SQL timing is independently covered by the production PostgREST baseline above. If future optimisation is specifically targeted at post-authentication client loading, a separate privacy-preserving authenticated/unauthenticated boolean measurement may be added and audited before use.

## Initial pre-optimisation performance budgets

These are conservative **regression/investigation budgets**, not service-level objectives. They are deliberately above the measured baseline to avoid treating ordinary network variance as a failure. A breach means investigate and collect more samples before optimising.

### Browser navigation budgets

| Route | Measured duration | Initial duration budget | Measured resources | Initial resource-count budget |
|---|---:|---:|---:|---:|
| `/markets` | 1,448.9 ms | **2,000 ms** | 19 | **30** |
| `/opportunities` | 1,901.0 ms | **2,500 ms** | 16 | **25** |
| `/strategies` | 412.5 ms | **1,000 ms** | 25 | **35** |

For comparable desktop production `navigate` samples, response start should normally remain below **500 ms** on all three routes. This is an investigation threshold rather than a guarantee.

### SQL/query budgets

| Surface | Measured mean / max | Initial regression budget |
|---|---|---|
| `latest_market_status` dashboard read | 78.036 / 121.355 ms | mean <= **100 ms** and max <= **150 ms** |
| Markets provider metadata read | 1.849 / 12.397 ms | mean <= **5 ms** and max <= **25 ms** |
| Strategy owner result reads | <=1.666 / <=6.692 ms | each mean <= **5 ms** and max <= **15 ms** |
| high-volume provider mapping reference | 1.944 / 16.753 ms | mean <= **5 ms** and max <= **25 ms** |

The budgets should be revised only after enough additional comparable samples exist to justify a stronger percentile-based threshold.

## Monitoring and repeatability

### SQL monitoring

Repeat the production database baseline using `pg_stat_statements`, filtering PostgREST statements for the same named tables/views and recording calls, mean execution time and max execution time. Keep one-off audit/backtest SQL separate from page-query traffic.

### Browser/network monitoring

1. Visit production `/markets`, `/opportunities` and `/strategies` in a normal JavaScript-enabled browser.
2. Allow the page load to complete and remain open for at least one second.
3. Query Vercel runtime logs for `[performance-waterfall-v1]` on the active production deployment.
4. Compare navigation duration, response start, resource count and material resource durations against the baseline/budgets above.
5. Preserve the route, deployment commit, navigation type and `userAgentClass`; do not infer authentication identity from telemetry.

The instrumentation is intentionally passive: it records genuine traffic when these pages are used. Absence of a sample is not evidence that a route is fast or slow.

## Pre-optimisation conclusion

QUAL-002 now has both required evidence classes before optimisation:

- measured production SQL/query timing for representative dashboard and owner-scoped data access;
- measured genuine browser Navigation Timing / Resource Timing waterfalls for `/markets`, `/opportunities` and `/strategies`.

No optimisation was applied while establishing this baseline. The first candidate for later investigation is `latest_market_status`, but any optimisation belongs to a separately authorised task and should be evaluated against this preserved baseline rather than performed inside QUAL-002.
