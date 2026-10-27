# Formal product and delivery review — 26 October 2026

**System:** Discover Boulders Markets / Trading  
**Review type:** Owner-authorised product, technical and plan review  
**Reviewer:** Codex; this is an author-led review, not independent certification  
**Disposition:** Continue bounded improvement. Current evidence does not justify declaring the automated decision service operationally complete or predictively successful.  
**Implementation plan:** [Reliable Research and Decision Lab](../trading-reliability-and-decision-plan.md)  
**Acceptance scenarios:** [Product acceptance specification](../specifications/trading-product-acceptance.md)

**Subsequent progress:** [27 October source recovery and implementation checkpoint](REL-001-2026-10-27.md) resolves the source-location question and verifies frozen installation, 371 tests, a production build and the first local Opportunity-label fix. Backend management/release acceptance remains open. Findings below retain their 26 October scope and must not be silently treated as current unresolved facts where later evidence supersedes them.

## Scope and evidence standard

Reviewed the main platform plan, My Dashboard plan and contract, the first reliability-plan revision, operational/controller specifications, current checkout implementation/tests, and the same-day live-site evidence collected for Opportunities, Assessments, Alerts, Strategies and the shared Decision Lab. The review concerns product intent, functioning workflows and credible measurement; it does not assume the older plan must be followed.

The live browser and service captures from 26 October are reused and identified below. No new privileged schema inspection, scheduler inspection, two-user production isolation audit, forecast experiment, recovery drill or live deployment was performed for this document. Passing tests from the earlier technical review are evidence of those tests, not a substitute for these missing checks.

Evidence labels:

- **Observed:** directly supported by the inspected source or captured live response.
- **Reproduced in checkout:** exercised against the local implementation/isolated fixtures; production applicability must be checked after source reconciliation.
- **Unverified risk:** a credible weakness requiring an acceptance test, not a claim that an incident occurred.
- **Plan defect:** a missing or inadequate requirement in the previous plan.

P0 prevents a dependable decision-service release; P1 materially limits quality/usefulness; P2 improves maturity after the core loop is proven. Severity is a remediation priority, not evidence that private data has been exposed or that the site is unusable for research.

## Intended product

An investor should be able to discover relevant research, understand a dated and evidenced AI view, follow supported instruments, and see an honest forward test of that view. The operator should be able to establish what ran, what failed, why an instrument is blocked, and how to recover without generating duplicates or rewriting history.

The minimum useful product is a small reliable research → call → outcome loop. A large universe, separate pages, high confidence scores and a “complete” plan do not establish that loop. Shared AI calls should be produced once; user context remains private. More predictable markets or profitable AI are hypotheses to test, not product assumptions.

## Evidence inventory

| ID | Evidence and boundary |
|---|---|
| E01 | Fetched GitHub main/checkout: `3a2719519b22b266cdac9b9e54296c11ce2594bb`; no `app/decision-lab` route. Live `/decision-lab` renders a shared-call implementation and shared RPCs. Exact deployed source revision is unavailable. This establishes divergence, not which source is newer. |
| E02 | Live Assessments: 39 AI results dated 21 October; 30 Technical/Convergence snapshots dated 20 August. Live Opportunities: 10 themes, latest run 22 October at 08:25 Perth, some cards still say “today”. Source dates can be seen on the public pages. |
| E03 | Authenticated live shared Decision Lab: 7 saved decisions; 3 research-only; review panel reports 24 overlapping attention items and missing controller receipts/configuration. It also correctly notes that no US review is due for the relevant non-session date. Missing receipts do not prove a scheduler never executed. |
| E04 | Read-only `shared_ai_performance_v1`, `p_scope=all`, captured at `2026-10-26T13:13:02.940341Z` for 5 sessions: 7 scored events, 4 matured, 3 pending, 0 blocked. At `2026-10-26T13:13:05.376716Z` for 20 sessions: 7 events, 0 matured, 6 pending, 1 blocked. These are event-trial counts, not the latest-call table's grain or a portfolio. |
| E05 | E04's method is `shared-action-trial-v1`; assumptions explicitly exclude dividends and use defined equity/cash exposure with modelled costs. Five-session mean action return −3.8040%, benchmark −3.9904%; four correlated trials do not establish a reliable edge. |
| E06 | Test watchlist: 26 USD shares; 19 older published assessments, 7 none. Preliminary checks found one canonical mapping and 60 recent valid duplicate-free daily rows per selected share. Configuration/calendar/benchmark/publication eligibility is a separate test. Five active ETFs and six FX pairs have market-data coverage; GBP/AUD has no inspected published assessment. |
| E07 | Authenticated public API projections for older `personal_recommendation_snapshots`, `personal_decisions`, `personal_return_snapshots` returned 404/PGRST205. Legacy `personal_decision_events` fields returned 400/42703 while the private journal projection succeeded. Do not apply old migrations blindly to the shared production system. |
| E08 | Production-used local helper reproduced legacy NOT_ENTERED as Awaiting entry; an equal-date data gap withholds return but leaves status Open. Browser watchlist at 390 px viewport reported 727 px document width. Treat these as checkout observations until reproduced in reconciled production source. |
| E09 | Earlier technical review: 165 Node tests passed and isolated journal suite passed; production build, older prediction-ledger and timing suites also passed during onboarding. `npm ci` failed on missing Sharp optional-platform lock entries; the temporary install fallback resolved manifest ranges without changing the lockfile. Only a PR template is present under this checkout's `.github`; externally configured CI/deployment checks were not inspected. |
| E10 | Live test account has no Alerts definitions or private Strategies; Alerts says delivery is not requested in v1. This does not establish other owners' data or their use of these tools. |
| E11 | Existing research specification already requires sourced facts, freshness and claim deduplication. Existence of that prose does not establish enforcement by the current shared publisher or the exact deployed model/parser. |

The operational public URLs are `https://discoverbouldersmarkets.vercel.app/{opportunities,assessments,alerts,strategies,decision-lab}`. Local supporting captures live under `/workspace/trading-tools/`; they are not required to interpret this sanitised evidence inventory or to execute the plan. Do not copy session files, credentials or private user records into the repository. Recheck time-sensitive evidence at implementation start.

## Findings and required improvements

| ID / priority | Finding and evidence class | Impact and recommended improvement | Plan / acceptance |
|---|---|---|---|
| F01 / P0 | Source/deployment mismatch (observed, E01) and non-frozen build fallback (E09). | A fix could replace the shared product with an older private version; rebuilding does not reproduce the reviewed dependency set. Recover the real source/artifact and schema/API versions, repair the lock through a reviewed source change, and prove frozen installation and deployment parity. | REL-001; AT-01, AT-02 |
| F02 / P0 | Stale and mismatched “current” signals (observed, E02). | Users can mistake historical Technical/Convergence output for current agreement. Enforce calendar-aware freshness and matching lineage before current aggregates; retain historical views. Correct last-run versus today language. | REL-003; AT-03 |
| F03 / P0 | Publication and configuration are not demonstrated for the intended universe (observed, E03/E06; hosted causes unverified). | More watchers do not fix missing research, configuration or calls. Establish a four-instrument pilot, verify real receipts, then expand through an explicit readiness checklist. | REL-002, REL-005; AT-04, AT-05 |
| F04 / P0 | The first revised plan treated “truthfully terminal” including source failure as a reliability success (plan defect). | A permanently failing pipeline could satisfy a reporting target. Separate telemetry completeness, successful usable coverage and evaluator timeliness. Failures remain visible and count against service availability. | REL-002/003; AT-06 |
| F05 / P0 | Reproducible trial semantics and metric denominators need stronger protection (observed limitation, E04/E05; plan defect). | Overlapping reviews, cash WAITs or four trials can produce misleading success claims. Freeze method/version and comparison definitions, show pending/blocked/excluded cohorts, test cash and adverse paths, and distinguish trial averages from portfolio returns. | REL-004; AT-07, AT-08 |
| F06 / P1 | ETF and FX expansion outpaces validated methods (observed, E05/E06). | Missing dividends can bias long-horizon comparisons; equity allocation/QQQ rules do not define FX P&L. Permit labelled price-only pilots, then add verified distributions and an independently specified FX model. Do not promise more predictable returns. | REL-005/006/007; AT-09, AT-10 |
| F07 / P1 | Competing schema/history and two display errors remain (observed API mismatch / checkout reproduction, E07/E08). | Misapplied fixes can create conflicting tables; terminal or unverified outcomes display incorrectly. Reconcile active/retired interfaces before targeted fixes. Preserve old decisions and method interpretation. | REL-001/004; AT-01, AT-08 |
| F08 / P1 | Security and recovery acceptance were too generic (unverified risk / plan defect). | One account's successful login proves neither two-user isolation nor restricted shared writes or recoverability. Test the shared/private access matrix, least privilege, credential handling, forward-compatible migration/rollback and an isolated restoration exercise. No breach is alleged. | REL-010; AT-11, AT-12 |
| F09 / P1 | Research prose lacks demonstrated machine-enforced evidence quality in the deployed path (unverified risk, E11). | Valid-looking model output can still have unsupported assertions, duplicated sources, invented citations or source instructions. Require schema validation, claim/source lineage, cutoff checks, safe source handling and a refusal/blocked state. Verify on known-good and adversarial fixtures. | REL-011; AT-13 |
| F10 / P1 | Cost/capacity, provider limits and model changes were not actionable requirements (plan defect). | A 26-share expansion may exhaust quotas or repeatedly regenerate unchanged work. Bound cost and concurrency, cache provenance-bearing evidence, deduplicate shared work and record versioned usage/model changes. Budgets are set before scaling rather than invented in this review. | REL-012; AT-14 |
| F11 / P1 | Useful user journeys and navigation acceptance were underspecified (observed E08/E10; plan defect). | More tabs can expose empty/technical screens without helping a decision. Verify morning summary → evidence → watch → outcome journeys and mobile/keyboard containment; stage navigation changes without deleting private histories or links. | REL-008; AT-15 |
| F12 / P1 | The first revised plan lacked release slices, accountable roles and stop conditions (plan defect). | Large “restore everything” tasks can remain blocked, or tempt premature deployment. Introduce a bounded pilot, explicit dependencies, owner roles, release evidence and a pause-publication control that keeps historical evaluation available. | REL-001/002/010 and all release slices; AT-16 |
| F13 / P2 | Product usefulness and predictive learning were not separated (plan defect). | A technically reliable system may still be hard to use or add no edge. Test comprehension and workflow usefulness now; evaluate held-out forward performance later with uncertainty and no hidden cohort/model changes. | REL-008/009; AT-17, AT-18 |

## Strengths worth retaining

- Analytical independence, immutable dated evidence, truthful missing-data states, model/version lineage and paper-only scope are sound foundations.
- The live shared implementation reduces duplicate AI work and can give every user the same public-to-authenticated AI record, while personal context remains private.
- The live service explicitly labels trial limitations and exposes blockers rather than inventing performance.
- Existing tests exercise ownership, immutable records, idempotency, costs and adverse/missing-price cases. Extend them around observed gaps rather than replace them with trivial passing checks.
- The older plans preserve useful audit history. Retain that evidence and clearly scope which version it describes.

## Release recommendation

Do not attempt an all-asset rewrite or delete useful tools to simplify the product. Deliver the slices in the active plan: source/build parity; a truthful and reproducible four-instrument pilot; broader supported equity/ETF coverage; then separate FX/long-horizon capabilities. Basic transparency, access controls and recovery are release prerequisites; statistical proof of profitable AI is not a fabricated launch prerequisite or a launch promise.

The first implementation dependency remains the exact deployed source and authorised access to backend configuration/receipts. Independent specification, isolated tests and read-only diagnosis can proceed while that access is resolved. No live changes, schema updates, notifications, trades, pushes or deployments were performed as part of this formal review.
