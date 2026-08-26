# In-App User Guide — Agentic Project Plan

**Repository:** `ClimbingBuddies/Trading`  
**Production:** `https://discoverbouldersmarkets.vercel.app`  
**Canonical user guide:** `documentation/user-guide.md`  
**Controller journal:** `documentation/in-app-user-guide-controller-journal.md`  
**Controller specification:** `automation/in-app-user-guide-agentic-controller.md`  
**Audit records:** `documentation/in-app-user-guide-audits/<GATE-ID>.md`  
**Authorised:** 26 August 2026  
**Project size:** small, two audited gates

## Objective

Publish the existing canonical Trading Platform User Guide inside the production app without creating a second manually maintained guide.

The initial in-app route is `/help`. GitHub `documentation/user-guide.md` remains the only editable source of truth. The app may generate build artifacts from that file, but it must not introduce an independently editable copy of the guide prose.

## Scope

In scope:

- public read-only `/help` route;
- rendering the canonical Markdown guide, including tables, lists, code, headings and screenshots;
- stable heading anchors for direct links to guide sections;
- correct handling of relative guide images and canonical-document links;
- a Help item in the existing primary navigation;
- responsive, keyboard-usable and accessible presentation on desktop and narrow screens;
- documentation updates required by the new frontend route;
- production verification after deployment.

Out of scope for this small project:

- changing the content meaning of the completed user guide except where required to identify the new in-app route;
- context-sensitive Help links on individual dashboards;
- search, chat, AI Q&A or personalised help;
- authentication, Supabase schema/RLS, automation schedules, trading logic or production-data changes;
- a CMS or second documentation store.

Context-sensitive deep links may be added later as a separate enhancement after the base Help experience is stable.

## Current implementation facts

- The app uses Next.js App Router and React.
- Primary navigation is centralised in `components/AppNav.tsx`.
- The current package does not include a Markdown rendering dependency.
- The completed canonical guide already contains real screenshots under `documentation/images/user-guide/` and relative links to other canonical Trading documentation.

## Preferred technical design

The Producer should implement the simplest reliable design consistent with these constraints:

1. Add public route `app/help/page.tsx`.
2. Render `documentation/user-guide.md` as trusted repository-authored Markdown using `react-markdown` plus GitHub-flavoured Markdown support (`remark-gfm`). Use stable generated heading IDs such as `rehype-slug` so `/help#...` links work.
3. Do not enable raw arbitrary HTML parsing unless independently justified and audited; repository Markdown is sufficient for the current guide.
4. Read the canonical Markdown from the repository checkout on the server/build path rather than copying prose into a component.
5. Add a small build-time asset sync script that copies only referenced guide screenshots from `documentation/images/user-guide/` into an uncommitted generated public directory such as `public/generated/user-guide/`. The committed documentation images remain canonical.
6. Rewrite Markdown image URLs such as `images/user-guide/<file>` to the generated public asset path.
7. Rewrite relative canonical-document Markdown links to their GitHub `blob/main` URLs so links in the app do not become broken `/help/...` application routes.
8. Keep ordinary external links and in-guide heading links functional.
9. Style the help article with the existing theme tokens/palette system; do not create a disconnected visual theme.
10. Generated copies of assets must not be committed. A rebuild/deployment is the publication step that synchronises the current canonical GitHub guide into the app.

If a simpler implementation proves equally reliable under `npm run build` and production Vercel verification, the Producer may use it, but the single-source-of-truth and no-manual-copy rules are mandatory.

## Source-of-truth order

1. `documentation/user-guide.md` — canonical guide content.
2. GitHub application source — rendering/navigation contract.
3. Current Vercel production deployment — deployed behaviour.
4. Supabase production truth only if a guide claim being rendered needs reconciliation; this project itself authorises no data changes.

The repository development workflow remains mandatory. A new frontend route requires `documentation/frontend-route-map.md` review/update in the same implementation change.

## Work gates

Only one gate may be active at a time.

| ID | Status | Gate | Definition of done |
|---|---|---|---|
| APPGUIDE-001 | **DONE** | Render canonical guide at `/help` | Implement the public `/help` route from `documentation/user-guide.md`; add required Markdown dependencies and build-time screenshot publication; preserve tables, headings, code, links and images; provide stable heading anchors; map relative documentation links safely; add responsive article styles; update `documentation/frontend-route-map.md`; add automated tests/checks proving the app is sourced from the canonical file; `npm test`, palette check and production build pass. |
| APPGUIDE-002 | **DONE** | Navigation and production completion | Add Help to `components/AppNav.tsx`; verify active navigation state and keyboard access; deploy through the existing normal production path; independently verify `/help` on desktop and 390×844, all six existing screenshots, representative tables/links/anchors, no page-level horizontal overflow, and no accidental private information; update `documentation/user-guide.md` only to identify the in-app Help route if appropriate; remove temporary project tooling; complete final documentation reconciliation. |

## APPGUIDE-001 acceptance criteria

The gate is not ready for audit until all of the following are true:

- `/help` is public and read-only.
- The route visibly renders the current title and opening content from `documentation/user-guide.md`.
- No second hand-maintained guide prose file exists in `app/`, `components/`, `public/` or another directory.
- Markdown tables render as real accessible tables and remain usable on narrow screens.
- Every embedded screenshot used by the canonical guide resolves in the rendered Help page and remains responsive.
- Every screenshot preserves meaningful `alt` text from the Markdown source.
- Relative Markdown links to canonical Trading docs resolve to valid GitHub targets rather than broken application URLs.
- In-guide heading anchors are stable enough to support direct section links.
- Help presentation uses existing palette/theme tokens and preserves readable focus states.
- `documentation/frontend-route-map.md` contains `/help` with public read-only access and identifies `documentation/user-guide.md` as the content source.
- `npm test`, `npm run check:palette`, and `npm run build` pass.
- A deterministic check demonstrates that the route/build reads the canonical guide path rather than a duplicate prose copy.
- Data/schema effects are `none`.

## APPGUIDE-002 acceptance criteria

The gate is not ready for audit until all of the following are true:

- `components/AppNav.tsx` exposes a clear Help item linked to `/help`.
- Help receives the same active-navigation treatment as existing workspaces.
- Navigation remains keyboard operable and does not break narrow-screen horizontal navigation behaviour.
- Current production `/help` renders successfully at desktop and 390×844 viewports.
- The title, opening boundary text, at least one table, all delivered screenshots and representative internal/external documentation links render correctly in production.
- A direct `/help#...` section URL lands on the corresponding guide heading.
- No page-level horizontal overflow is introduced; tables may use contained horizontal scrolling when necessary.
- No email address, token, owner identity or fabricated private workspace state appears because of the Help publication.
- The canonical guide remains the sole editable prose source; generated public files are build artifacts only.
- `documentation/README.md`, `documentation/frontend-route-map.md` and the guide itself are reconciled where affected.
- Temporary browser/audit helpers are removed after evidence is persisted.
- Data/schema effects are `none`.

## Agentic role selection

Every controller run selects exactly one role from the persisted state that existed at the beginning of the run. It must not switch roles during the same run.

1. If `project_status: IN_APP_USER_GUIDE_PROJECT_COMPLETE`, report completion and make no changes.
2. If the sole active gate is `NEXT` or returned `IN PROGRESS` and `handoff_owner: PRODUCER`, act as Producer on that gate only.
3. If the sole active gate is `IN REVIEW` and `handoff_owner: AUDITOR`, act as Auditor on that gate only.
4. If state or the mandatory handoff is missing, malformed or contradictory, record a `HANDOFF_QUERY`, assign the exact issue back to the responsible role and stop rather than guessing.

## Producer rules

The Producer:

1. Retrieves this plan, controller specification, journal, canonical user guide, development workflow and current implementation files fresh at the start of every run.
2. Records the GitHub commit/blob identities used.
3. Records `BUILD_ATTEMPT_STARTED` before material implementation.
4. Works only on the sole authorised gate.
5. Addresses the entire latest Auditor correction set before any unrelated improvement.
6. Runs the gate's complete tests and documents evidence.
7. Updates canonical documentation affected by the actual implemented contract.
8. May move the gate only to `IN REVIEW`; it must never mark its own work `DONE`.
9. Writes the complete Producer handoff below.
10. Makes no Supabase/data/auth/schedule/trading-methodology changes under this project.

## Auditor rules

The Auditor:

1. Retrieves this plan, controller specification, journal, exact Producer handoff, implementation commit/range, current production deployment and relevant source fresh.
2. Audits only the sole `IN REVIEW` gate.
3. Independently reproduces evidence; Producer summaries are not sufficient.
4. For UI gates, checks desktop and 390×844 behaviour, keyboard/focus behaviour, loading/error behaviour where applicable, link/image resolution, accessibility, privacy and current production deployment.
5. Verifies the single-source-of-truth rule and rejects a manually duplicated guide.
6. Never fixes implementation while acting as Auditor.
7. On failure, records one complete correction set, returns the same gate to `IN PROGRESS`, assigns `PRODUCER`, and stops.
8. On pass for APPGUIDE-001, records `PASS` or `PASS_WITH_ADVICE`, marks it `DONE`, promotes APPGUIDE-002 to `NEXT`, assigns `PRODUCER`, and stops.
9. On pass for APPGUIDE-002, records `PASS` or `PASS_WITH_ADVICE`, marks it `DONE`, sets `project_status: IN_APP_USER_GUIDE_PROJECT_COMPLETE`, promotes no successor, and stops.

## Mandatory Producer handoff

```yaml
task_id:
handoff_from: PRODUCER
handoff_to: AUDITOR
handoff_status: READY_FOR_AUDIT
implementation_commit_or_range:
files_changed:
generated_or_build_only_artifacts:
routes_and_viewports_verified:
data_or_schema_effects: none
tests_and_checks:
documentation_impact:
single_source_of_truth_evidence:
known_limitations:
acceptance_criteria_evidence:
exact_next_action:
```

## Mandatory Auditor handback on rework

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

## Evidence and handoff protocol

- Durable evidence belongs in `documentation/in-app-user-guide-audits/<GATE-ID>.md`.
- The controller journal is append-only except for its Current state block.
- Functional implementation commits should be distinguished from control/evidence-only commits so the Auditor has an unambiguous audit target.
- Temporary GitHub Actions/browser helpers are permitted only when needed for independent verification and must be removed after evidence is captured.
- Producer and Auditor must not include their own control-metadata commit inside a self-referential functional implementation target.

## Completion criteria

The project is complete only when:

- APPGUIDE-001 and APPGUIDE-002 are both `DONE` following independent audits;
- `/help` is available in production and is reachable through the primary app navigation;
- the app renders the canonical GitHub guide without a manually maintained prose duplicate;
- screenshots, tables, links and heading anchors work in production;
- desktop and 390×844 experiences pass independent browser verification;
- route/documentation maps match the deployed contract;
- no private/fabricated information is introduced;
- temporary project tooling is absent;
- the controller journal records `IN_APP_USER_GUIDE_PROJECT_COMPLETE`.

## Current controller handoff

```yaml
task_id: APPGUIDE-002
handoff_owner: NONE
handoff_status: COMPLETE
current_status: DONE
project_status: IN_APP_USER_GUIDE_PROJECT_COMPLETE
completed_task: APPGUIDE-002
audit_decision: PASS
implementation_commit_reviewed: bed0f674f6b317f7d13390d5f262d1e9b8b290f6
producer_evidence_commit_reviewed: 78f16592c2d0db3542d064033266033ba59e5850
independent_audit_run: GitHub Actions run 32935825791 / job 98076732661 PASS
audit_helper_cleanup_commit: 7684d766370256d33f7d6e84a93342bd02b7dfd1
data_or_schema_effects: none
complete_correction_set: none
next_action: none — IN_APP_USER_GUIDE_PROJECT_COMPLETE
```
