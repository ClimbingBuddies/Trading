# MYDASH-003 — Producer evidence and independent audit

**Gate:** Watchlists and relevant Opportunities  
**Role:** PRODUCER → independent AUDITOR → PRODUCER
**Status:** PRODUCER_BLOCKED_ON_AUTHENTICATED_UI_EVIDENCE
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

## Independent audit — 28 August 2026

**Result:** `REWORK_REQUIRED`

The source and persisted-data checks passed, but the gate cannot pass without the controller's mandatory live private-workspace and responsive interaction evidence. The exact candidate Preview is not runnable because its public Supabase configuration is absent, so the Auditor could not inspect either authenticated tab with either permanent-user state or reproduce desktop, 390 × 844 and keyboard/focus behaviour. A successful build and static source checks do not replace those acceptance requirements.

### Sources and exact identities used

- GitHub default branch at start: `0776915577d34cf42a24e4e447cebbb4dd6ce0a7`.
- Controller blob: `aa7855a2d3f4246ffa4d5808eec12dcd1f313313`.
- Project-plan blob: `ba9c42cd667bae82730e8d2fe48d40d879d0b036`.
- Opening journal blob: `46ed4de1cdb78268d8ac0d1b6de9177a25228605`.
- Opening MYDASH-003 audit blob: `83236791260b69874b692556e17305b75535ca54`.
- Approved contract blob: `bd1d1556015b12967cb57c39f3922f92019a0cc4`.
- Development-workflow blob: `e04dfa048b5b42767db4feb43d86f3738cd3c07c`.
- Platform-architecture blob: `4f9ee606554f14ee3ef4dd2ac6431fc00461e143`.
- Frontend-route-map opening blob: `d405a1c5329db4ecf6edd45122d562b1aed94407`.
- Supabase-data-model blob: `596282e1d8ac4a99e19eea537c3ba451c8dec72e`.
- PR #25 opening head: `66652239e1906b1904c80312f3c32bb8deaff5fa`; exact functional candidate reviewed: `73265fdc6d0cec32386acb8ccd955fe3bea59d99`.
- Candidate source blobs: data loader `937be9af4ac928027dac6d694b03f9d9b201ef28`; dashboard component `852db0a02fc4f0bdd44e7824118f360be35f0bea`; stylesheet `f9499c6c088dea14c062e86b5a003842cbe74c2d`; gate-three test `69f3bb88a6067c3566c04972aca307411612f679`.
- Supabase project: `glvbqcplgjdfgjyknzsa`; latest migration: `20260827141836_my_dashboard_interest_fk_indexes`.
- Exact candidate deployment: `dpl_Djdhcz9Heav4324LQ53wmLceUzX8`, `READY`, commit `73265fdc6d0cec32386acb8ccd955fe3bea59d99`.
- Production deployment inspected: `dpl_GBZZ3ofau57zXDXnt6WKPSY4QkN2`, commit `0776915577d34cf42a24e4e447cebbb4dd6ce0a7`; production still contains MYDASH-002 only.

### Reproduced checks

- `npm test`: 23/23 passed independently.
- Vercel exact-candidate build: compiled, TypeScript passed, `/my-dashboard` emitted and deployment became `READY`.
- PR findings: exact private counts/pagination restored; theme counts deduplicate `theme_id`; exposure keys include `exposure_type`.
- Supabase truth: two Watchlists across two owners, two Watchlist items, zero interests, seven active themes, 24 active mappings and ten assessments on the latest assessment date, 27 August 2026.
- RLS impersonation: permanent user A saw only A's Watchlist rows; permanent user B saw only B's Watchlist and item rows; neither saw the other owner's Watchlist. An authenticated anonymous identity saw zero private rows, and the signed-out role lacked private-table SELECT permission.
- Opportunity lineage remains read-only and independent. The candidate reads active exposure mappings plus the deterministic latest assessment ordered by assessment date, update time and ID. It creates no Buy label or blended score.
- Current relevant Watchlist instruments each have one row at their latest eligible quote/daily timestamp, so the displayed latest persisted price is reproducible from current data.
- Production signed-out browser state shows the permanent-user sign-in boundary and no-trading disclosure.
- Candidate Preview browser state fails closed with `Missing required Supabase frontend configuration: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.`

### Complete correction set

1. Make the exact MYDASH-003 candidate independently runnable in a non-production Vercel deployment by providing only the public Supabase URL and publishable key to the Preview environment. Do not expose a service-role key or weaken RLS.
2. Provide bounded permanent test identities or an equivalent safe authenticated test path, with distinct owner-scoped Watchlist data, so the next Auditor can reproduce both users' Watchlists and relevant Opportunities without seeing the other owner's rows. Preserve signed-out and anonymous denial.
3. On the runnable candidate, verify desktop and direct 390 × 844 rendering, tab Arrow Left/Right and Home/End focus behaviour, Watchlists and Opportunities loading/empty/error/data-gap states, provenance labels, deep links and the no-recommendation boundary.
4. Reconcile PR #25 with the current `main` control state without changing the functional candidate, then re-run the complete automated suite and Vercel build, record the exact deployment and functional commit, and return the candidate to independent audit. Do not merge PR #25 before that pass.

No source defect was established in this audit, and the Auditor made no implementation, schema, data or deployment-promotion change.

### Auditor handback

    task_id: MYDASH-003
    handoff_from: AUDITOR
    handoff_to: PRODUCER
    handoff_status: REWORK_REQUIRED
    audit_record: documentation/my-dashboard-audits/MYDASH-003.md
    implementation_commit_or_range_reviewed: 1a6d0130735f69717c1963a84e64c5a5cbce6fc2 through 73265fdc6d0cec32386acb8ccd955fe3bea59d99
    deployment_reviewed: dpl_Djdhcz9Heav4324LQ53wmLceUzX8 exact candidate READY but unusable at runtime; production dpl_GBZZ3ofau57zXDXnt6WKPSY4QkN2 remains MYDASH-002
    schema_and_rls_checks: two permanent-user SQL impersonations isolated owner rows; authenticated anonymous saw zero private rows; signed-out role has no private SELECT grant; no schema change
    calculation_reproduction: not applicable; Opportunity relevance and deterministic latest-assessment selection reproduced without a blended score or Buy conversion
    ui_and_accessibility_checks: production signed-out boundary passed; candidate live authenticated, desktop, 390 × 844 and keyboard checks blocked by absent Preview public Supabase configuration
    complete_correction_set: configure a safe runnable Preview; supply bounded two-user authenticated test access; reproduce live responsive, keyboard, state, provenance and privacy checks; reconcile PR #25 with current main; rerun tests/build and freeze exact identities
    known_limitations: source/static checks passed, but the mandatory live private UI evidence is absent
    exact_next_action: Producer completes only this correction set for MYDASH-003 and returns the exact runnable candidate to an independent Auditor

## Bounded Producer rework — 28 August 2026

The public-configuration defect is corrected without changing database permissions or exposing a privileged credential:

- PR #25 now tracks only `NEXT_PUBLIC_SUPABASE_URL` and the modern `sb_publishable_…` key required by browser builds. The publishable key identifies the public API boundary and remains subject to Auth and RLS; no legacy anon key, service-role key, provider credential or private portfolio value was added.
- `tests/my-dashboard-preview-config.test.mjs` rejects any unexpected configuration key and secret-like name. The complete suite passes 24/24 and `git diff --check` passes.
- Candidate commit `9bb1a3c06e5df010ef86ab1defe0f67f3270f677` built successfully as Vercel Preview `dpl_2KL91q1fw2k2XGVsrB5XDkvmnTmq`, state `READY`.
- A Vercel share session reached the actual `/my-dashboard` application route. The route now renders the permanent-user email sign-in boundary; the prior `Missing required Supabase frontend configuration` runtime failure is removed.
- Supabase project `glvbqcplgjdfgjyknzsa` remains unchanged: two persisted Watchlists and two items across two permanent owners, owner-scoped policies, anonymous denial and no schema, grant or production-data mutation.
- Production remains on MYDASH-002. PR #25 is not merged.

The remaining correction cannot be completed safely in this non-interactive run. The connected browser has no signed-in permanent test session, and the browser authentication boundary requires user-provided credentials through a secure interactive handoff. The Producer did not create, inspect, transmit or fabricate a password, magic-link token, session token or service-role bypass. SQL two-owner RLS evidence already proves database isolation, but it is not a substitute for the Auditor's expressly required live authenticated desktop and 390 × 844 interaction evidence.

### Producer blocker handoff

    task_id: MYDASH-003
    handoff_from: PRODUCER
    handoff_to: PRODUCER
    handoff_status: BLOCKED_OWNER_AUTHENTICATED_UI_EVIDENCE
    implementation_commit_or_range: 1a6d0130735f69717c1963a84e64c5a5cbce6fc2 through 9bb1a3c06e5df010ef86ab1defe0f67f3270f677
    deployment_reviewed: dpl_2KL91q1fw2k2XGVsrB5XDkvmnTmq READY; application sign-in boundary rendered and public configuration error absent
    schema_and_rls_effects: none; existing owner isolation and anonymous denial preserved
    tests_and_checks: npm test 24/24 PASS; git diff --check PASS; Vercel build READY
    completed_corrections: safe runnable Preview; public-config regression guard; source documentation; production remains unchanged
    remaining_evidence: authenticated two-owner Watchlists and relevant Opportunities; desktop and direct 390 × 844 rendering; Arrow Left/Right, Home/End, focus and live state checks
    exact_blocker: no connected signed-in test session or user-approved permanent test credentials; secure browser authentication requires interactive owner input
    exact_next_action: provide a connected Preview sign-in session for two permanent test identities, or explicitly authorise creation of bounded dedicated test identities; then resume the Producer to capture the live UI evidence and return the reconciled PR to an independent Auditor
