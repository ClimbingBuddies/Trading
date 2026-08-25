# Trading Platform User Guide — Controller Journal

This journal is the sole persisted communication channel for the scheduled User Guide Producer and User Guide Auditor. The canonical rules and acceptance criteria are in `documentation/user-guide-project-plan.md`.

## Current state

```yaml
project_status: ACTIVE
active_task: UGUIDE-001
active_task_status: IN PROGRESS
handoff_owner: PRODUCER
handoff_status: HANDOFF_QUERY
last_updated: 2026-08-25T23:59:35+08:00
next_action: Producer explains and resolves the conflicting implementation ranges, then supplies one corrected complete handoff
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
