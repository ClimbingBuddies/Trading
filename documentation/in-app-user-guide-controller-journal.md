# In-App User Guide — Controller Journal

This journal is the durable state and handoff record for the small agentic project that publishes the canonical Trading Platform User Guide inside the app.

Authoritative project plan: `documentation/in-app-user-guide-project-plan.md`  
Controller specification: `automation/in-app-user-guide-agentic-controller.md`

## Current state

```yaml
project_status: ACTIVE
active_task: APPGUIDE-001
active_task_status: NEXT
handoff_owner: PRODUCER
handoff_status: AUTHORISED
completed_task: none
audit_decision: none
next_action: Producer retrieves authoritative sources fresh, records BUILD_ATTEMPT_STARTED and implements APPGUIDE-001 only
```

## State invariants

- Exactly one gate may be `NEXT`, `IN PROGRESS` or `IN REVIEW`.
- Each controller run selects exactly one role from the starting persisted state and may not switch roles during that run.
- Producer may finish only at `IN REVIEW`.
- Auditor alone may mark a gate `DONE`.
- APPGUIDE-001 may promote only APPGUIDE-002.
- APPGUIDE-002 may promote no successor; a passing audit terminates the project at `IN_APP_USER_GUIDE_PROJECT_COMPLETE`.
- Missing or conflicting handoffs require a `HANDOFF_QUERY`; controllers must not guess.
- Journal entries are append-only; only the Current state block is replaced as state advances.
- Functional commits and delivery-control/evidence commits must be distinguished clearly.

## Journal entries

### 2026-08-26 — PROJECT_AUTHORISED

```yaml
event: PROJECT_AUTHORISED
task_id: APPGUIDE-001
from: USER
to: PRODUCER
status: NEXT
authorised_scope:
  - publish documentation/user-guide.md inside the Trading app at /help
  - preserve documentation/user-guide.md as the only editable guide source
  - add Help to app navigation after the rendering gate passes audit
  - independently audit both gates and production behaviour
excluded_scope:
  - Supabase/schema/RLS/auth changes
  - trading logic or methodology changes
  - automation schedule changes
  - context-sensitive dashboard Help links
next_action: Producer executes APPGUIDE-001 only
```
