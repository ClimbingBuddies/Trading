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

## Rework attempt — 24 August 2026

The deployment-only blocker has cleared. Production Vercel deployment `dpl_A5RqoAKgKfHy8Tvqdhh6yvuTEcJW` reached `READY` on commit `92aa5d2684f7f6439103b9d9554dd2a7ffa84f0b`; palette compliance, Next.js compilation and TypeScript checks passed, and production `/watchlists` is live.

The remaining Auditor finding is a hosted Supabase Auth URL configuration problem. The browser correctly requests:

`https://discoverbouldersmarkets.vercel.app/watchlists`

as the magic-link return URL, but live Auth verification logs show the redirect being replaced by:

`http://localhost:3000`

Supabase's supported hosted-project configuration requires the production origin to be configured as the Auth **Site URL** and the watchlist return URL to be present in the allowed **Redirect URLs**. The required production values are:

- Site URL: `https://discoverbouldersmarkets.vercel.app`
- Redirect URL: `https://discoverbouldersmarkets.vercel.app/watchlists`

The connected Supabase tool available to this Builder can inspect database/Auth logs, schema, policies and project metadata, but it does not expose a hosted Auth-config update action. The project contains no Supabase Management API credential in Vault and no repository Supabase CLI/config deployment path. Updating undocumented `auth` schema rows is not an acceptable substitute for the supported Auth configuration.

Therefore the Builder cannot safely complete this rework from the currently connected toolset. No RLS, browser credential or application-code workaround has been introduced. Once the hosted Auth URL configuration is updated through a supported account-authorised path, MON-002 can resume with a production magic-link return test, permanent-session verification and real watchlist CRUD verification before returning to independent review.

## Rework closure — 24 August 2026

The hosted Auth configuration was corrected through the supported Supabase project configuration surface and the Builder then re-ran the production verification from primary evidence.

### Production Auth/session evidence

Fresh Supabase Auth logs now show the fixed flow:

- a production `/otp` request at `2026-08-24T02:43:04Z` originated from `https://discoverbouldersmarkets.vercel.app/watchlists` and returned HTTP 200;
- the subsequent `/verify` request at `2026-08-24T02:43:21Z` returned HTTP 303 with the production `/watchlists` URL as the referer rather than localhost;
- the login event is for permanent Auth user `89b25c85-e64a-41f0-8421-80142c29e2db`;
- `/user` returned HTTP 200 at `2026-08-24T02:43:22Z` from the production application, confirming the authenticated session was established after the redirect.

### Real production-owned data

The authenticated production UI persisted a real default watchlist after that login:

- one watchlist named `Travis`;
- owner `89b25c85-e64a-41f0-8421-80142c29e2db`, matching the successful Auth login;
- `is_default = true`;
- two real watchlist items with sort orders 1 and 2;
- zero ownerless watchlists.

Fresh live security checks still show `owner_user_id` is not nullable, four RLS policies on `watchlists`, four on `watchlist_items`, and zero `anon` table grants.

### Rollback-only permanent-user CRUD check

Using the real permanent user's authenticated JWT claims in a rollback-only transaction, the Builder verified that the live policies and operations permit:

- editing watchlist details;
- selecting the default through `set_watchlist_default`;
- updating private item notes;
- reordering the two items;
- removing an item;
- deleting the owned watchlist.

The transaction was rolled back. Post-rollback verification confirmed the real watchlist and both real items were restored unchanged, with the original null description and notes retained.

### Source and production parity

The reviewed application state remains `154040b4a20152f380d0921878f8e4cecdcde1b5`. Comparing it with the resumed controller state `9a9a27ed141f4bd6f99b0b9b46d3fc46c27178fd` shows only `documentation/project-audits/MON-002.md`, `documentation/project-plan.md` and this document changed; no application or schema file drifted.

Vercel production deployment `dpl_JC2jPwHG1QB459CjWZWmRRTgbRjJ` is `READY` on `9a9a27ed141f4bd6f99b0b9b46d3fc46c27178fd`. Production `/watchlists` and `/markets` both return HTTP 200, and no production `error` or `fatal` runtime logs were present in the inspected one-hour window.

`lib/supabase-browser.ts` still uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, with persistent session, refresh and URL-session detection enabled. No privileged browser credential was introduced.

MON-002 is therefore ready for independent closure review. The Builder must return it to `IN REVIEW`; the Auditor remains responsible for the final PASS/REWORK decision, marking MON-002 DONE and promoting any next item.