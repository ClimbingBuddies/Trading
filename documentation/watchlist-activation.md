# Secure Watchlist Activation

**Task:** MON-002 — Activate watchlists  
**Date:** 23 August 2026  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

Implement the audited ownership and access contract from `documentation/security/watchlist-auth-model.md` so permanent Supabase Auth users can maintain private watchlists without exposing privileged credentials or cross-user data.

## Live database implementation

MON-002 applied the following production migrations:

- `supabase/migrations/20260823132000_activate_secure_user_watchlists.sql`
- `supabase/migrations/20260823132100_remove_redundant_watchlist_owner_index.sql`
- `supabase/migrations/20260823133500_optimize_watchlist_rls_auth_initplans.sql`

The resulting live boundary is:

- the legacy ownerless `Starter Watchlist` and its cascading test item were removed;
- `watchlists.owner_user_id` is `NOT NULL` and references `auth.users(id) ON DELETE CASCADE`;
- the existing owner index is retained;
- a partial unique index permits at most one `is_default = true` watchlist per owner;
- the first list inserted for an owner becomes default when no default exists;
- `watchlists.updated_at` is maintained by a private trigger function;
- `watchlists` and `watchlist_items` each have four owner-scoped RLS policies for SELECT/INSERT/UPDATE/DELETE;
- policies are restricted to `authenticated`, require `auth.uid()`, reject JWTs whose `is_anonymous` claim is true, and enforce parent ownership for watchlist items;
- `anon` has no privileges on either watchlist table;
- `authenticated` has only SELECT, INSERT, UPDATE and DELETE;
- trusted service access remains backend-only;
- `public.set_watchlist_default(uuid)` is a security-invoker RPC that can change only the current permanent user's default list.

After optimization, the Supabase performance advisor no longer reports `auth_rls_initplan` warnings for either watchlist table. Security advisor output contains no watchlist finding.

## Authenticated application path

The existing server/public Supabase client in `lib/supabase.ts` remains unchanged and non-persistent. MON-002 adds a separate browser-only authenticated client in `lib/supabase-browser.ts` using the same public project URL and publishable key with session persistence, token refresh and auth-return URL detection enabled.

No service-role or secret key is used by the browser.

`/watchlists` is implemented by:

- `app/watchlists/page.tsx`
- `components/WatchlistsClient.tsx`
- `components/WatchlistsClient.module.css`

`components/AppNav.tsx` exposes the route in the primary navigation.

Signed-out users receive an email magic-link sign-in form and cannot see or mutate watchlist data. The existing Markets, Assessments and Opportunities routes remain public.

Signed-in permanent users can:

- create private watchlists;
- select and maintain their own lists;
- update name and description;
- choose a default list through the owner-checked RPC;
- delete their own list;
- add active tracked instruments;
- update private notes;
- reorder instruments;
- remove instruments;
- sign out.

Application queries include explicit owner/list filters where practical, while database RLS remains the authoritative security boundary.

## Independent Builder verification performed

### Rollback-only database matrix

A transaction created temporary Auth users A and B, switched to the real `authenticated` role with user JWT claims, exercised the policies, then rolled back. No test users or watchlist rows were retained.

Verified:

- A can create, read and update A's lists and items;
- first-list default behavior works;
- duplicate instruments in one list remain rejected by the primary key;
- A cannot forge owner B or transfer ownership to B;
- B cannot read A's lists or insert into A's list even when identifiers are known;
- B can maintain an independent list;
- an authenticated anonymous JWT cannot read or insert watchlists;
- default-list RPC leaves one selected default;
- Auth-user deletion cascades owned watchlists/items;
- authenticated users can read the 30 active instruments used by the selector;
- `anon` has neither SELECT nor INSERT privileges on the watchlist tables.

The final optimized matrix returned `optimized MON-002 RLS matrix passed`.

### Current persisted state

After rollback tests:

- `auth.users`: 0 test rows retained;
- `watchlists`: 0 rows;
- `watchlist_items`: 0 rows;
- ownerless watchlists: 0.

A real user account will therefore create the first production-owned watchlist through the authenticated UI.

### Public-route regression

After the database migration, the current production `/markets` route returned HTTP 200 and continued to expose the public 30-instrument dashboard. Watchlist RLS/grant changes do not alter existing public assessment/market read tables.

## Deployment state at Builder handoff

The latest Vercel production deployment that actually ran is `dpl_DyULS4PDB5cfhzVhVUJBLzm65vZY`, READY on commit `c420a440343934b50735b7757162edd48a7f7724`.

Later frontend commits are complete in GitHub but Vercel did not create their builds because the Hobby project hit its build-rate limit. GitHub's Vercel status for the frontend state reports the platform `build-rate-limit` condition. This means `/watchlists` is not yet present in the current production deployment.

The Builder attempted an independent local production build, but the execution environment could not resolve `github.com`, so no local compilation result is claimed. The Auditor may deploy the exact unchanged reviewed repository state once Vercel permits another build, then independently verify the signed-out route, build/type/palette checks and authenticated browser flow.

## Activation gate

MON-002 should not be marked DONE until the Auditor confirms:

1. the reviewed frontend state builds successfully;
2. the production `/watchlists` route is live;
3. signed-out behavior is correct and existing public routes remain healthy;
4. the email-auth return flow is accepted by the project's configured Auth redirect policy;
5. authenticated browser CRUD behaves consistently with the already-verified RLS matrix;
6. no privileged frontend credential is introduced.
