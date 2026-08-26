# In-App User Guide — Controller Journal

This journal is the durable state and handoff record for the small agentic project that publishes the canonical Trading Platform User Guide inside the app.

Authoritative project plan: `documentation/in-app-user-guide-project-plan.md`  
Controller specification: `automation/in-app-user-guide-agentic-controller.md`

## Current state

```yaml
project_status: ACTIVE
active_task: APPGUIDE-001
active_task_status: IN PROGRESS
handoff_owner: PRODUCER
handoff_status: IN PROGRESS
completed_task: none
audit_decision: none
next_action: Producer implements and verifies APPGUIDE-001 only, then submits it to Auditor
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

### 2026-08-26T12:00:00+08:00 — BUILD_ATTEMPT_STARTED

```yaml
event: BUILD_ATTEMPT_STARTED
task_id: APPGUIDE-001
controller: PRODUCER
starting_commit: 10f7af43a520862f358d87fff8691d400d992eea
plan_blob: 721ab62c27df70df594590280b6ce8fd13652036
journal_blob_before_start: 479e81de36162ba6f9be51a66bb1ccf25d0307af
controller_blob: 279b60b128f006c8903f02c70a968d86430e715a
canonical_guide_blob: 68bdfc34e106f95eaaaf286299100ed93994619e
development_workflow_blob: e04dfa048b5b42767db4feb43d86f3738cd3c07c
package_blob: b07cfcad46277e921dfd0cc31594b17473a4cac9
layout_blob: ef1ea4743fb5290504ec750c5cae55f7e8e666ce
frontend_route_map_blob: 4fa1ea3aaf96e41d2cfa0ab33950a79e00241a83
plan_state_observed: APPGUIDE-001 NEXT; APPGUIDE-002 PLANNED
handoff_observed: APPGUIDE-001 AUTHORISED to PRODUCER with no unresolved HANDOFF_QUERY
intended_scope: implement the public /help route from documentation/user-guide.md, Markdown rendering, safe image/document-link transformation, responsive themed presentation, route-map reconciliation and automated source/build checks only; do not add Help navigation in this gate
data_or_schema_effects: none
```
