# MYDASH-003 — Producer evidence

**Gate:** Watchlists and relevant Opportunities  
**Role:** PRODUCER → independent AUDITOR  
**Status:** READY_FOR_AUDIT  
**Candidate branch:** `codex/mydash-003-watchlists-opportunities`  
**Pull request:** [#25](https://github.com/ClimbingBuddies/Trading/pull/25)  
**Functional candidate:** `1a6d0130735f69717c1963a84e64c5a5cbce6fc2` through `73265fdc6d0cec32386acb8ccd955fe3bea59d99`

## Bounded implementation

- Activated the private Watchlists tab from owner-scoped `watchlists` and `watchlist_items` rows.
- Activated relevant Opportunities from persisted Watchlist membership, stored user research interests, active Opportunity mappings and the latest deterministic independent Opportunity assessment per theme.
- Displays persisted prices, observation timestamps, delayed-data flags, theme exposure rationale, source dates, confidence, methodology identity and explicit data gaps.
- Preserves Recommendations, Portfolio Health and Decision Lab as empty later-gate states.
- Does not create Buy labels, blend assessment methodologies, write assessments, place trades or connect a broker.

## Authoritative source and data evidence

- Beginning repository commit: `5bd74070c7e3c6e947d4c7facea97661eef01a1f`.
- Source identities are recorded in `MYDASH-003_BUILD_ATTEMPT_STARTED` in the controller journal.
- Supabase project: `glvbqcplgjdfgjyknzsa`; latest migration remains `20260827141836_my_dashboard_interest_fk_indexes`.
- Beginning persisted counts: two Watchlists, two Watchlist items across two owners, zero user interests, seven active themes, 24 active Opportunity mappings and ten assessments on the latest assessment date, 27 August 2026.
- Existing Watchlist and Watchlist-item policies require a permanent authenticated owner and reject anonymous users. Public Opportunity source tables retain their deliberate read-only presentation boundary.
- No migration, schema, RLS, grant, assessment or production-data change was made.

## Checks

- `npm test`: 23/23 passed, including all MYDASH-002 regression checks and five MYDASH-003 gate checks.
- `git diff --check`: passed.
- Vercel preview deployment `dpl_Djdhcz9Heav4324LQ53wmLceUzX8` for exact functional commit `73265fdc6d0cec32386acb8ccd955fe3bea59d99` is `READY` and emitted `/my-dashboard` after successful TypeScript/build checks.
- The PR review's complete correction set is resolved in the exact candidate: MYDASH-002 exact counts/pagination were restored, mapped-theme counts now deduplicate `theme_id`, and exposure rows use a composite React key including `exposure_type`.
- Current production `/my-dashboard` was inspected and still exposes the signed-out permanent-user privacy boundary, six-tab shell and no-trading disclosure from MYDASH-002.
- The exact candidate Preview cannot render the route because Preview lacks `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The app fails closed with its load-error boundary; production variables were not copied into the unaudited Preview environment.

## Handoff fields

    task_id: MYDASH-003
    handoff_from: PRODUCER
    handoff_to: AUDITOR
    handoff_status: READY_FOR_AUDIT
    implementation_commit_or_range: 1a6d0130735f69717c1963a84e64c5a5cbce6fc2 through 73265fdc6d0cec32386acb8ccd955fe3bea59d99
    delivery_control_commits: 0de29089744b04983c175d1d27b6087717d8bc29; 050d565ebe399f03ed9438fe1666ea95c68c84ce; dde4135009265edbd1738f1fecf4294bb234892f; 92b2494e5d190cf1ec17214b810016c422bab8cb; 3e5aa7188138c150e7c251971bd78c746ca2364f; f50cf3df4d1120901223b943ffa176d4605c86d4
    files_changed: lib/my-dashboard-data.ts; components/MyDashboardClient.tsx; components/MyDashboardClient.module.css; tests/my-dashboard-gate-three.test.mjs; documentation/architecture/frontend-route-map.md; project plan; controller journal; this evidence record
    migrations_and_schema_effects: none
    rls_and_permission_evidence: existing owner-scoped Watchlist policies and anonymous rejection rechecked; no security boundary changed
    source_data_and_cutoffs: Supabase project glvbqcplgjdfgjyknzsa; persisted Opportunity data through 27 August 2026; exact beginning counts recorded above
    calculation_or_methodology_version: latest independent persisted Opportunity assessment selected by assessment_date DESC, updated_at DESC, id DESC; no new score or methodology
    tests_and_checks: npm test 23/23 PASS; git diff --check PASS; exact-candidate Vercel build READY
    routes_and_viewports_verified: production signed-out route and desktop shell inspected; exact Preview build READY but live route blocked by absent Preview public Supabase variables; responsive structures and keyboard contract covered statically
    privacy_and_cross_user_evidence: owner predicates, permanent-user Watchlist RLS and anonymous rejection rechecked; no authenticated two-user UI session available in this run
    documentation_impact: frontend route map updated; project plan and journal moved only to IN_REVIEW
    known_limitations: exact Preview live UI, authenticated owner-data rendering and direct 390 × 844 keyboard interaction remain for independent reproduction; no production promotion has occurred
    acceptance_criteria_evidence: owner-scoped read model, independent Opportunity lineage, explicit data gaps, no Buy conversion, no blended score and later-gate emptiness are implemented and tested; live responsive evidence remains explicit
    exact_next_action: independent Auditor reviews exact functional candidate 73265fdc6d0cec32386acb8ccd955fe3bea59d99 and either returns one complete correction set or marks MYDASH-003 DONE and promotes only MYDASH-004
