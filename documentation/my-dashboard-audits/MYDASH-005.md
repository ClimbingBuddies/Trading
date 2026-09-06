# MYDASH-005 Audit Evidence

**Gate:** Explainable Recommendations  
**State:** PRODUCER IN PROGRESS  
**Updated:** 6 September 2026, 09:04 Australia/Perth

## Current local candidate

- Migration: `20260906093000_my_dashboard_recommendations_v1.sql` (`b44d47206fecb0fe6e72551de08bbf23f572c0fcbe05f4f0d76920769fcd9ef0`)
- Dashboard client: `MyDashboardClient.tsx` (`06d2f7e6e7245149cde6b95f7b99de19bb85a399a23ce072b10474d6954709e7`)
- Dashboard styles: `MyDashboardClient.module.css` (`d84cc2cd915e5fbd9ebef37b13590f679352f608fb2566d6cad2c26baf61149a`)
- UI regression: `personal-recommendations-ui.test.mjs` (`569d9fc24ccb2d4ea8c748c291bd1501917747bb58ce188839eff1ffc6459103`)
- Deterministic methodology/adapters: `personal-recommendations.mjs` (`9d61c26cd71455797ce260a80b8752b386c5b71ced3728ceef99ef69be1bf9e5`)
- Generator regression: `personal-recommendations-generator.test.mjs` (`ad81459e44feff2f7af9652ba9af2f138ab57a510a76ede6b270a5404f6a5efc`)
- Migration regression: `personal-recommendations-migration.test.mjs` (`2a7b9ec0064c3f4d1a383435f79ef4e4ddc33d03375dcd4f177a73b0d41449be`)

## Producer evidence

- Schema source proves immutable snapshot/source tables, composite parent-owner foreign keys, source cutoff chronology, category constraints without Buy/Sell, explicit evidence families and append-only events. Database triggers reject update/delete on all three recommendation relations, including privileged application writes.
- Browser roles receive SELECT only on all recommendation tables. `append_personal_recommendation_event_v1` derives `auth.uid()`, rejects anonymous/cross-owner/unsupported calls and permits only watch, dismiss or feedback; paper-decision capture is withheld until MYDASH-006.
- Recommendations UI validates snapshot and provenance response shape and chronology, refuses to render a snapshot without source lineage, loads snapshot/source/event evidence together, separates the four source families and displays thesis, horizon, confidence, cutoff, validity, methodology, model identity, source hash, principal risks and quality limitations.
- Empty/error copy denies recommendation invention from Opportunity alone, momentum, one indicator, stale evidence or unsupported model opinion. Feedback changes only local event presentation and calls the append RPC; it does not update recommendation or assessment rows.
- `personal-research-relevance-v1` deterministically requires private personal relevance, exact source identity/cutoff/methodology, cutoff chronology and approved horizon freshness. It collapses reused dependencies, excludes failed/partial/stale/calendar-unverifiable rows from positive eligibility, denies insufficient/Opportunity-only/one-indicator paths, and hashes the canonical separated evidence payload.
- Persistence requires an atomic trusted adapter: insert-on-conflict-do-nothing, identical-conflict idempotency and a hard error for divergent immutable snapshot/source evidence. Browser code has no access to this boundary.
- The concrete private writer is executable only by `service_role`, persists snapshot plus sources atomically, locks conflict reads, compares normalized immutable database values, and retains dependency keys plus eligibility decisions. Trusted loading rejects cross-owner relevance and future evidence before generation.
- Concrete source selection is executable only by `service_role`. It derives relevance from the exact owner’s watchlists, active portfolios and explicit interests, and selects only succeeded independent Market AI, complete Technical and structurally complete Opportunity records at or before the requested cutoff. Opportunity evidence is explicitly labelled as non-Buy evidence.
- A source-level regression found the event RPC referring to trusted-writer-only parameters; the validation was moved into the private writer, leaving the browser RPC constrained to owner events.
- Verification passed: focused 22/22, repository 125/125, TypeScript and `git diff --check` (existing line-ending notices only).
- GitHub publication verified: functional/control commit `53fedde20ecb0ec5a1f1e757c0ab124535b0809c` is present on `origin/main`; unrelated untracked owner files and generated cache output were excluded.
- Localhost at 1280 px and 390 × 844 selected the Recommendations tab without document overflow or captured browser warning/error logs. The authenticated environment correctly showed the isolated Recommendations error state because the new local migration has not been applied to any database. No private value was entered, mutated or retained as evidence.

## Outstanding before Producer handoff

- Execute database RLS/RPC/generator isolation tests only if an isolated local target becomes available; otherwise retain the unavailable environment proof once as deferred evidence.
- Re-run complete desktop/narrow-screen/keyboard/loading/empty/error verification against the finished local candidate, then hand off to an independent Auditor.
