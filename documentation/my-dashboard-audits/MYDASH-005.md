# MYDASH-005 Audit Evidence

**Gate:** Explainable Recommendations  
**State:** READY FOR INDEPENDENT RE-AUDIT
**Updated:** 6 September 2026, 10:11 Australia/Perth

## Current local candidate

- Migration: `20260906093000_my_dashboard_recommendations_v1.sql` (`eccdd8ac232884e7684c53f407a90faf717536a83c30127e830518fd9e0dc710`)
- Dashboard client: `MyDashboardClient.tsx` (`06d2f7e6e7245149cde6b95f7b99de19bb85a399a23ce072b10474d6954709e7`)
- Dashboard styles: `MyDashboardClient.module.css` (`d84cc2cd915e5fbd9ebef37b13590f679352f608fb2566d6cad2c26baf61149a`)
- UI regression: `personal-recommendations-ui.test.mjs` (`569d9fc24ccb2d4ea8c748c291bd1501917747bb58ce188839eff1ffc6459103`)
- Deterministic methodology/adapters: `personal-recommendations.mjs` (`9d61c26cd71455797ce260a80b8752b386c5b71ced3728ceef99ef69be1bf9e5`)
- Generator regression: `personal-recommendations-generator.test.mjs` (`95c6fd617a728f1d59457b8decb5f3cc7f5b0158910ddb6d093c6d5c85f89454`)
- Migration regression: `personal-recommendations-migration.test.mjs` (`f96cc8b1edf4209b82a499da140334257d2aec41d6c983f0843833ff20aaf571`)

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

Publication retry at 10:02 Australia/Perth: a fresh fetch confirmed no divergence and local `main` is two bounded audit-control commits ahead through `393149abb50d34b7ace238be511444a2ce5ebfbf`. The execution safety reviewer rejected the exact shared-default-branch push pending a fresh explicit owner approval supplied as a trusted user instruction. No workaround was attempted; Producer correction work did not begin.

## Producer correction handoff — READY_FOR_RE_AUDIT

**Corrected:** 6 September 2026, 10:11 Australia/Perth
**Functional commit:** `934c9dc23e50d49adab1fb04e147c1952f451099`

- The private loader now selects Market AI chronology only from the owning succeeded run's non-null `gpt_market_runs.analysis_cutoff_time`; assessment creation time is not used as a fallback.
- Market AI and Technical rows now carry `calendarAvailable` and `missedSessions`. Freshness resolves one exact active Tiingo mapping, anchors at the latest canonical `1day` observation at or before each source cutoff, and counts distinct later observation session keys through the generation cutoff.
- Missing/ambiguous provider mappings and missing source-session anchors return unavailable/null freshness, so the unchanged generator excludes those sources from positive eligibility. No wall-clock or calendar-day substitution was added.
- The new concrete loader-to-generator regression proves current eligible sources succeed and calendar-unavailable, stale and future paths remain denied. Static migration assertions bind the authoritative cutoff and session query shape.
- Verification passed: focused recommendations 19/19, complete repository 127/127, direct TypeScript, palette compliance and `git diff --check` with line-ending notices only. No UI code changed, so browser proof was not repeated.
- The migration remains unapplied. Isolated database/RLS/RPC execution stays disclosed as deferred environment evidence; no hosted/private row, provider, deployment, Vercel, broker, trading or schedule state changed.

    task_id: MYDASH-005
    handoff_from: PRODUCER
    handoff_to: AUDITOR
    handoff_status: READY_FOR_RE_AUDIT
    implementation_commit_or_range: 53fedde20ecb0ec5a1f1e757c0ab124535b0809c..934c9dc23e50d49adab1fb04e147c1952f451099
    delivery_control_commits: commit containing this handoff, then publication confirmation recorded separately
    files_changed: recommendation migration, generator/migration regressions and canonical methodology/data-model documentation
    migrations_and_schema_effects: corrected unapplied service-only source loader only; no deployment or database mutation
    rls_and_permission_evidence: existing immutable owner boundaries unchanged; source-level service-only grants still pass; isolated execution deferred
    source_data_and_cutoffs: Market AI uses required run analysis_cutoff_time; Market AI/Technical freshness uses exact canonical Tiingo daily observation session keys through generated_at
    calculation_or_methodology_version: personal-research-relevance-v1 unchanged; clarified executable session-age resolution
    tests_and_checks: focused 19/19; complete repository 127/127; TypeScript, palette and diff checks passed
    routes_and_viewports_verified: no UI change; prior authenticated desktop and 390 x 844 evidence remains applicable
    privacy_and_cross_user_evidence: no private rows inspected; exact owner relevance filters and service-only boundary unchanged
    documentation_impact: canonical recommendation freshness and source-loader model updated
    known_limitations: migration unapplied; isolated database execution and final browser replay remain deferred evidence; no deployment/production verification authorised
    acceptance_criteria_evidence: authoritative cutoff, reproducible freshness and fail-closed unsupported paths corrected and regression-tested
    exact_next_action: publish this correction and handoff, then Auditor independently re-audits the complete MYDASH-005 candidate without implementing fixes

Publication completed at 10:13 Australia/Perth: functional correction `934c9dc23e50d49adab1fb04e147c1952f451099` and Producer handoff `b756221f6b6ed7008748388ac44fcf0ce56dd6c8` are verified on `origin/main`. The next run may independently re-audit this exact published candidate.

## Independent re-audit — PASS_WITH_ADVICE

**Audited:** 6 September 2026, 10:23 Australia/Perth
**Published candidate:** `2e8a68ad169afde77b9207fe9a9b6269029dd26d`

The Auditor independently reproduced the corrected loader and complete MYDASH-005 candidate. The prior P1 defects are closed: Market AI chronology requires the owning succeeded run's non-null `analysis_cutoff_time`, and Market AI/Technical evidence receives fail-closed freshness derived from one active Tiingo mapping plus distinct canonical `1day` observation keys through generation. The unchanged generator excludes unavailable, stale and future evidence, collapses dependency reuse and continues to deny Opportunity-only and one-indicator recommendation paths.

Fresh verification passed: 127/127 repository tests, direct TypeScript compilation, palette compliance and `git diff --check`. Static schema review reconfirmed append-only snapshots/sources/events, permanent-owner SELECT policies, anonymous/cross-owner denial, service-only loader/writer grants and the constrained feedback RPC. No UI code changed after the prior desktop, 390 x 844 and keyboard/error-state evidence.

Advice: the recommendation migration remains unapplied, so isolated executable RLS/RPC/atomicity proof and a fresh authenticated browser replay remain deferred evidence. This limitation is explicit, does not establish production behaviour and grants no deployment, hosted-database or production authority; it is not a concrete regression in the corrected local candidate.

    task_id: MYDASH-005
    handoff_from: AUDITOR
    handoff_to: PRODUCER
    handoff_status: PASS_WITH_ADVICE
    implementation_reviewed: 53fedde20ecb0ec5a1f1e757c0ab124535b0809c..934c9dc23e50d49adab1fb04e147c1952f451099, published through 2e8a68ad169afde77b9207fe9a9b6269029dd26d
    schema_and_rls_checks: source-level immutable ownership, grants, cutoff chronology, atomic writer and unsupported RPC denial reproduced; isolated execution deferred
    calculation_reproduction: concrete loader contract feeds personal-research-relevance-v1 with authoritative cutoff and canonical session freshness; eligible evidence succeeds and unavailable, stale and future evidence fails closed
    ui_and_accessibility_checks: unchanged current UI retains prior desktop, 390 x 844, keyboard, loading, empty and error evidence; fresh browser replay deferred
    tests_and_checks: repository 127/127; TypeScript, palette and diff checks passed
    gate_result: MYDASH-005 DONE
    successor: MYDASH-006 NEXT / PRODUCER
    exact_next_action: begin one bounded MYDASH-006 Producer phase from the approved distinct decision-clock contract

Publication deferred at 10:27 Australia/Perth. A fresh fetch confirmed no divergence and local audit commit `f7a806ae74f338121a413e4209a7a768338d7b83` is one commit ahead of `origin/main`. The execution safety reviewer rejected the exact push because fresh explicit owner approval is required for this external shared-default-branch mutation. No workaround or force-push was attempted. Retry publication before MYDASH-006 material work.
