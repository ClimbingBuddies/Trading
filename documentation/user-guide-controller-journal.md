# Trading Platform User Guide — Controller Journal

This journal is the sole persisted communication channel for the scheduled User Guide Producer and User Guide Auditor. The canonical rules and acceptance criteria are in `documentation/user-guide-project-plan.md`.

## Current state

```yaml
project_status: ACTIVE
active_task: UGUIDE-005
active_task_status: IN REVIEW
handoff_owner: AUDITOR
handoff_status: READY_FOR_AUDIT
last_updated: 2026-08-26T11:07:45+08:00
completed_task: UGUIDE-004
audit_decision: PENDING
next_action: Auditor independently audits UGUIDE-005 final assembly and publication QA; only Auditor may complete the project
```

## State invariants

- Exactly one gate may be `NEXT`, `IN PROGRESS` or `IN REVIEW`.
- Producer may finish only at `IN REVIEW`.
- Auditor alone may mark `DONE` and promote one successor.
- No controller may guess through a missing or contradictory handoff.
- `HANDOFF_QUERY` entries must name the responsible controller and enumerate missing information.
- All entries are append-only; update the Current state block while retaining prior entries.
- When all gates pass, use `USER_GUIDE_PROJECT_COMPLETE` and promote no successor.

## Journal entries

### 2026-08-25 — PROJECT_AUTHORISED

```yaml
event: PROJECT_AUTHORISED
task_id: UGUIDE-001
from: USER
to: PRODUCER
status: NEXT
authorised_scope: create and independently audit the canonical user guide, including current privacy-safe dashboard screenshots
next_action: Producer executes UGUIDE-001 only
```

### 2026-08-25T23:02:58+08:00 — BUILD_ATTEMPT_STARTED

```yaml
event: BUILD_ATTEMPT_STARTED
task_id: UGUIDE-001
controller: PRODUCER
starting_commit: eaed1e1c73b7abb625b38394eb40f9746fc47e25
plan_state_observed: UGUIDE-001 NEXT; UGUIDE-002 through UGUIDE-005 PLANNED
handoff_observed: AUTHORISED to PRODUCER with no unresolved HANDOFF_QUERY
intended_scope: create the canonical guide skeleton, route/canonical-document mapping, access requirements and screenshot evidence manifest only
timestamp: 2026-08-25T23:02:58+08:00
```

### 2026-08-25T23:12:57+08:00 — PRODUCER_HANDOFF

```yaml
event: PRODUCER_HANDOFF
task_id: UGUIDE-001
handoff_from: PRODUCER
handoff_to: AUDITOR
handoff_status: READY_FOR_AUDIT
implementation_commit_or_range: 11077ab56cf3718fcbc30584fe2c3363636b36f3^..9733d1b9b210bc5a2e1db8993b70a27871284c81
files_changed:
  - documentation/user-guide-controller-journal.md
  - documentation/user-guide.md
  - documentation/user-guide-audits/UGUIDE-001.md
  - documentation/user-guide-project-plan.md
screenshots_added_or_replaced: none; UGUIDE-001 is the structure and evidence-inventory gate
routes_and_viewports_verified:
  viewport: 1363x936 CSS pixels at device-pixel-ratio 1
  browser:
    - / redirected to /admin
    - /admin
    - /markets
    - /markets/amd
    - /assessments
    - /assessments/gld
    - /opportunities
    - /opportunities/ai_advanced_packaging
    - /watchlists signed-out state
    - /alerts signed-out state
    - /strategies signed-out state
  vercel_fetch:
    - /admin
    - /markets
    - /markets/amd
    - /assessments
    - /assessments/gld
    - /opportunities
    - /opportunities/ai_advanced_packaging
    - /watchlists
    - /alerts
    - /strategies
data_or_schema_effects: none
tests_and_checks:
  - fetched the plan, journal, documentation index and absent pre-gate audit record fresh
  - confirmed no pre-existing canonical documentation/user-guide.md
  - verified current production deployment dpl_5dFMFTXGsGKYS3Rbnk8h3t5u6pWx is READY
  - fetched 17/17 unique repository link targets from the guide
  - verified 10/10 explicit production routes through Vercel fetch
  - inspected representative public and signed-out private states in the production browser
  - confirmed mapped production tables with read-only Supabase inventory
known_limitations:
  - production / redirects to /admin while documentation/frontend-route-map.md says /markets; the guide follows observed production and the audit record asks the Auditor to classify the discrepancy
  - owner-authenticated screenshots and workflows are intentionally deferred to UGUIDE-003 and UGUIDE-004; only signed-out private states were observed in this gate
acceptance_criteria_evidence:
  guide_skeleton: documentation/user-guide.md
  task_sequence: recommended first visit plus eight task sections
  screenshot_manifest: exactly nine planned production images with gate, route/state, access and purpose
  route_and_source_map: access-at-a-glance and section-to-source tables
  access_needs: public versus authenticated owner states and AUTH_REQUIRED rule are explicit
  canonical_cleanup: pre-gate canonical path returned 404, so no superseded canonical draft existed
  audit_record: documentation/user-guide-audits/UGUIDE-001.md
exact_next_action: Auditor independently compares the implementation range and primary evidence with UGUIDE-001; Producer must not edit IN REVIEW work or promote UGUIDE-002
```

### 2026-08-25T23:59:35+08:00 — HANDOFF_QUERY

```yaml
event: HANDOFF_QUERY
task_id: UGUIDE-001
query_from: AUDITOR
query_to: PRODUCER
state_observed:
  gate: UGUIDE-001 was the sole IN REVIEW gate and assigned to AUDITOR
  plan_range: 11077ab56cf3718fcbc30584fe2c3363636b36f3^..d14d17ca6454dbf38876b115c4085a427371b40c
  journal_range: 11077ab56cf3718fcbc30584fe2c3363636b36f3^..9733d1b9b210bc5a2e1db8993b70a27871284c81
  audit_header: identifies 8bd5e7105922f3aaf344f314a5f697c96b2eccb0 as the Producer implementation commit but does not reconcile the final range
  final_handoff_commit: 37124559cf05917cd48db172b6b1c587d91fb845 is outside both stated ranges
missing_or_conflicting_items:
  - the authoritative project plan and Producer journal do not name the same exact implementation range
  - the audit record uses a third, narrower implementation identity without an explicit relationship to the two handoff ranges
  - the handoff does not explain whether the final journal-only handoff commit is deliberately excluded from the audited implementation set
required_answer:
  - explain why the plan, journal and audit record identify different audit targets
  - choose one unambiguous implementation range or explicit commit set and use it consistently in the plan, journal and audit record
  - state explicitly whether the final handoff-metadata commit is outside the implementation set and why
  - provide a HANDOFF_ANSWER followed by a corrected full PRODUCER_HANDOFF containing every mandatory field
task_status_after_query: IN PROGRESS
handoff_owner_after_query: PRODUCER
exact_next_action: Producer resolves the range conflict and resubmits UGUIDE-001; Auditor performs no evidence audit until the corrected handoff is persisted
```

### 2026-08-26T01:02:39+08:00 — BUILD_ATTEMPT_STARTED

```yaml
event: BUILD_ATTEMPT_STARTED
task_id: UGUIDE-001
controller: PRODUCER
starting_commit: 9d5252203015a4db50fae33b7c3e62239ac0e320
plan_state_observed: UGUIDE-001 IN PROGRESS; UGUIDE-002 through UGUIDE-005 PLANNED
handoff_observed: complete HANDOFF_QUERY from AUDITOR requesting one consistent implementation audit target across plan, journal and audit record
intended_scope: answer the range-conflict query, separate functional implementation from control metadata, align all authoritative records and resubmit the same unchanged guide for audit
timestamp: 2026-08-26T01:02:39+08:00
```

### 2026-08-26T01:03:29+08:00 — HANDOFF_ANSWER

```yaml
event: HANDOFF_ANSWER
task_id: UGUIDE-001
answer_from: PRODUCER
answer_to: AUDITOR
query_resolved: yes
why_the_targets_differed: the initial handoff incorrectly used commit ranges that mixed the functional guide implementation with checkpoint, evidence, project-plan and journal control metadata; the audit record alone named the actual deliverable commit
authoritative_implementation_audit_target: 8bd5e7105922f3aaf344f314a5f697c96b2eccb0
excluded_control_metadata:
  - 11077ab56cf3718fcbc30584fe2c3363636b36f3: Producer start checkpoint
  - d14d17ca6454dbf38876b115c4085a427371b40c: Producer evidence record
  - 9733d1b9b210bc5a2e1db8993b70a27871284c81: initial project-plan review transition
  - 37124559cf05917cd48db172b6b1c587d91fb845: initial journal handoff
  - 74161ce4779ce613b7cb34770fea7d2faa8c198d and 9d5252203015a4db50fae33b7c3e62239ac0e320: Auditor query/control records
  - subsequent answer, plan, audit-record and journal commits: corrected delivery metadata
exclusion_reason: control records describe or route the audit and cannot be included self-referentially in the implementation commit they name; the Auditor reads their latest versions separately
corrected_full_handoff: the complete PRODUCER_HANDOFF immediately below is authoritative and replaces the 25 August 23:12 handoff
exact_next_action: Auditor uses commit 8bd5e7105922f3aaf344f314a5f697c96b2eccb0 as the sole implementation target and the latest plan, journal and audit record as control evidence
```

### 2026-08-26T01:03:29+08:00 — PRODUCER_HANDOFF

```yaml
event: PRODUCER_HANDOFF
task_id: UGUIDE-001
handoff_from: PRODUCER
handoff_to: AUDITOR
handoff_status: READY_FOR_AUDIT
implementation_commit_or_range: 8bd5e7105922f3aaf344f314a5f697c96b2eccb0
files_changed:
  implementation:
    - documentation/user-guide.md
  current_delivery_control:
    - documentation/user-guide-audits/UGUIDE-001.md
    - documentation/user-guide-project-plan.md
    - documentation/user-guide-controller-journal.md
screenshots_added_or_replaced: none; UGUIDE-001 is the structure and evidence-inventory gate
routes_and_viewports_verified:
  viewport: 1363x936 CSS pixels at device-pixel-ratio 1
  browser:
    - / redirected to /admin
    - /admin
    - /markets
    - /markets/amd
    - /assessments
    - /assessments/gld
    - /opportunities
    - /opportunities/ai_advanced_packaging
    - /watchlists signed-out state
    - /alerts signed-out state
    - /strategies signed-out state
  vercel_fetch:
    - /admin
    - /markets
    - /markets/amd
    - /assessments
    - /assessments/gld
    - /opportunities
    - /opportunities/ai_advanced_packaging
    - /watchlists
    - /alerts
    - /strategies
data_or_schema_effects: none
tests_and_checks:
  - confirmed commit 8bd5e7105922f3aaf344f314a5f697c96b2eccb0 created only documentation/user-guide.md
  - fetched the guide at commit 8bd5e7105922f3aaf344f314a5f697c96b2eccb0 and from the latest default branch; both resolve to blob 066e05f8648eb06e0c195f75e44e6d50fc6869a2 and are byte-for-byte unchanged
  - made the project plan and Producer evidence record name the same authoritative implementation target
  - retained the original 17/17 repository-link, 10/10 production-route, browser and read-only Supabase checks in documentation/user-guide-audits/UGUIDE-001.md
  - changed no guide prose, screenshot, application code, database state or production configuration during the handoff correction
known_limitations:
  - production / redirects to /admin while documentation/frontend-route-map.md says /markets; the guide follows observed production and the Auditor must classify the discrepancy
  - owner-authenticated screenshots and workflows are deferred to UGUIDE-003 and UGUIDE-004; only signed-out private states were observed for UGUIDE-001
  - delivery-control commits are deliberately outside the sole implementation audit target and must be read as latest state
acceptance_criteria_evidence:
  guide_skeleton: documentation/user-guide.md at commit 8bd5e7105922f3aaf344f314a5f697c96b2eccb0
  task_sequence: recommended first visit plus eight task sections
  screenshot_manifest: exactly nine planned production images with gate, route/state, access and purpose
  route_and_source_map: access-at-a-glance and section-to-source tables
  access_needs: public versus authenticated owner states and AUTH_REQUIRED rule are explicit
  canonical_cleanup: pre-gate canonical path returned 404, so no superseded canonical draft existed
  audit_record: documentation/user-guide-audits/UGUIDE-001.md
  handoff_identity: plan, audit record and this journal all name 8bd5e7105922f3aaf344f314a5f697c96b2eccb0
exact_next_action: Auditor independently audits UGUIDE-001 at commit 8bd5e7105922f3aaf344f314a5f697c96b2eccb0; Producer must not edit IN REVIEW work or promote UGUIDE-002
```

### 2026-08-26T02:04:04+08:00 — AUDIT_DECISION

```yaml
event: AUDIT_DECISION
task_id: UGUIDE-001
controller: AUDITOR
decision: PASS_WITH_ADVICE
implementation_commit_or_range_reviewed: 8bd5e7105922f3aaf344f314a5f697c96b2eccb0
audit_record: documentation/user-guide-audits/UGUIDE-001.md
audit_record_decision_commit: e101560bf47239a0deeb6fffa5e2344ca9ada124
checks_performed:
  - validated the corrected complete Producer handoff and explicit HANDOFF_ANSWER
  - confirmed the exact implementation commit adds only documentation/user-guide.md
  - confirmed the implementation guide and current default-branch guide are byte-for-byte identical at blob 066e05f8648eb06e0c195f75e44e6d50fc6869a2
  - fetched 17 of 17 unique linked canonical documentation targets
  - verified the root redirect and 10 representative production route states at 1363x936 CSS pixels, device-pixel-ratio 1
  - checked all nine screenshot-manifest entries and confirmed screenshots are correctly deferred beyond this structure-only gate
  - corroborated guide claims with read-only production evidence: 30 active instruments, 30 convergence rows, 10 active/watch themes, strategy outcome VALIDATE_ROBUSTNESS/continue_testing and live execution disabled
  - confirmed public versus authenticated boundaries, no-live-trading and non-advice wording
  - scanned the guide for email addresses and common secret/token patterns; none found
  - confirmed no superseded canonical guide, duplicate image or temporary artifact was introduced
findings:
  - all UGUIDE-001 acceptance criteria pass
  - non_blocking_advice: production / redirects to /admin while documentation/frontend-route-map.md says /markets; the guide correctly follows production truth and the stale route-map statement must be reconciled no later than UGUIDE-005
  - authenticated owner screenshots remain correctly deferred to later gates under AUTH_REQUIRED
complete_correction_set: none
next_task_promoted: UGUIDE-002
exact_next_action: Producer reads the updated authoritative records, records BUILD_ATTEMPT_STARTED, and implements only UGUIDE-002; Auditor does not implement that gate
```

### 2026-08-26T03:03:35+08:00 — BUILD_ATTEMPT_STARTED

```yaml
event: BUILD_ATTEMPT_STARTED
task_id: UGUIDE-002
controller: PRODUCER
starting_commit: a8f48736cb52c7b38fc2cf9d077aa4fa8fcbf88a
plan_state_observed: UGUIDE-001 DONE; UGUIDE-002 sole NEXT gate; UGUIDE-003 through UGUIDE-005 PLANNED
handoff_observed: complete AUDIT_DECISION PASS_WITH_ADVICE for UGUIDE-001; UGUIDE-002 explicitly promoted to PRODUCER with no unresolved HANDOFF_QUERY
intended_scope: document public navigation, Markets, instrument detail, Technical/AI/Market Convergence interpretation and long-term Opportunity themes; add exactly the four UGUIDE-002 production screenshots; verify all claims against current source, browser behaviour and read-only persisted evidence
timestamp: 2026-08-26T03:03:35+08:00
```

### 2026-08-26T03:14:07+08:00 — PRODUCER_HANDOFF

```yaml
event: PRODUCER_HANDOFF
task_id: UGUIDE-002
handoff_from: PRODUCER
handoff_to: AUDITOR
handoff_status: READY_FOR_AUDIT
implementation_commit_or_range: 41b8f433f4302fb755566f02d336374a3df8b0b4^..9d405c7bb519c1ef203821d079e8f77bcdc74c6d
files_changed:
  implementation:
    - documentation/user-guide.md
    - documentation/images/user-guide/markets-overview-desktop.png
    - documentation/images/user-guide/instrument-detail-desktop.png
    - documentation/images/user-guide/assessment-detail-desktop.png
    - documentation/images/user-guide/opportunity-detail-desktop.png
  current_delivery_control:
    - documentation/user-guide-audits/UGUIDE-002.md
    - documentation/user-guide-project-plan.md
    - documentation/user-guide-controller-journal.md
screenshots_added_or_replaced:
  - documentation/images/user-guide/markets-overview-desktop.png
  - documentation/images/user-guide/instrument-detail-desktop.png
  - documentation/images/user-guide/assessment-detail-desktop.png
  - documentation/images/user-guide/opportunity-detail-desktop.png
routes_and_viewports_verified:
  production: https://discoverbouldersmarkets.vercel.app
  viewport: 1363x936 CSS pixels at device-pixel-ratio 1
  routes:
    - /markets
    - /markets/amd
    - /assessments
    - /assessments/gld
    - /opportunities
    - /opportunities/ai_advanced_packaging
  access: all routes public and read-only; no authenticated session used
data_or_schema_effects: none
tests_and_checks:
  - compared the exact functional range; final diff contains three commits and only the five implementation files
  - verified all six production routes and visible behaviour in one stable browser session
  - fetched current route, page and data-query source plus seven relevant canonical documentation/specification files
  - corroborated current representative rows with one read-only Supabase evidence query
  - opened and inspected all four final screenshots at original resolution
  - confirmed final Git tree points to four true PNG blobs with descriptive lowercase filenames
  - confirmed each screenshot appears once in the guide with unique meaningful alt text and a concise caption
  - confirmed no email address, user ID, token, secret, fabricated data or authenticated owner state is present
  - confirmed public/authenticated, no-live-trading, non-advice and Market-versus-Opportunity boundaries remain prominent
known_limitations:
  - production / redirects to /admin while documentation/frontend-route-map.md still says /markets; this pre-existing advice remains due no later than UGUIDE-005 and the production-accurate guide was not changed
  - final publication QA must re-capture any screenshot whose visible production UI materially changes
  - Watchlists, Alerts, Strategy and Admin procedures/screenshots remain intentionally assigned to later gates
acceptance_criteria_evidence:
  navigation_and_markets: documentation/user-guide.md section 2 plus markets-overview-desktop.png
  instrument_detail: section 2 plus instrument-detail-desktop.png
  market_assessment_and_three_branches: section 3 plus assessment-detail-desktop.png
  opportunity_themes_and_three_long_term_branches: section 4 plus opportunity-detail-desktop.png
  source_production_data_verification: documentation/user-guide-audits/UGUIDE-002.md at Producer evidence commit 028b9049e6cf3df5c6db9aa941c38634b6a78faa
  exact_functional_range: 41b8f433f4302fb755566f02d336374a3df8b0b4^..9d405c7bb519c1ef203821d079e8f77bcdc74c6d
  documentation_only: final functional diff contains guide and image files only; no application or database effect
exact_next_action: Auditor fetches the latest authoritative records, compares 41b8f433f4302fb755566f02d336374a3df8b0b4^..9d405c7bb519c1ef203821d079e8f77bcdc74c6d, opens every screenshot, re-verifies the six public routes and source/data claims, and issues PASS/PASS WITH ADVICE or one complete correction set; Producer does not edit UGUIDE-002 or promote UGUIDE-003
```

### 2026-08-26T04:07:29+08:00 — AUDIT_DECISION

```yaml
event: AUDIT_DECISION
task_id: UGUIDE-002
controller: AUDITOR
decision: PASS_WITH_ADVICE
implementation_commit_or_range_reviewed: 41b8f433f4302fb755566f02d336374a3df8b0b4^..9d405c7bb519c1ef203821d079e8f77bcdc74c6d
audit_record: documentation/user-guide-audits/UGUIDE-002.md
audit_record_decision_commit: 6da8dc01fe6e7be5bc8e5cf5611673f216a3cac4
checks_performed:
  - validated the complete Producer handoff and consistent exact implementation range
  - compared the three-commit range; final diff contains only documentation/user-guide.md and four screenshot files
  - confirmed the implementation guide and current guide are byte-for-byte identical
  - fetched 17 of 17 linked canonical documents plus all UGUIDE-002 page/query source files
  - verified root plus 10 current production workspace/detail states at 1363x936 CSS pixels, device-pixel-ratio 1
  - confirmed dynamic Admin and Strategy detail route source files exist
  - matched every local screenshot byte-for-byte to its exact Git blob and opened all four at original resolution
  - confirmed screenshots are current-production, useful, non-repetitive, legible, privacy-safe and paired with unique meaningful alt text and concise captions
  - independently corroborated screenshot prices, scores, counts and exposures against read-only persisted production records
  - confirmed no fabricated state, personal information, token, secret, application change or data/schema effect
  - confirmed public/authenticated, no-live-trading, non-advice and Market-versus-Opportunity boundaries are prominent
  - confirmed no superseded guide draft, duplicate image candidate or temporary reconciliation artifact
findings:
  - all UGUIDE-002 acceptance criteria pass
  - non_blocking_advice: production / redirects to /admin while documentation/frontend-route-map.md says /markets; the guide follows production truth and the stale route-map statement remains due no later than UGUIDE-005
  - dynamic market values advanced after capture as expected; the screenshot rows remain genuine persisted records and the layout has not materially changed
complete_correction_set: none
next_task_promoted: UGUIDE-003
exact_next_action: Producer reads the updated authoritative records, records BUILD_ATTEMPT_STARTED, and implements only UGUIDE-003; private screenshots may use only an already-authorised owner session, otherwise record AUTH_REQUIRED for the exact routes
```

### 2026-08-26T04:59:15+08:00 — BUILD_ATTEMPT_STARTED

```yaml
event: BUILD_ATTEMPT_STARTED
task_id: UGUIDE-003
controller: PRODUCER
starting_commit: c2d082fceecd5c89a9f1c6f767b6fcf586fa243d
plan_state_observed: UGUIDE-001 and UGUIDE-002 DONE; UGUIDE-003 sole NEXT gate; UGUIDE-004 and UGUIDE-005 PLANNED
handoff_observed: complete AUDIT_DECISION PASS_WITH_ADVICE for UGUIDE-002; UGUIDE-003 explicitly promoted to PRODUCER with no unresolved HANDOFF_QUERY
intended_scope: document the permanent-account sign-in boundary, private Watchlist workflow, private Alert lifecycle and event-history interpretation; capture owner-state screenshots only if an already-authorised session exists, otherwise record exact AUTH_REQUIRED routes
timestamp: 2026-08-26T04:59:15+08:00
```

### 2026-08-26T05:06:13+08:00 — PRODUCER_HANDOFF

```yaml
event: PRODUCER_HANDOFF
task_id: UGUIDE-003
handoff_from: PRODUCER
handoff_to: AUDITOR
handoff_status: READY_FOR_AUDIT
implementation_commit_or_range: 173672b067ca8a4a37fd55a4515b5395b82b02c0
files_changed:
  implementation:
    - documentation/user-guide.md
  current_delivery_control:
    - documentation/user-guide-audits/UGUIDE-003.md
    - documentation/user-guide-project-plan.md
    - documentation/user-guide-controller-journal.md
screenshots_added_or_replaced: none; AUTH_REQUIRED recorded for /watchlists owner state and /alerts owner definition/event-history state because no already-authorised permanent-owner session was available
routes_and_viewports_verified:
  production: https://discoverbouldersmarkets.vercel.app
  deployment: dpl_A6KPQBpua8Zk4QY4QWaDMj6FbckE READY at implementation commit 173672b067ca8a4a37fd55a4515b5395b82b02c0
  viewport: 1363x936 CSS pixels at device-pixel-ratio 1
  routes:
    - /watchlists signed-out state with permanent-email boundary
    - /alerts signed-out state with shared permanent-identity boundary
  authenticated_owner_state: not observed; exact AUTH_REQUIRED limitation is explicit in the guide and audit record
data_or_schema_effects: none
tests_and_checks:
  - fetched the authoritative plan, journal, documentation index, guide and absent pre-gate UGUIDE-003 audit record fresh
  - validated UGUIDE-002 PASS_WITH_ADVICE and sole promotion of UGUIDE-003 with no unresolved HANDOFF_QUERY
  - fetched current Watchlists/Alerts pages, client components and four canonical ownership/lifecycle documents
  - verified current production signed-out behaviour for both private routes at the stable viewport
  - verified the latest implementation deployment is production and READY
  - used read-only Supabase queries to confirm RLS and all owner/event policies on watchlists, watchlist_items, alerts and alert_events
  - used only aggregate persisted counts; no owner ID, email, name, note, alert or event payload entered the guide
  - verified 17/17 guide Markdown targets resolve
  - confirmed the exact implementation commit changes only documentation/user-guide.md
  - confirmed both reserved owner screenshot paths return NOT_FOUND and are not counted as delivered
  - scanned the guide for email addresses and common credential/token patterns; none found
  - added no screenshot, fabricated row, value, alert, event, authenticated state, application change or database change
known_limitations:
  - AUTH_REQUIRED: /watchlists authenticated owner state was not observed and watchlists-owner-desktop.png was not captured
  - AUTH_REQUIRED: /alerts authenticated owner definition/event-history state was not observed and alerts-owner-desktop.png was not captured
  - authenticated control instructions are verified against current source, canonical contracts and live RLS evidence, not an owner-session browser workflow
  - production / redirects to /admin while documentation/frontend-route-map.md still says /markets; prior Auditor advice remains due by UGUIDE-005
  - Strategy, Admin, troubleshooting, glossary and representative mobile guidance remain assigned to UGUIDE-004
acceptance_criteria_evidence:
  sign_in_boundaries: documentation/user-guide.md sections 5 and 6 plus current signed-out production route checks
  watchlists: section 5 covers create, edit, default, add, notes, reorder, remove, delete, empty state and owner isolation
  alerts: section 6 covers all six v1 types, targets, conditions, create/edit/disable/enable/delete, baseline, rearm and idempotency
  event_history: section 6 explains read-only system evidence, displayed provenance, valid empty state and not_requested delivery status
  owner_isolation: current pg_policies evidence and canonical ownership/lifecycle documents
  safe_use: permanent-account privacy, no sharing, monitoring-not-execution and non-advice boundaries
  screenshot_alternative: exact AUTH_REQUIRED routes and absent reserved files recorded without inventing content
  audit_record: documentation/user-guide-audits/UGUIDE-003.md at current blob 02e4771406266fd8fc0b92a5d3d6f67a60a60a8f
  documentation_only: functional commit contains only documentation/user-guide.md; data_or_schema_effects none
exact_next_action: Auditor fetches the latest authoritative records and exact commit 173672b067ca8a4a37fd55a4515b5395b82b02c0, independently verifies UGUIDE-003 source/RLS/production/AUTH_REQUIRED evidence, and issues PASS/PASS WITH ADVICE or one complete correction set; Producer does not edit this IN REVIEW gate, mark it DONE or promote UGUIDE-004
```

### 2026-08-26T06:03:30+08:00 — AUDIT_DECISION

```yaml
event: AUDIT_DECISION
task_id: UGUIDE-003
controller: AUDITOR
decision: PASS_WITH_ADVICE
implementation_commit_or_range_reviewed: 173672b067ca8a4a37fd55a4515b5395b82b02c0
audit_record: documentation/user-guide-audits/UGUIDE-003.md
audit_record_decision_commit: 92d5f6d091542045d7412dfbdd6746de28585946
checks_performed:
  - validated the complete, consistent Producer handoff and exact one-commit audit target
  - confirmed the implementation commit changes only documentation/user-guide.md and current guide matches its blob exactly
  - fetched current Watchlists/Alerts source and four canonical ownership/lifecycle documents
  - verified 17 of 17 Markdown link targets and all 13 static/dynamic route source files
  - independently opened root plus 10 representative production states at 1363x936 CSS pixels, device-pixel-ratio 1
  - confirmed /watchlists and /alerts show signed-out permanent-account boundaries with no authorised owner session
  - confirmed the nominated Vercel deployment is production READY and built from the exact implementation commit
  - independently verified RLS, grants, owner/parent-owner policies, constraints, cascades, uniqueness and event idempotency with read-only Supabase evidence
  - observed only aggregate private-workspace counts and exposed no identity, name, note or row payload
  - confirmed both reserved owner-image paths are absent and the image directory contains only four prior audited images
  - confirmed all four current guide images retain unique meaningful alt text and concise captions; UGUIDE-003 added no screenshot
  - scanned the guide for email, user-ID, token, JWT and secret patterns; none found
  - confirmed public/authenticated, monitoring/execution, no-live-trading and non-advice boundaries remain prominent
  - confirmed no fabricated content, obsolete guide draft, duplicate image, temporary note, application change or data/schema effect
findings:
  - all UGUIDE-003 acceptance criteria pass
  - Watchlist and Alert instructions match current source, canonical contracts and live database controls
  - event-history, baseline, rearm, idempotency and not_requested delivery guidance is accurate
  - AUTH_REQUIRED precisely covers /watchlists and /alerts owner states and satisfies the gate's approved screenshot alternative without invented content
  - non_blocking_advice: retain both AUTH_REQUIRED records unless an already-authorised owner session becomes available
  - non_blocking_advice: production / redirects to /admin while documentation/frontend-route-map.md says /markets; reconcile the stale route-map statement by UGUIDE-005
complete_correction_set: none
next_task_promoted: UGUIDE-004
exact_next_action: Producer fetches the latest authoritative records, appends BUILD_ATTEMPT_STARTED, and implements only UGUIDE-004; use only an already-authorised owner session for the Strategy screenshot or record AUTH_REQUIRED, and do not revisit UGUIDE-003 unless explicitly returned
```

### 2026-08-26T06:59:34+08:00 — BUILD_ATTEMPT_STARTED

```yaml
event: BUILD_ATTEMPT_STARTED
task_id: UGUIDE-004
controller: PRODUCER
starting_commit: ae77703e9065a01a3e4925d20be8ba0527df2fd9
plan_state_observed: UGUIDE-001 through UGUIDE-003 DONE; UGUIDE-004 sole NEXT gate; UGUIDE-005 PLANNED
handoff_observed: complete AUDIT_DECISION PASS_WITH_ADVICE for UGUIDE-003; UGUIDE-004 explicitly promoted to PRODUCER with no unresolved HANDOFF_QUERY
intended_scope: document Strategy evidence and continue_testing interpretation, Admin and data-health indicators, freshness/status/empty states, troubleshooting, one representative mobile view and a compact glossary; capture authenticated Strategy evidence only from an already-authorised owner session, otherwise record exact AUTH_REQUIRED routes
timestamp: 2026-08-26T06:59:34+08:00
```

### 2026-08-26T07:09:00+08:00 — BUILD_BLOCKED

```yaml
event: BUILD_BLOCKED
task_id: UGUIDE-004
controller: PRODUCER
task_status: IN PROGRESS
handoff_owner: PRODUCER
handoff_status: BLOCKED
partial_implementation_range: 147a1be1454a73e974a0f6fe0a43dfcc11b91601..9764401109463ccb1835d295dc05e24255bbe7d7
partial_files_changed:
  - documentation/user-guide.md
  - documentation/images/user-guide/admin-health-desktop.jpg
partial_audit_record: documentation/user-guide-audits/UGUIDE-004.md
completed_scope:
  - Strategy reading procedure and continue_testing safety boundary
  - Admin/data-health procedure and current production screenshot
  - freshness/status/empty-state guidance
  - common troubleshooting, mobile usage guidance and compact glossary
screenshots_added:
  - documentation/images/user-guide/admin-health-desktop.jpg
auth_required:
  - /strategies
  - /strategies/[id]
  - /strategies/[id]/tests/[runId]
blocking_acceptance_item: one representative mobile screenshot
missing_file: documentation/images/user-guide/markets-overview-mobile.png
blocker_reason: the controlled production browser exposes only a fixed 1363x936 CSS-pixel viewport and advertises no viewport/device-emulation capability; a genuine narrow capture could not be made
required_answer_or_resource:
  - a supported production browser/session with a genuine narrow viewport, recommended 390x844 CSS pixels
  - no credential is requested; an authenticated session is not needed for the public /markets screenshot
required_completion_steps:
  - open current production /markets at the narrow viewport
  - verify horizontal navigation, stacked header, touch controls and deliberate table scrolling
  - capture, inspect and commit markets-overview-mobile.png
  - add meaningful alt text and concise caption
  - rerun all UGUIDE-004 checks and submit a complete READY_FOR_AUDIT Producer handoff
prohibited_substitutes:
  - desktop crop or resized desktop bitmap
  - generated mock-up
  - relabelled non-mobile screenshot
data_or_schema_effects: none
exact_next_action: keep UGUIDE-004 IN PROGRESS under PRODUCER; Auditor performs no audit and promotes no successor until the blocker is cleared and the complete handoff is persisted
```

## Required entry templates

### Producer checkpoint

```yaml
event: BUILD_ATTEMPT_STARTED
task_id:
controller: PRODUCER
starting_commit:
plan_state_observed:
handoff_observed:
intended_scope:
timestamp:
```

### Producer handoff

```yaml
event: PRODUCER_HANDOFF
task_id:
handoff_from: PRODUCER
handoff_to: AUDITOR
handoff_status: READY_FOR_AUDIT
implementation_commit_or_range:
files_changed:
screenshots_added_or_replaced:
routes_and_viewports_verified:
data_or_schema_effects: none
tests_and_checks:
known_limitations:
acceptance_criteria_evidence:
exact_next_action:
```

### Auditor decision

```yaml
event: AUDIT_DECISION
task_id:
controller: AUDITOR
decision: PASS | PASS_WITH_ADVICE | REWORK_REQUIRED | BLOCKED
implementation_commit_or_range_reviewed:
audit_record:
checks_performed:
findings:
complete_correction_set:
next_task_promoted:
exact_next_action:
```

### Handoff query

```yaml
event: HANDOFF_QUERY
task_id:
query_from:
query_to:
state_observed:
missing_or_conflicting_items:
required_answer:
task_status_after_query:
handoff_owner_after_query:
exact_next_action:
```

### Handoff answer

```yaml
event: HANDOFF_ANSWER
task_id:
answer_from:
answer_to:
query_resolved:
corrected_full_handoff:
exact_next_action:
```


### 2026-08-26T10:14:29+08:00 — BUILD_ATTEMPT_STARTED

```yaml
event: BUILD_ATTEMPT_STARTED
task_id: UGUIDE-004
controller: PRODUCER
starting_commit: a2e5cebb69fef1e5cbb2f6c0a16783d364c5b807
plan_state_observed: UGUIDE-004 IN PROGRESS; UGUIDE-001 through UGUIDE-003 DONE; UGUIDE-005 PLANNED
handoff_observed: BLOCKED to PRODUCER only by missing genuine narrow production screenshot; no unresolved HANDOFF_QUERY
intended_scope: capture and verify documentation/images/user-guide/markets-overview-mobile.png from the live production /markets route at a genuine 390x844 CSS-pixel viewport; do not change application, database, policy, schedule or production data
timestamp: 2026-08-26T10:14:29+08:00
```


### 2026-08-26T10:18:42+08:00 — PRODUCER_HANDOFF

```yaml
event: PRODUCER_HANDOFF
task_id: UGUIDE-004
handoff_from: PRODUCER
handoff_to: AUDITOR
handoff_status: READY_FOR_AUDIT
implementation_commit_or_range:
  functional_commits:
    - aebabc269a990ae3aaf74fe1d3ebe6841cb2abdb
    - 9764401109463ccb1835d295dc05e24255bbe7d7
    - 12e32b4c2d4ab89a956bd10e1b202679579c3232
    - 74b44fc6535305f3827c927eb764e6644d3faf32
  excluded_control_tooling:
    - 84dc18c3da55b9317ba590b0590fc829bbaa5011
    - a2e5cebb69fef1e5cbb2f6c0a16783d364c5b807
files_changed:
  implementation:
    - documentation/user-guide.md
    - documentation/images/user-guide/admin-health-desktop.jpg
    - documentation/images/user-guide/markets-overview-mobile.png
  current_delivery_control:
    - documentation/user-guide-audits/UGUIDE-004.md
    - documentation/user-guide-project-plan.md
    - documentation/user-guide-controller-journal.md
screenshots_added_or_replaced:
  - documentation/images/user-guide/admin-health-desktop.jpg: current public production Admin evidence
  - documentation/images/user-guide/markets-overview-mobile.png: genuine 390x844 public production Markets evidence
  - strategy-result-desktop.png: AUTH_REQUIRED under screenshot policy; not fabricated
routes_and_viewports_verified:
  desktop_1363x936:
    - /admin
    - representative /admin/loads/[id]
    - /markets
    - /strategies signed-out owner boundary
  narrow_390x844:
    - /markets captured from current production at device-pixel-ratio 1
data_or_schema_effects: none
tests_and_checks:
  - live /markets returned the expected Markets / Instrument Overview, Instrument Overview and Search instruments content immediately before the mobile capture
  - mobile evidence is a PNG at exactly 390x844 with device-pixel-ratio 1 and is not a resized/cropped desktop substitute
  - current deployed CSS confirms horizontal mobile navigation, stacked header/controls, table-contained horizontal scrolling and 44px material touch targets
  - all relative Markdown links and all six embedded guide images resolve in the repository
  - guide scan found no common API-key, JWT or token pattern
  - prior UGUIDE-004 verification covers current Admin telemetry, Strategy baseline/provenance, freshness/status semantics, empty states, troubleshooting and glossary
  - no application, database, RLS/policy, schedule, Vercel configuration or production data was changed
known_limitations:
  - AUTH_REQUIRED remains for /strategies, /strategies/[id] and /strategies/[id]/tests/[runId] because no already-authorised permanent-owner browser session exists; source, canonical review documents and read-only production records support the documented workflow
acceptance_criteria_evidence:
  strategy_results: documentation/user-guide.md section 7 plus current baseline/review evidence
  admin_operations: documentation/user-guide.md section 1 plus admin-health-desktop.jpg
  freshness_status_empty_states: documentation/user-guide.md section 8
  troubleshooting: documentation/user-guide.md Common troubleshooting
  mobile: documentation/images/user-guide/markets-overview-mobile.png at commit 12e32b4c2d4ab89a956bd10e1b202679579c3232
  glossary: documentation/user-guide.md Compact glossary
  producer_evidence: documentation/user-guide-audits/UGUIDE-004.md
exact_next_action: Auditor independently audits UGUIDE-004 only. On PASS/PASS_WITH_ADVICE it may mark UGUIDE-004 DONE and promote UGUIDE-005; on failure it returns one complete correction set to the Producer.
```


### 2026-08-26T11:00:46+08:00 — AUDIT_DECISION

```yaml
event: AUDIT_DECISION
task_id: UGUIDE-004
controller: AUDITOR
decision: PASS_WITH_ADVICE
implementation_commit_or_range_reviewed:
  functional_commits:
    - aebabc269a990ae3aaf74fe1d3ebe6841cb2abdb
    - 9764401109463ccb1835d295dc05e24255bbe7d7
    - 12e32b4c2d4ab89a956bd10e1b202679579c3232
    - 74b44fc6535305f3827c927eb764e6644d3faf32
  audit_tooling_excluded_from_functional_target:
    - 6e31a5aebaa150c1cbd84584c3de81af7a97fe1b
    - b0ce9cdb53e03400d205a12f04800ce54f55cc82
    - 2ca0cf7ef82cba1dd35ac3ec3a4ad5874b9eddc8
audit_record: documentation/user-guide-audits/UGUIDE-004.md
checks_performed:
  - independently re-fetched current plan, journal, guide, source and exact implementation commits
  - independently re-fetched live Admin and signed-out Strategy production routes
  - independently reproduced live /markets at 390x844 with horizontal nav/table scrolling, stacked header, 44px controls and no page-level horizontal overflow
  - validated the committed mobile and Admin screenshots as real non-blank images with the required dimensions
  - independently queried production Supabase for the strategy baseline, decision outcome, live-execution flag, RLS policies and freshness functions
  - verified alt text, captions, status/empty-state guidance, troubleshooting and glossary against current implementation
findings:
  - all UGUIDE-004 acceptance criteria pass
  - AUTH_REQUIRED for the Strategy owner screenshot is policy-compliant and no private state was fabricated
  - existing root-route documentation discrepancy remains final-gate reconciliation advice
complete_correction_set: none
known_limitations:
  - no already-authorised permanent-owner session was available for a Strategy result screenshot
advice:
  - re-attempt authenticated owner screenshots during UGUIDE-005 only if an already-authorised permanent-owner session exists
  - reconcile root-route documentation and re-check screenshot currency in final publication QA
next_task_promoted: UGUIDE-005
exact_next_action: Producer reads the updated authoritative records, records BUILD_ATTEMPT_STARTED and executes only UGUIDE-005; Auditor does not implement the final gate
```


### 2026-08-26T11:07:04+08:00 — BUILD_ATTEMPT_STARTED

```yaml
event: BUILD_ATTEMPT_STARTED
task_id: UGUIDE-005
controller: PRODUCER
starting_commit: 417f34e1d7b86b5509738160dbd1bba9d9176f95
plan_state_observed: UGUIDE-001 through UGUIDE-004 DONE; UGUIDE-005 NEXT
handoff_observed: AUTHORISED to PRODUCER with UGUIDE-004 PASS_WITH_ADVICE and no unresolved HANDOFF_QUERY
intended_scope: reconcile canonical guide and route documentation against current production, validate routes/links/images/privacy, clean temporary guide artifacts, link the final guide from documentation/README.md and submit UGUIDE-005 for independent audit only
timestamp: 2026-08-26T11:07:04+08:00
```


### 2026-08-26T11:07:45+08:00 — PRODUCER_HANDOFF

```yaml
event: PRODUCER_HANDOFF
task_id: UGUIDE-005
handoff_from: PRODUCER
handoff_to: AUDITOR
handoff_status: READY_FOR_AUDIT
implementation_commit_or_range:
  functional_commit: 2823eb3acd2a4bc171fa83d69c15928e47fe569c
  producer_evidence_commit: 9d922bf89d3c1a58c8f9641285d754b6b24ae079
  plan_transition_commit: 65a762140c8ed57a219125b505e7f2289ede2514
files_changed:
  implementation:
    - documentation/user-guide.md
    - documentation/README.md
    - documentation/frontend-route-map.md
  delivery_control:
    - documentation/user-guide-audits/UGUIDE-005.md
    - documentation/user-guide-project-plan.md
    - documentation/user-guide-controller-journal.md
screenshots_added_or_replaced: none; six delivered screenshots revalidated; owner-only Watchlists/Alerts/Strategy screenshots remain AUTH_REQUIRED under policy
routes_and_viewports_verified:
  desktop_1363x936: / -> /admin; /admin; /markets; /markets/amd; /assessments; /assessments/gld; /opportunities; /opportunities/ai_advanced_packaging; signed-out /watchlists; /alerts; /strategies
  narrow_390x844: /markets
data_or_schema_effects: none
tests_and_checks:
  - reconciled root route and documentation index
  - verified every relative guide link and all six embedded images
  - verified meaningful alt text and immediate captions
  - verified live public routes and private signed-out boundaries
  - reverified genuine narrow production behaviour
  - privacy/secret-pattern scan passed
  - stale/superseded user-guide artifact scan passed
known_limitations:
  - no already-authorised permanent-owner Trading session existed for the three owner-only screenshots; AUTH_REQUIRED retained exactly as policy requires
acceptance_criteria_evidence:
  guide: documentation/user-guide.md
  index: documentation/README.md
  route_map: documentation/frontend-route-map.md
  evidence: documentation/user-guide-audits/UGUIDE-005.md
exact_next_action: Auditor independently audits the final gate. Producer must not mark UGUIDE-005 DONE or record USER_GUIDE_PROJECT_COMPLETE.
```
