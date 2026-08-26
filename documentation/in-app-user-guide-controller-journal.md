# In-App User Guide — Controller Journal

This journal is the durable state and handoff record for the small agentic project that publishes the canonical Trading Platform User Guide inside the app.

Authoritative project plan: `documentation/in-app-user-guide-project-plan.md`  
Controller specification: `automation/in-app-user-guide-agentic-controller.md`

## Current state

```yaml
project_status: ACTIVE
active_task: APPGUIDE-002
active_task_status: NEXT
handoff_owner: PRODUCER
handoff_status: AUTHORISED
completed_task: APPGUIDE-001
audit_decision: PASS
next_action: Producer retrieves authoritative state fresh, records BUILD_ATTEMPT_STARTED and implements APPGUIDE-002 only
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


### 2026-08-26T12:07:59+08:00 — PRODUCER_HANDOFF

```yaml
task_id: APPGUIDE-001
handoff_from: PRODUCER
handoff_to: AUDITOR
handoff_status: READY_FOR_AUDIT
implementation_commit_or_range: 7f0b31f939e49b4c6b9f40bcb068aba30766d92e^..1a336ee074a2d7177984c425ddc3ca0c948d4732
files_changed:
  - .gitignore
  - app/help/help.module.css
  - app/help/page.tsx
  - documentation/frontend-route-map.md
  - lib/user-guide.ts
  - package.json
  - scripts/sync-user-guide-assets.mjs
  - tests/in-app-user-guide.test.mjs
generated_or_build_only_artifacts:
  - public/generated/user-guide/* copied from the six canonical screenshots at dev/build time and ignored by Git
routes_and_viewports_verified:
  - production-mode local /help route rendered successfully after npm run build
  - static build route listing contains /help
data_or_schema_effects: none
tests_and_checks:
  - npm install --no-package-lock: zero reported vulnerabilities
  - npm test: 9/9 PASS
  - npm run check:palette: PASS
  - npm run build: PASS; /help static prerender
  - production-mode local HTML check: canonical title, research boundary, table, screenshot alt, before-you-begin anchor, rewritten GitHub doc link and generated screenshot path all PASS
  - Producer QA evidence: GitHub Actions run 32928898467 / job 98057174915
documentation_impact:
  - documentation/frontend-route-map.md updated for the new public /help route and canonical source contract
single_source_of_truth_evidence:
  - app/help/page.tsx calls loadUserGuideMarkdown and contains no copied guide prose
  - lib/user-guide.ts reads documentation/user-guide.md explicitly
  - only referenced canonical screenshots are copied as ignored build artifacts
  - deterministic integration tests enforce the canonical path/no-copy contract
known_limitations:
  - Help is not yet in components/AppNav.tsx because APPGUIDE-002 owns navigation
  - current Vercel production /help verification is intentionally deferred to APPGUIDE-002
acceptance_criteria_evidence:
  canonical_source: documentation/user-guide.md
  route: app/help/page.tsx
  styles: app/help/help.module.css
  source_and_link_mapping: lib/user-guide.ts
  asset_sync: scripts/sync-user-guide-assets.mjs
  automated_contract_tests: tests/in-app-user-guide.test.mjs
  route_documentation: documentation/frontend-route-map.md
  producer_evidence: documentation/in-app-user-guide-audits/APPGUIDE-001.md
  temporary_qa_cleanup: 86952a2f4e20025ddd6f8453b24e090d01a3cf60
exact_next_action: Auditor retrieves the exact functional range and current evidence fresh, independently reproduces APPGUIDE-001 acceptance criteria, and either returns one complete correction set or marks APPGUIDE-001 DONE and promotes APPGUIDE-002; Producer does not continue in this run
```


### 2026-08-26T12:34:21+08:00 — AUDIT_DECISION

```yaml
event: AUDIT_DECISION
task_id: APPGUIDE-001
controller: AUDITOR
decision: PASS
implementation_commit_or_range_reviewed: 7f0b31f939e49b4c6b9f40bcb068aba30766d92e^..1a336ee074a2d7177984c425ddc3ca0c948d4732
producer_evidence_commit_reviewed: 3448ae0aff8ffac6873d41b686645802b9b6e06b
audit_record: documentation/in-app-user-guide-audits/APPGUIDE-001.md
independent_evidence: GitHub Actions run 32930590164 / job 98061927379
checks_performed:
  - exact eight-file functional range independently inspected
  - canonical single-source and no-copy contract verified
  - 22 relative documentation links resolved
  - six generated screenshots byte-matched to canonical sources and loaded with alt text
  - 9/9 tests, palette compliance and production build independently passed
  - local production-mode desktop and 390x844 Help rendering independently passed
  - heading anchors, visible keyboard focus and contained table scrolling independently passed
  - current Vercel /help canonical render confirmed as supporting evidence
complete_correction_set: none
next_task_promoted: APPGUIDE-002
handoff_owner_after_audit: PRODUCER
exact_next_action: Producer implements APPGUIDE-002 navigation and production completion only; Auditor does not implement that gate
```
