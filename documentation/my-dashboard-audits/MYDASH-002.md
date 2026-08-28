# MYDASH-002 — Producer evidence

**Gate:** Secure personal foundation and dashboard shell
**Role:** PRODUCER
**Status:** BLOCKED — production promotion permission required
**Candidate branch:** `codex/mydash-002-secure-foundation`
**Functional commit:** `cf200f005ea6659e2c12daf9177008e10bebf45a`

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
- Preview deployment `dpl_EcbDxNqcyougutshNyPqY3AynzqR` reached `READY` for commit `cf200f005ea6659e2c12daf9177008e10bebf45a`.

## PR review correction cycle

- The initial review found three privacy/honesty defects; commit `ebd18e6f28638e6f4c7b943ade95d1ce0d312db1` corrected them.
- The first re-review found same-owner token-refresh and cross-tab failure-state defects; commit `f4f1da35fe62f99adab9c3998d1dfa2c8179e118` corrected them.
- The second re-review found stale candidate identity and response-row-limit defects. Functional commit `cf200f005ea6659e2c12daf9177008e10bebf45a` now uses exact count queries, paginated watchlist IDs, batched/paginated watchlist-item retrieval, and this handoff names the corrected candidate.
- The final correction also uses an owner-key upsert for cross-tab preference races and a palette-safe button foreground.\n- Promotion remains prohibited until the corrected candidate receives a clean independent PR review and a READY build.

## Exact blocker

The repository safety policy rejected publishing the nine-file implementation directly to the default `main` branch. The candidate was therefore persisted on a review branch. Its Vercel preview is protected and, after authorised preview access, the route rendered the application error boundary because Preview does not have `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Production remains on `abc0f4d4fd879b781dd9c84d3aed8396f67cd355` and therefore does not contain the new route.

Copying Production's Supabase settings into Preview would connect an unaudited preview to production data, so the Producer did not broaden the environment boundary. Desktop, 390 × 844, keyboard and authenticated production UI checks are consequently not complete.

## Handoff fields

    task_id: MYDASH-002
    handoff_from: PRODUCER
    handoff_to: TRAVIS
    handoff_status: PRODUCTION_PROMOTION_REQUIRED
    implementation_commit_or_range: cf200f005ea6659e2c12daf9177008e10bebf45a
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
    exact_next_action: obtain a clean independent review and READY build for corrected functional commit cf200f005ea6659e2c12daf9177008e10bebf45a; only then merge PR #24, verify production desktop, 390 × 844, keyboard, signed-out and authenticated states, and resume the Controller for independent audit.
