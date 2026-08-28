# MYDASH-002 — Producer evidence

**Gate:** Secure personal foundation and dashboard shell
**Role:** PRODUCER → independent AUDITOR
**Status:** PASS_WITH_ADVICE — independent audit complete; authenticated/mobile direct evidence advisory
**Candidate branch:** `codex/mydash-002-secure-foundation`
**Functional commit:** `bf7008fb60786a7b51522ab2956779b17a733723`

## Bounded implementation

- Added owner-scoped `user_market_preferences` and `user_market_interests` tables.
- Added explicit grants, permanent-user RLS policies and anonymous-session rejection.
- Added the authenticated `/my-dashboard` shell with Today, Recommendations, Watchlists, Opportunities, Portfolio Health and Decision Lab tabs.
- Today reads only persisted preferences, Watchlists and interests. Later-gate surfaces remain explicit empty states.
- Added loading, signed-out, anonymous, empty, error and retry states without service-role browser access.
- Added primary navigation and aligned route/data-model documentation.

## Schema and privacy evidence

- Applied migrations:
  - `20260827141424_my_dashboard_secure_personal_foundation_v1`
  - `20260827141836_my_dashboard_interest_fk_indexes`
- Post-migration schema fingerprint: `0a543ca0a5c02f37dde674dd986b9908`.
- `user_market_preferences`: RLS enabled, three owner policies, zero rows after rolled-back fixtures.
- `user_market_interests`: RLS enabled, four owner policies, zero rows after rolled-back fixtures.
- Two-permanent-user transaction test:
  - owner A could read its own fixture;
  - owner B read zero owner-A rows;
  - owner B's owner-A write failed with SQLSTATE `42501`;
  - an anonymous JWT read zero rows and its write failed with SQLSTATE `42501`;
  - the transaction rolled back.
- Supabase security advisors reported no finding for either new table or its timestamp trigger.
- Foreign-key advisor findings for instrument/theme were resolved by the second migration.

## Checks

- `npm test`: 12/12 passed.
- `npm run build`: passed; Next.js emitted `/my-dashboard`.
- `git diff --check`: passed.
- Static gate tests verify six tabs, keyboard handlers, permanent-user ownership predicates, anonymous rejection and absence of service-role browser code.
- PR correction regression suite: 8/8 passed for owner-transition invalidation, token-refresh edit preservation, default resets, honest global failure states, exact counts and paginated distinct-instrument retrieval.
- Preview deployment `dpl_Bd5igFGGxHFDVTGXxk6TttkKPMCf` reached `READY` for commit `bf7008fb60786a7b51522ab2956779b17a733723`.

## PR review correction cycle

- The initial review found three privacy/honesty defects; commit `ebd18e6f28638e6f4c7b943ade95d1ce0d312db1` corrected them.
- The first re-review found same-owner token-refresh and cross-tab failure-state defects; commit `f4f1da35fe62f99adab9c3998d1dfa2c8179e118` corrected them.
- The second re-review found stale candidate identity and response-row-limit defects. Functional commit `bf7008fb60786a7b51522ab2956779b17a733723` now uses exact count queries, paginated watchlist IDs, batched/paginated watchlist-item retrieval, and this handoff names the corrected candidate.
- The final correction also uses an narrow update-first, insert-on-missing and duplicate-race retry flow for cross-tab preference saves and a palette-safe button foreground.
- Promotion completed after PR #24 received its final review and merge; production verification is recorded below.

## Historical pre-merge blocker (resolved)

The repository safety policy initially required PR #24 rather than direct publication to `main`, and the protected Preview lacked public Supabase variables. That boundary was preserved. PR #24 was subsequently merged on 28 August 2026; production deployment and signed-out route verification are recorded in the independent Auditor result below.

## Handoff fields

    task_id: MYDASH-002
    handoff_from: PRODUCER
    handoff_to: TRAVIS
    handoff_status: AUDIT_PASS_WITH_ADVICE
    implementation_commit_or_range: bf7008fb60786a7b51522ab2956779b17a733723
    delivery_control_commits: abc0f4d4fd879b781dd9c84d3aed8396f67cd355
    files_changed: app/my-dashboard/page.tsx; components/AppNav.tsx; components/MyDashboardClient.tsx; components/MyDashboardClient.module.css; two Supabase migrations; route/data-model docs; gate test
    migrations_and_schema_effects: two production migrations applied; two empty owner-scoped tables and supporting indexes
    rls_and_permission_evidence: seven permanent-owner policies; narrow grants; cross-user and anonymous denial reproduced
    source_data_and_cutoffs: Supabase project glvbqcplgjdfgjyknzsa at 27 August 2026; no fixtures retained
    calculation_or_methodology_version: my-dashboard-contract-v1; no return calculation in this gate
    tests_and_checks: original npm test 12/12; corrected focused regression 8/8; original npm run build PASS; corrected-candidate Vercel build pending; diff check PASS; Supabase advisors checked
    routes_and_viewports_verified: preview deployment READY; route blocked by absent Preview public Supabase configuration; production viewports not verified
    privacy_and_cross_user_evidence: two permanent users plus anonymous JWT tested in one rolled-back transaction
    documentation_impact: frontend route map and Supabase data model aligned
    known_limitations: candidate is not on main or production; Preview lacks public Supabase configuration; no authenticated UI evidence
    acceptance_criteria_evidence: schema/RLS/build criteria pass; deployed responsive/authenticated UI criteria remain unverified
    exact_next_action: MYDASH-003 is the sole successor gate; repeat authenticated two-user and 390 × 844 keyboard verification when a signed-in browser session is available.


## 28 August 2026 — Independent Auditor result

- Role performed: `AUDITOR` only; no implementation, schema or production-data changes were made.
- Beginning state observed: `MYDASH-002 / IN_REVIEW / INDEPENDENT_PR_REVIEW`. Primary evidence reconciled the stale pre-merge handoff: PR #24 is merged at `9a009e25f5d190810ac3f4e0f40d48178a6e54e7`, with final branch head `445821367aa1f96bdc4b202874b034a23218962f`.
- Production evidence: `https://discoverbouldersmarkets.vercel.app/my-dashboard` returned HTTP 200 from Vercel deployment `dpl_8fbeGGvrneidEM8EJiPgB84M2Mp1`. The signed-out page visibly states that the workspace is private, does not place trades or connect to a broker, and that signed-out/anonymous sessions cannot read personal dashboard tables.
- Supabase evidence (project `glvbqcplgjdfgjyknzsa`): `user_market_preferences` and `user_market_interests` exist with RLS enabled; policy counts are 3 and 4 respectively. Policies require a non-null `auth.uid()`, reject `is_anonymous=true`, and require `owner_user_id = auth.uid()` for SELECT/INSERT/UPDATE/DELETE as applicable. Authenticated column grants are narrow; the owner key is not update-granted. The production tables currently contain zero personal rows.
- Independent SQL checks: two permanent-user authenticated contexts each saw zero personal rows; an anonymous role had no table SELECT privilege. These checks were read-only.
- Frontend checks: six tab labels and the signed-out privacy boundary were visible; desktop layout had no horizontal overflow at 1363 × 936. Production styles include explicit narrow-screen media rules (including max-width 640px, 760px and 900px). The current browser had no authenticated session and no viewport-resize control, so direct authenticated and 390 × 844 interaction evidence remains advisory rather than a new defect.
- Static implementation review confirmed shared loading/error guards, owner-change invalidation, exact count/pagination logic, narrow preference writes, no service-role browser code, and explicit empty states for unauthorised later gates.
- Gate decision: `PASS_WITH_ADVICE`. MYDASH-002 is complete and MYDASH-003 is the sole successor gate. The authenticated two-user UI flow and 390 × 844 keyboard pass should be repeated when a signed-in verification session is available; no implementation defect was found in this iteration.
- Handoff: `AUDITOR -> PRODUCER / MYDASH-003 NEXT`.
