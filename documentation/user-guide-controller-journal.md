# Trading Platform User Guide — Controller Journal

This journal is the sole persisted communication channel for the scheduled User Guide Producer and User Guide Auditor. The canonical rules and acceptance criteria are in `documentation/user-guide-project-plan.md`.

## Current state

```yaml
project_status: ACTIVE
active_task: UGUIDE-001
active_task_status: NEXT
handoff_owner: PRODUCER
handoff_status: AUTHORISED
last_updated: 2026-08-25
next_action: Producer starts UGUIDE-001 and records BUILD_ATTEMPT_STARTED before material work
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
