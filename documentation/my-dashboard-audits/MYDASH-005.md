# MYDASH-005 Audit Evidence

**Gate:** Explainable Recommendations  
**State:** PRODUCER IN PROGRESS  
**Updated:** 6 September 2026, 08:45 Australia/Perth

## Current local candidate

- Migration: `20260906093000_my_dashboard_recommendations_v1.sql` (`67616658a3cd02eef5106f9686ce242f7c12df97531f5d066d175fe6a0337030`)
- Dashboard client: `MyDashboardClient.tsx` (`06d2f7e6e7245149cde6b95f7b99de19bb85a399a23ce072b10474d6954709e7`)
- Dashboard styles: `MyDashboardClient.module.css` (`d84cc2cd915e5fbd9ebef37b13590f679352f608fb2566d6cad2c26baf61149a`)
- UI regression: `personal-recommendations-ui.test.mjs` (`569d9fc24ccb2d4ea8c748c291bd1501917747bb58ce188839eff1ffc6459103`)
- Deterministic methodology/adapters: `personal-recommendations.mjs` (`30aa28dd25b2a8114ad95d1ae1eb7750a3219de269b2535a6b8c35a96fff8824`)
- Generator regression: `personal-recommendations-generator.test.mjs` (`695cf36c7b1a29a2565246a82eda0d80012b9c422081912d97a28740ca49aa1e`)
- Migration regression: `personal-recommendations-migration.test.mjs` (`f707cbec7ff9b4b1d7fb089823bf70986ccfdfbc2cb7148629aba2f7291a9135`)

## Producer evidence

- Schema source proves immutable snapshot/source tables, composite parent-owner foreign keys, source cutoff chronology, category constraints without Buy/Sell, explicit evidence families and append-only events. Database triggers reject update/delete on all three recommendation relations, including privileged application writes.
- Browser roles receive SELECT only on all recommendation tables. `append_personal_recommendation_event_v1` derives `auth.uid()`, rejects anonymous/cross-owner/unsupported calls and permits only watch, dismiss or feedback; paper-decision capture is withheld until MYDASH-006.
- Recommendations UI validates snapshot and provenance response shape and chronology, refuses to render a snapshot without source lineage, loads snapshot/source/event evidence together, separates the four source families and displays thesis, horizon, confidence, cutoff, validity, methodology, model identity, source hash, principal risks and quality limitations.
- Empty/error copy denies recommendation invention from Opportunity alone, momentum, one indicator, stale evidence or unsupported model opinion. Feedback changes only local event presentation and calls the append RPC; it does not update recommendation or assessment rows.
- `personal-research-relevance-v1` deterministically requires private personal relevance, exact source identity/cutoff/methodology, cutoff chronology and approved horizon freshness. It collapses reused dependencies, excludes failed/partial/stale/calendar-unverifiable rows from positive eligibility, denies insufficient/Opportunity-only/one-indicator paths, and hashes the canonical separated evidence payload.
- Persistence requires an atomic trusted adapter: insert-on-conflict-do-nothing, identical-conflict idempotency and a hard error for divergent immutable snapshot/source evidence. Browser code has no access to this boundary.
- The concrete private writer is executable only by `service_role`, persists snapshot plus sources atomically, locks conflict reads, compares normalized immutable database values, and retains dependency keys plus eligibility decisions. Trusted loading rejects cross-owner relevance and future evidence before generation; concrete Supabase query selection remains the next increment.
- Verification passed: focused 19/19, repository 122/122, TypeScript, palette compliance and `git diff --check` (existing line-ending notices only).
- Localhost at 1280 px and 390 × 844 selected the Recommendations tab without document overflow or captured browser warning/error logs. The authenticated environment correctly showed the isolated Recommendations error state because the new local migration has not been applied to any database. No private value was entered, mutated or retained as evidence.

## Outstanding before Producer handoff

- Implement concrete Supabase-backed owner relevance and eligible evidence selection behind the trusted loading contract.
- Execute database RLS/RPC/generator isolation tests only if an isolated local target becomes available; otherwise retain the unavailable environment proof once as deferred evidence.
- Re-run complete desktop/narrow-screen/keyboard/loading/empty/error verification against the finished local candidate, then hand off to an independent Auditor.
