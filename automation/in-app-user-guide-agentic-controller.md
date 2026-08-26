# In-App User Guide — Agentic Controller

Run one bounded controller iteration for the Discover Boulders Markets In-App User Guide project.

## Authoritative sources

At the beginning of every run, retrieve these fresh from GitHub:

1. `documentation/in-app-user-guide-project-plan.md`
2. `documentation/in-app-user-guide-controller-journal.md`
3. `documentation/user-guide.md`
4. `documentation/development-workflow.md`
5. every current implementation/documentation file relevant to the active gate
6. the active gate audit record if it exists

For APPGUIDE-001 the minimum current implementation set includes `package.json`, `components/AppNav.tsx`, `app/layout.tsx`, the `app/` route structure, relevant CSS/palette files and `documentation/frontend-route-map.md`.

For APPGUIDE-002 also inspect the exact APPGUIDE-001 passing implementation, current production deployment and current Vercel-rendered `/help` state.

Record the GitHub commit/blob identities used. Treat GitHub as authoritative for process and source; treat the current Vercel production deployment as authoritative for deployed UI behaviour. Use Supabase read-only evidence only if a rendered guide claim materially requires reconciliation. Never make Supabase changes under this project.

## Select exactly one role

Select the role once from the persisted state that existed at the beginning of the run. Do not switch role during the same run.

1. If `project_status: IN_APP_USER_GUIDE_PROJECT_COMPLETE`, report the completed state and make no changes.
2. If the sole active gate is `NEXT` or returned `IN PROGRESS` and `handoff_owner: PRODUCER`, run one Producer iteration on that gate only.
3. If the sole active gate is `IN REVIEW` and `handoff_owner: AUDITOR`, run one Auditor iteration on that gate only.
4. If the plan, journal and handoff disagree, or a mandatory handoff field is missing, record a `HANDOFF_QUERY` naming the responsible role, enumerate every conflict/missing field, assign it back, and stop. Do not infer the intended state.

## Producer iteration

The Producer must:

1. Record `BUILD_ATTEMPT_STARTED` in the journal before material work, including starting commit, observed gate/handoff, source identities and bounded intended scope.
2. Work only on the authorised active gate.
3. If the gate was returned for rework, implement the entire latest Auditor correction set before unrelated improvements.
4. Keep `documentation/user-guide.md` as the sole editable guide prose source. Generated build/public copies must be derived and uncommitted.
5. Follow `documentation/development-workflow.md`; update only canonical documentation affected by the implemented contract.
6. Run the complete gate acceptance checks, including `npm test`, palette compliance and `npm run build` where applicable.
7. For UI behaviour that requires deployed evidence, use the normal existing deployment path and verify current production where the gate definition requires it.
8. Persist gate evidence to `documentation/in-app-user-guide-audits/<GATE-ID>.md`.
9. Move the gate only to `IN REVIEW`, set `handoff_owner: AUDITOR`, and write the complete Producer handoff required by the project plan.
10. Never mark a gate `DONE`, never promote a successor, and never audit the Producer's own implementation.

If implementation cannot complete because of an external requirement, persist a precise blocker and evidence. Do not fabricate a passing state.

## Auditor iteration

The Auditor must:

1. Confirm there is exactly one `IN REVIEW` gate assigned to AUDITOR and a complete Producer handoff.
2. Retrieve the exact functional implementation commit/range and inspect the changed files independently.
3. Independently reproduce every gate-specific acceptance criterion. Producer test output is supporting evidence, not proof.
4. For APPGUIDE-001, verify at minimum:
   - `/help` source is `documentation/user-guide.md`, not duplicated prose;
   - Markdown headings, tables, lists, code and all canonical screenshots render correctly;
   - relative guide images and canonical-document links are transformed safely;
   - heading anchors work;
   - help styling uses platform theme/palette conventions;
   - narrow-screen tables/images remain usable;
   - `documentation/frontend-route-map.md` matches the implementation;
   - tests, palette check and production build pass;
   - no Supabase/data/auth/schedule effects occurred.
5. For APPGUIDE-002, verify at minimum:
   - Help is present in `components/AppNav.tsx` and active-state logic works;
   - keyboard/focus behaviour remains correct;
   - current production `/help` renders at desktop and exactly 390×844 CSS pixels;
   - representative heading anchor navigation works;
   - all existing guide screenshots render and preserve alt text;
   - representative Markdown table and documentation links work;
   - no page-level horizontal overflow or privacy leak exists;
   - canonical documentation is reconciled and temporary tooling is absent.
6. Never implement a fix while acting as Auditor.
7. On failure, write one complete correction set to the audit record, return the same gate to `IN PROGRESS`, set `handoff_owner: PRODUCER`, and stop.
8. On APPGUIDE-001 pass, record `PASS` or `PASS_WITH_ADVICE`, mark APPGUIDE-001 `DONE`, promote APPGUIDE-002 to `NEXT`, set `handoff_owner: PRODUCER`, and stop.
9. On APPGUIDE-002 pass, record `PASS` or `PASS_WITH_ADVICE`, mark APPGUIDE-002 `DONE`, set `project_status: IN_APP_USER_GUIDE_PROJECT_COMPLETE`, set `handoff_owner: NONE`, promote no successor, and stop.

## Handoff discipline

Use exactly the mandatory handoff fields in `documentation/in-app-user-guide-project-plan.md`.

Functional implementation identity must be unambiguous. Do not include self-referential evidence/journal commits inside the functional implementation target; list delivery-control commits separately.

If a handoff is incomplete, do not continue the gate. Persist a `HANDOFF_QUERY` and stop.

## Project boundaries

This controller is authorised to change application source, package dependencies, build scripts, Help-specific styling, navigation, tests and canonical documentation necessary to expose the guide in-app.

It is not authorised to change:

- Supabase schema, functions, data, RLS, grants or auth configuration;
- market/technical/AI/opportunity/strategy methodology;
- production trading behaviour;
- scheduled task cadence;
- canonical user-guide meaning beyond minimal publication-route wording required by the project.

## Terminal behaviour

When both gates are independently audited `DONE`, persist `IN_APP_USER_GUIDE_PROJECT_COMPLETE`, remove any temporary browser/audit helpers, report the final production `/help` route and stop. No further gate is promoted.
