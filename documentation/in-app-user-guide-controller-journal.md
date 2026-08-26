# In-App User Guide — Controller Journal

This journal is the durable state and handoff record for the small agentic project that publishes the canonical Trading Platform User Guide inside the app.

Authoritative project plan: `documentation/in-app-user-guide-project-plan.md`  
Controller specification: `automation/in-app-user-guide-agentic-controller.md`

## Current state

```yaml
project_status: IN_APP_USER_GUIDE_PROJECT_COMPLETE
active_task: none
active_task_status: DONE
handoff_owner: none
handoff_status: COMPLETE
completed_task: APPGUIDE-002
audit_decision: PASS
next_action: none — project complete
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


### 2026-08-26T13:31:00+08:00 — BUILD_ATTEMPT_STARTED

```yaml
event: BUILD_ATTEMPT_STARTED
task_id: APPGUIDE-002
controller: PRODUCER
starting_commit: 9aed5a075a4a86677df8c0c256671e6802d4c4eb
plan_blob: 3f94dc308f74468b832edb837cf5cea1eaaf0ff5
journal_blob_before_start: eb3f42dc4a71b9c75f4e58f91b1ee5d9b91ee69c
controller_blob: 279b60b128f006c8903f02c70a968d86430e715a
canonical_guide_blob: 68bdfc34e106f95eaaaf286299100ed93994619e
development_workflow_blob: e04dfa048b5b42767db4feb43d86f3738cd3c07c
app_nav_blob: 0e122a5efdb5c8fdbe6be00581533f8496857819
frontend_route_map_blob: d0b4cf1e8c01a225fbd409263af5e184286bab97
package_blob: 71a52a374274ce3b8b50c75531dfd950bcf5d268
production_baseline_deployment: dpl_29tXzvNwBi5h2TeEJNHodENaERSY
plan_state_observed: APPGUIDE-001 DONE; APPGUIDE-002 NEXT
handoff_observed: APPGUIDE-002 AUTHORISED to PRODUCER with no unresolved HANDOFF_QUERY
intended_scope: add Help to the primary navigation, add deterministic navigation/reconciliation checks, minimally reconcile the canonical guide and documentation index/route map, deploy through the normal production path, and verify production desktop plus 390x844 behaviour; do not make Supabase, auth, trading-methodology or schedule changes
data_or_schema_effects: none
```


### 2026-08-26T13:49:14+08:00 — PRODUCER_HANDOFF

```yaml
task_id: APPGUIDE-002
handoff_from: PRODUCER
handoff_to: AUDITOR
handoff_status: READY_FOR_AUDIT
implementation_commit_or_range: bed0f674f6b317f7d13390d5f262d1e9b8b290f6
files_changed:
  - components/AppNav.tsx
  - documentation/README.md
  - documentation/frontend-route-map.md
  - documentation/user-guide.md
  - tests/in-app-user-guide.test.mjs
generated_or_build_only_artifacts:
  - public/generated/user-guide/* remains generated from canonical documentation screenshots and ignored by Git
routes_and_viewports_verified:
  - local production-mode /help at desktop and exactly 390x844
  - current production /help on deployment dpl_EKWjsb1AGoiU95rcdE5WmaETucf1 at desktop and exactly 390x844
  - /help#compact-glossary direct heading navigation
data_or_schema_effects: none
tests_and_checks:
  - npm install --no-package-lock: zero reported vulnerabilities
  - npm test: 10/10 PASS
  - npm run check:palette: PASS
  - npm run build: PASS; /help static prerender and six canonical screenshot assets published
  - local browser QA: run 32935199838 / job 98074993878 PASS
  - production HTML/alias verification: dpl_EKWjsb1AGoiU95rcdE5WmaETucf1 shows active Help navigation and canonical in-app wording
  - production browser QA: run 32935393876 / job 98075534280 PASS
  - privacy/secret-pattern checks: PASS
  - temporary APPGUIDE-002 workflows removed before handoff
documentation_impact:
  - canonical user guide minimally identifies its in-app /help rendering route and Help access row
  - documentation/README.md records the canonical guide is rendered in-app
  - documentation/frontend-route-map.md records the primary Help navigation contract
single_source_of_truth_evidence:
  - documentation/user-guide.md remains the only editable guide prose source
  - APPGUIDE-002 did not change app/help/page.tsx, lib/user-guide.ts or the canonical screenshot generation pipeline
  - Help navigation only links to /help; it does not duplicate guide prose
known_limitations:
  - no blocking limitations
  - owner-only Watchlists/Alerts/Strategy screenshots remain under the completed canonical guide's AUTH_REQUIRED policy; this gate does not alter that policy
acceptance_criteria_evidence:
  functional_commit: bed0f674f6b317f7d13390d5f262d1e9b8b290f6
  producer_evidence: documentation/in-app-user-guide-audits/APPGUIDE-002.md
  production_deployment: dpl_EKWjsb1AGoiU95rcdE5WmaETucf1
  local_browser_run: 32935199838 / 98074993878
  production_browser_run: 32935393876 / 98075534280
  mobile_metrics: document 375px; article 355px; Help target 44px; nav 350/818px client/scroll; table 319/680px client/scroll; image 321px at 390x844
exact_next_action: Auditor retrieves the current plan, journal, APPGUIDE-002 evidence record, functional commit and current production fresh; independently reproduces the final acceptance criteria and either returns one complete correction set or records IN_APP_USER_GUIDE_PROJECT_COMPLETE. Producer does not continue in this run.
```


### 2026-08-26T13:55:49+08:00 — AUDIT_DECISION

```yaml
event: AUDIT_DECISION
task_id: APPGUIDE-002
controller: AUDITOR
decision: PASS
implementation_commit_or_range_reviewed: bed0f674f6b317f7d13390d5f262d1e9b8b290f6
producer_evidence_commit_reviewed: 78f16592c2d0db3542d064033266033ba59e5850
audit_record: documentation/in-app-user-guide-audits/APPGUIDE-002.md
independent_evidence: GitHub Actions run 32935825791 / job 98076732661 PASS
checks_performed:
  - exact five-file functional commit independently inspected
  - current components/AppNav.tsx confirms Help /help entry and shared active-state rule
  - current app/help/page.tsx and lib/user-guide.ts confirm documentation/user-guide.md remains the sole editable guide prose source
  - npm test independently reproduced 10/10 PASS
  - npm run check:palette independently reproduced PASS
  - npm run build independently reproduced PASS with /help static prerender and six canonical screenshot assets
  - local production-mode browser audit passed desktop and exactly 390x844
  - live production browser audit passed desktop and exactly 390x844
  - Help visible focus treatment, native focusability and Enter activation independently verified
  - active-state switching verified: Help active on /help and not active on /markets while Markets is active
  - canonical title, research/no-live-trading/no-personalised-advice boundaries, four-plus tables, all six screenshots, representative GitHub documentation links and direct #compact-glossary anchor independently verified
  - privacy/secret-pattern checks independently passed
  - mobile metrics independently reproduced: document 375px; article 355px; Help target 44px; nav 350/818px client/scroll; table 319/680px client/scroll; image 321px at 390x844
  - temporary Auditor workflow removed; fresh .github/workflows lookup returned 404
complete_correction_set: none
project_status_after_audit: IN_APP_USER_GUIDE_PROJECT_COMPLETE
next_task_promoted: none
exact_next_action: none; the in-app User Guide project is complete
```
