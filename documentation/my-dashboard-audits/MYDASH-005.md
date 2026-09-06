# MYDASH-005 Audit Evidence

**Gate:** Explainable Recommendations  
**State:** READY FOR INDEPENDENT AUDIT
**Updated:** 6 September 2026, 09:18 Australia/Perth

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
- The final accessibility increment marks loading as a busy live status, exposes the empty shortlist as status, and gives the unavailable-state retry a 44 px keyboard target with a visible focus ring. Focused source verification passed 5/5. A fresh browser replay was unavailable because Windows computer control failed sandbox initialization and the repository browser CLI is not installed; this did not erase the prior authenticated desktop/narrow error-state observation and is disclosed for the Auditor.

## Producer handoff

    task_id: MYDASH-005
    handoff_from: PRODUCER
    handoff_to: AUDITOR
    handoff_status: READY_FOR_AUDIT
    implementation_commit_or_range: 53fedde20ecb0ec5a1f1e757c0ab124535b0809c..5069979cec1660822abd6005f06a7ad3b23077e3
    delivery_control_commits: ea143a33a02424b36133f5ad671df33052b3fe82 plus the commit containing this handoff, verified in automation memory after publication
    files_changed: recommendation migration, deterministic generator/adapters, dashboard client/styles and focused regression suites
    migrations_and_schema_effects: one unapplied immutable owner-scoped recommendation snapshot/source/event migration; private service-role source loader/writer; constrained authenticated event append
    rls_and_permission_evidence: source-level role matrix, owner predicates, composite ownership, append-only triggers and unsupported RPC denials pass; isolated execution remains deferred
    source_data_and_cutoffs: explicit owner relevance; completed cutoff-bounded Market AI, Technical and Opportunity sources; exact identities and chronology retained; no private rows inspected
    calculation_or_methodology_version: personal-research-relevance-v1 with canonical SHA-256 separated-evidence identity
    tests_and_checks: final focused 5/5; complete repository 126/126; TypeScript, palette and diff checks passed
    routes_and_viewports_verified: prior authenticated localhost 1280 px and 390 × 844 error state passed; loading/empty/error/focus/responsive contracts freshly source-tested; final browser replay unavailable and disclosed
    privacy_and_cross_user_evidence: browser reads are owner-scoped and select-only; writer is service-role-only; anonymous/cross-owner event paths denied; isolated database execution deferred
    documentation_impact: project plan, audit evidence, controller journal and automation memory reconciled
    known_limitations: migration not applied; no isolated database execution; final-run browser tooling unavailable; no deployment or production verification authorised; final commits remain local because the remote push was safety-review blocked
    acceptance_criteria_evidence: immutable snapshots, lineage/cutoffs, methodology separation, risk/limitations display, feedback boundaries and unsupported-path denial mapped above
    exact_next_action: publish and verify this exact local candidate, then independently audit it; do not implement fixes in the audit run

Publication correction: commits `5069979cec1660822abd6005f06a7ad3b23077e3`, `d7a4d7ab55a259d43ab627ed2c0cd5ca53b306c4` and `53630998e5df8437910526e57a6a35e94bf2d56a` are locally verified but not yet published. Retry the authorised `origin/main` push before auditing or starting new material work.

Publication retry at 09:32 Australia/Perth: a fresh fetch confirmed no remote divergence and `origin/main` still at `ea143a33a02424b36133f5ad671df33052b3fe82`. The safety reviewer rejected the exact default-branch push pending a new explicit owner approval and prohibited workaround execution. The candidate remains unaudited and unchanged.

Publication retry at 09:42 Australia/Perth: a fresh fetch again confirmed no remote divergence and the same remote identity. The safety reviewer rejected publishing the six bounded local commits to the shared default branch pending explicit owner approval accepted for that exact action, and prohibited workaround execution. The candidate remains unaudited and unchanged.

Publication completed at 09:47 Australia/Perth after Travis explicitly approved the exact GitHub action: a fresh fetch confirmed no divergence, the seven bounded commits were pushed without force, and `origin/main` was confirmed at `869dec0eda772299a7f2cfd5b80aab17e112d303`. The independent audit may now evaluate this exact published candidate.

## Independent audit — REWORK_REQUIRED

**Audited:** 6 September 2026, 09:55 Australia/Perth
**Published candidate:** `869dec0eda772299a7f2cfd5b80aab17e112d303`

The Auditor independently reproduced 126/126 repository tests, TypeScript and palette compliance. Static reconciliation of the concrete service-only loader with `personal-research-relevance-v1` found a substantive integration failure that the current tests do not cover.

1. **P1 — Concrete persisted sources cannot qualify.** The SQL loader emits no `calendarAvailable` or `missedSessions` properties for Market AI or Technical evidence. The generator explicitly treats either missing property as `STALE_SOURCE:CALENDAR_UNAVAILABLE` and sets `qualifiesPositive` false. Passing the actual loader response into the generator therefore cannot meet the required qualifying dependency count.
2. **P1 — Market AI uses the wrong cutoff clock.** The loader uses `gpt_market_assessments.created_at` as `source_cutoff` instead of joining and requiring `gpt_market_runs.analysis_cutoff_time`, the approved authoritative cutoff. Exact lineage and look-ahead protection are therefore not established for the persisted path.

Complete correction set: use the authoritative Market AI analysis cutoff; derive and pass reproducible trading-session freshness inputs for Market AI and Technical sources at the requested generation cutoff; fail closed when calendar evidence is unavailable; and add an integration regression that feeds the concrete loader response into `buildRecommendationCandidate`, covering current eligible, calendar-unavailable, stale and future evidence. Existing isolated database and final browser limitations remain deferred and did not cause this result.

    task_id: MYDASH-005
    handoff_from: AUDITOR
    handoff_to: PRODUCER
    handoff_status: REWORK_REQUIRED
    audit_record: documentation/my-dashboard-audits/MYDASH-005.md
    implementation_commit_or_range_reviewed: 53fedde20ecb0ec5a1f1e757c0ab124535b0809c and 5069979cec1660822abd6005f06a7ad3b23077e3, published through 869dec0eda772299a7f2cfd5b80aab17e112d303
    deployment_reviewed: none; migration remains unapplied and deployment/production changes were not authorised
    schema_and_rls_checks: source-level immutable/RLS/grant boundaries retained; executable isolated database proof remains deferred
    calculation_reproduction: loader-to-generator reconciliation fails because required session-freshness inputs are absent and Market AI uses row creation time instead of analysis cutoff
    ui_and_accessibility_checks: existing source tests pass; no new browser replay because the audit failure is upstream of persisted recommendation availability
    complete_correction_set: authoritative Market AI cutoff; reproducible calendar freshness fields for Market AI and Technical evidence; fail-closed unavailable/stale handling; concrete loader-to-generator integration regression
    known_limitations: isolated database execution and final browser replay remain deferred evidence
    exact_next_action: Producer implements the complete correction set, reruns full acceptance checks and returns the whole MYDASH-005 candidate for independent re-audit

Publication of this handback is deferred. The bounded audit/control commit is `6fc142a458903b2e74868ec8e0e6ba8dd4450dda`; a fresh fetch found no divergence, but the execution safety reviewer rejected the exact push because it classified `origin` as an unverified external destination. No workaround was attempted. Retry publication before the Producer correction.
