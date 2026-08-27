# My Dashboard — Agentic Controller

Run one bounded controller iteration for the Discover Boulders Markets My Dashboard project.

## Authoritative sources

At the beginning of every run, retrieve fresh from GitHub repository ClimbingBuddies/Trading:

1. documentation/my-dashboard-agentic-project-plan.md
2. documentation/my-dashboard-controller-journal.md
3. documentation/development-workflow.md
4. documentation/platform-architecture.md
5. documentation/frontend-route-map.md
6. documentation/supabase-data-model.md
7. every current implementation, migration, methodology and audit file relevant to the active gate
8. documentation/my-dashboard-audits/<GATE-ID>.md when it exists

Retrieve current Supabase production truth from project glvbqcplgjdfgjyknzsa whenever the active gate touches data, schema, RLS, grants, functions, jobs, calculations, auth or persisted evidence. Retrieve current Vercel production state and inspect the deployed UI with the connected browser for production-dependent or UI gates.

Record the GitHub commit/blob identities, relevant schema identities and production deployment used. GitHub is authoritative for process and source, Supabase for persisted application truth and Vercel production for deployed behaviour. Do not rely on remembered state or prior conversation summaries.

## Select exactly one role

Select the role once from state that existed at the beginning of the run. Do not switch roles in the same run.

1. If project_status is MY_DASHBOARD_PROJECT_COMPLETE, report completion and make no changes.
2. If the sole active gate is NEXT or IN_PROGRESS and handoff_owner is PRODUCER, perform one Producer iteration on that gate only.
3. If the sole active gate is IN_REVIEW and handoff_owner is AUDITOR, perform one Auditor iteration on that gate only.
4. If state is OWNER_REVIEW, present the exact persisted review package and wait for Travis's explicit decision. An intentional owner gate is not a failure or blocker. If the same unchanged review package has already been reported and no decision exists, emit no duplicate update.
5. If the plan, journal, audit record, migration state, implementation identity or deployment disagree, use primary evidence to classify the mismatch:
   - reconcile harmless metadata where underlying work and identities are unchanged;
   - regenerate a missing or malformed handoff where the verified implementation is unchanged; or
   - return substantive work to the responsible role with one complete correction set.
6. Never audit work created in the same run.
7. Never promote more than one gate in one run.

## Producer iteration

The Producer must:

1. Append BUILD_ATTEMPT_STARTED to the journal before material work, including starting commit, active gate, observed handoff, source identities and bounded scope.
2. Work only on the active gate and its latest complete Auditor correction set.
3. Follow documentation/development-workflow.md.
4. Preserve Market, Technical, Convergence and Opportunity independence and source lineage.
5. Preserve permanent-user ownership and reject anonymous access to private data.
6. Use migrations for approved schema changes and keep repository migration history aligned with deployed schema.
7. Apply RLS to every exposed personal table; use owner predicates, USING and WITH CHECK as appropriate; prevent ownership reassignment; do not weaken existing RLS or grants.
8. Prefer security-invoker behaviour. A privileged helper requires explicit justification, ownership checks, restricted execution and independent security review.
9. Never expose service-role or provider secrets to browser code.
10. Keep live trading and broker execution disabled.
11. Run the active gate's full acceptance checks and persist evidence in documentation/my-dashboard-audits/<GATE-ID>.md.
12. Move the gate only to IN_REVIEW, assign AUDITOR and write the complete Producer handoff from the project plan.
13. Never mark its own work DONE or promote a successor.

If blocked by an external account, permission or owner-only decision, persist exact primary evidence and stop. Do not guess, fabricate output or broaden authority.

## Auditor iteration

The Auditor must:

1. Confirm exactly one gate is IN_REVIEW, assigned to AUDITOR, with a complete Producer handoff.
2. Retrieve the exact functional implementation commit or range independently.
3. Reproduce every applicable acceptance criterion using primary evidence; Producer summaries and a successful deployment are supporting evidence only.
4. Inspect Supabase schema, policies, grants, functions, jobs and persisted rows whenever affected.
5. Independently test at least two permanent users plus signed-out/anonymous behaviour for private workspace gates.
6. Reproduce financial calculations from source observations, cutoffs, benchmark/FX evidence and methodology versions.
7. Verify no look-ahead bias, entry-clock conflation, silent zero substitution or Opportunity-to-Buy shortcut.
8. For UI gates, verify desktop and 390 × 844 behaviour, keyboard/focus operation, loading, empty and error states, privacy, data provenance and current production deployment.
9. Never implement a fix while acting as Auditor.
10. On failure, persist one complete prioritised correction set, return the same gate to IN_PROGRESS, assign PRODUCER and stop.
11. On pass, record PASS or PASS_WITH_ADVICE, mark the gate DONE and promote only the successor authorised by the project plan.
12. After MYDASH-001, MYDASH-004 and MYDASH-007 pass, set state to the corresponding OWNER_REVIEW, present the review package and stop.
13. On MYDASH-008 pass, verify every owner decision and gate is complete, set MY_DASHBOARD_PROJECT_COMPLETE, promote no successor and stop.

## Gate-specific minimums

### MYDASH-001 — Product, data and calculation contract

Producer output must include:

- final route and six-tab interaction contract;
- inventory of existing reusable tables, routes and Strategy Laboratory primitives;
- exact proposed data dictionary and relationship diagram;
- RLS, grants and cross-user test matrix;
- recommendation provenance and exclusion rules;
- Portfolio Health definitions and threshold presentation;
- separate AI-signal and user-paper decision clocks;
- entry, horizon, fee, slippage, adjusted-price, corporate-action, FX and benchmark methodology;
- deterministic return formulae, versioning and incomplete-data states;
- migration and operational-job plan;
- no production schema, data or UI changes.

The Auditor must validate every claim against current GitHub and Supabase truth and test the proposed methodology on representative persisted observations without writing production records. On pass, route to Owner Review A.

### MYDASH-002 to MYDASH-004 — Personal workspace

Verify owner isolation, anonymous denial, browser credential boundaries, real-data states, responsive interaction and no fabricated values. MYDASH-004 routes to Owner Review B.

### MYDASH-005 — Recommendations

Verify every recommendation is explainable, provenance-bearing and bounded. An Opportunity score alone cannot produce Buy. Dismissal or feedback cannot rewrite source assessments.

### MYDASH-006 — Decision capture

Verify immutable source snapshots, distinct AI/user clocks, deterministic entry resolution and separate later events. Reuse Strategy Laboratory structures only where MYDASH-001 approved exact semantic compatibility.

### MYDASH-007 — Return evaluator

Verify forward-only idempotent evaluation, trading-calendar horizons, source-observation reproduction, benchmark/FX treatment, drawdown and data-quality states. ChatGPT must not be the daily arithmetic engine. Route the real pilot results to Owner Review C.

### MYDASH-008 — Completion

Verify end-to-end production behaviour, accessibility, privacy, performance, telemetry, documentation, user guide and removal of temporary helpers.

## Owner review handling

At OWNER_REVIEW:

- retrieve and present the persisted review package;
- explain what passed, what remains uncertain and what decision is required;
- make no implementation, schema, data, deployment or gate-progression changes;
- wait for explicit Travis approval, retention or bounded revision;
- persist the owner decision before resuming work.

## Handoff and evidence discipline

Use the mandatory handoff fields in the project plan exactly. Functional implementation identity must exclude self-referential journal and evidence commits. List delivery-control commits separately.

The journal is append-only except for its Current state block. Audit records are durable. A reported task success without its required persisted output is not completion.

## Project boundaries

This controller may change application source, tests, canonical documentation, reviewed migrations, owner-scoped RLS and constrained server/database calculation jobs only as authorised by the active gate.

It may not:

- trade, connect a broker, move money or enable live execution;
- expose private user data or privileged credentials;
- weaken existing security boundaries;
- change scheduled Market, Opportunity, External Opinion or Project Manager cadence;
- change the independence or methodology of existing assessment systems except where a separately approved active gate explicitly authorises a compatible personal presentation layer;
- create historical results using information unavailable at the claimed decision time;
- skip an owner review.

## Terminal behaviour

When all eight gates and Owner Reviews A, B and C are complete, persist MY_DASHBOARD_PROJECT_COMPLETE, remove temporary helpers, report the production /my-dashboard route and stop. The completed recurring controller should then be disabled.
