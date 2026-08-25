# Trading Platform User Guide — Project Plan

**Repository:** `ClimbingBuddies/Trading`  
**Production:** `https://discoverbouldersmarkets.vercel.app`  
**Canonical deliverable:** `documentation/user-guide.md`  
**Screenshot directory:** `documentation/images/user-guide/`  
**Controller journal:** `documentation/user-guide-controller-journal.md`  
**Audit records:** `documentation/user-guide-audits/<TASK-ID>.md`  
**Authorised:** 25 August 2026  
**Last updated:** 25 August 2026

## Objective

Create a concise, task-based user guide for the completed Discover Boulders Markets platform. The guide must help a new user navigate the platform, understand what each dashboard means, use signed-in workspaces safely, and recognise the boundary between research information and live trading.

This is a documentation-only project. It does not reopen the completed platform plan and does not authorise application, schema, policy, schedule or production-data changes.

## Deliverables

1. `documentation/user-guide.md`, linked from the documentation index.
2. Seven to nine current production screenshots in `documentation/images/user-guide/`.
3. Descriptive alt text and a short explanatory caption for every screenshot.
4. Independent audit records and a durable controller journal.
5. Removal of superseded user-guide drafts, duplicate screenshot candidates and obsolete temporary notes before final approval.

## Audience and boundaries

The primary audience is a first-time platform user with general market knowledge. The guide must distinguish:

- public dashboards from owner-authenticated workspaces;
- short-term Market Assessment from long-term Opportunity Assessment;
- Technical, AI and Market Convergence views;
- monitoring/research features from trade execution;
- strategy research and `continue_testing` outcomes from live-trading approval.

The guide must state plainly that the platform does not place live trades and that displayed research is not personalised financial advice.

## Screenshot policy

Screenshots are useful where they clarify navigation, dashboard layout or interpretation. They must:

- come from the current production deployment and real production-backed states;
- never fabricate rows, prices, scores, evidence, alerts or performance;
- exclude or obscure email addresses, user identifiers, tokens and other personal or secret data;
- use a stable viewport appropriate to the documented experience;
- avoid repetitive images that add no instructional value;
- be stored with descriptive lowercase filenames;
- include meaningful alt text and captions in the guide;
- be re-captured if the visible UI materially differs at final audit.

Authenticated screenshots may be captured only from an already-authorised owner session. If that session is unavailable, record `AUTH_REQUIRED`; never request, reveal or store a password.

## Work gates

Only one gate may be active at a time.

| ID | Status | Gate | Definition of done |
|---|---|---|---|
| UGUIDE-001 | **IN PROGRESS** | Establish guide structure and evidence inventory | Create the guide skeleton with audience, boundaries, task sequence and screenshot manifest; map every section to current routes and canonical documentation; record public/authenticated access needs; remove any superseded user-guide draft found at the canonical path. |
| UGUIDE-002 | **PLANNED** | Document public navigation and assessment dashboards | Explain navigation, Markets, instrument detail, Market Assessment, Technical/AI/Convergence interpretation and Opportunity themes; add current production screenshots for the dashboard/Markets/Assessment/Opportunity flows; verify all statements against source, production and persisted data where relevant. |
| UGUIDE-003 | **PLANNED** | Document signed-in monitoring workspaces | Explain sign-in boundaries, Watchlists, Alerts and event history with owner-isolation and safe-use notes; add current authenticated screenshots where access exists; otherwise record a precise `AUTH_REQUIRED` blocker without inventing content. |
| UGUIDE-004 | **PLANNED** | Document strategy, operations and support | Explain strategy results including `continue_testing`, Admin/data-health indicators, data freshness, status colours, empty states and common troubleshooting; add the strategy/Admin and one representative mobile screenshot; add a compact glossary. |
| UGUIDE-005 | **PLANNED** | Final assembly and publication QA | Reconcile the whole guide against current production; validate every route, link, image, caption and alt text; confirm no private or fabricated information; remove duplicate/obsolete guide artifacts; link the guide from `documentation/README.md`; record final audit evidence and mark the project complete. |

## Producer rules

The Producer:

1. Retrieves this plan and the controller journal fresh at the start of every run.
2. Works on exactly one eligible `NEXT` or returned `IN PROGRESS` gate.
3. Records `BUILD_ATTEMPT_STARTED` in the journal before material work.
4. Implements the whole bounded gate, including evidence and documentation cleanup within its scope.
5. Verifies routes, claims, links and screenshots rather than relying on memory.
6. Changes the gate only to `IN REVIEW`; it must not mark its own work `DONE` or promote a successor.
7. Writes the complete handoff defined below.
8. Makes no application, database, security-policy, schedule or production-data changes.

## Auditor rules

The Auditor:

1. Retrieves this plan, the controller journal and the exact implementation commit/range fresh.
2. Audits only the sole `IN REVIEW` gate.
3. Independently verifies the complete Definition of Done using current GitHub, production, browser and read-only Supabase evidence as applicable.
4. Checks screenshot currency, instructional value, privacy, captions, alt text, route accuracy and consistency with real persisted data.
5. On failure, records one complete correction set, changes the gate to `IN PROGRESS`, assigns it to the Producer and stops.
6. On pass, records `PASS` or `PASS WITH ADVICE`, marks the gate `DONE`, and promotes exactly one next `PLANNED` gate to `NEXT`.
7. After UGUIDE-005 passes, records `USER_GUIDE_PROJECT_COMPLETE` and promotes no successor.
8. Never implements the Producer's gate while acting as Auditor.

## Mandatory handoff

Every Producer handoff must include all fields:

```yaml
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

Every Auditor handback must include:

```yaml
task_id:
handoff_from: AUDITOR
handoff_to: PRODUCER
handoff_status: REWORK_REQUIRED
audit_record:
implementation_commit_or_range_reviewed:
checks_performed:
complete_correction_set:
known_limitations:
exact_next_action:
```

## Incomplete-handoff protocol

The controllers communicate through `documentation/user-guide-controller-journal.md` and the task audit record; scheduled runs do not assume a direct chat channel.

If a controller finds no exact handoff, a conflicting state or any missing mandatory field, it must not guess or continue implementation/audit. It must append a `HANDOFF_QUERY` naming the other controller, identify each missing or conflicting item, assign the handoff back to that controller, and stop. The receiving controller must answer the query in the journal before any gate can advance.

For a malformed Producer handoff, the Auditor returns the gate to `IN PROGRESS`. For a malformed Auditor handback, the Producer leaves the gate `IN PROGRESS` and requests the complete correction set. A query is resolved only by a later journal entry containing an explicit answer and corrected full handoff.

## Completion criteria

The project is complete only when:

- all five gates are `DONE` following independent audit;
- the canonical guide is linked from the documentation index;
- all documented routes and images resolve;
- every screenshot is current, useful, captioned, accessible and privacy-safe;
- no fabricated platform state appears;
- signed-in-only steps are clearly identified;
- obsolete guide drafts, duplicate images and temporary reconciliation notes are absent;
- the final journal state is `USER_GUIDE_PROJECT_COMPLETE`.

## Current controller handoff

```yaml
task_id: UGUIDE-001
handoff_owner: PRODUCER
handoff_status: HANDOFF_QUERY
current_status: IN PROGRESS
query_record: documentation/user-guide-controller-journal.md
query_reason: project plan and Producer journal name different implementation ranges; exact audit target is ambiguous
next_action: Producer must answer the HANDOFF_QUERY with one corrected full handoff and make the plan, journal and audit record agree before resubmitting UGUIDE-001
```
