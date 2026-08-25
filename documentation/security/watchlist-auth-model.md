# Watchlist Authentication and Ownership Model

**Task:** MON-001 — Decide watchlist/auth model  
**Decision date:** 23 August 2026  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Status:** Architecture/access decision only. Watchlist writes remain disabled until MON-002 implements and independently verifies this contract.

## Purpose

Define the identity, ownership and access rules for user watchlists before any browser or public client can write watchlist data.

This decision is intentionally separate from MON-002. MON-001 defines the contract; MON-002 may implement schema hardening, authentication UI/session handling, RLS policies and watchlist write flows only after this contract passes independent audit.

## Current live baseline

Verified against Supabase before this decision:

- `public.watchlists` and `public.watchlist_items` already exist.
- `watchlists.owner_user_id` references `auth.users(id)` with `ON DELETE CASCADE`, but is currently nullable.
- `watchlist_items` is keyed by `(watchlist_id, instrument_id)` and cascades from its parent watchlist.
- both watchlist tables have RLS enabled;
- neither table currently has an RLS policy;
- the `anon`, `authenticated` and `service_role` database roles currently retain broad table grants, but with RLS enabled and no policies browser/API row access is denied;
- `auth.users` currently contains zero users;
- one legacy `Starter Watchlist` exists with `owner_user_id IS NULL`, one instrument item and `is_default = true`;
- no trigger currently maintains `watchlists.updated_at`;
- the frontend `lib/supabase.ts` client is deliberately public/read-only and uses `persistSession: false` / `autoRefreshToken: false`;
- the scaffolded `alerts` table already uses the same nullable `owner_user_id → auth.users(id)` identity pattern, so the monitoring subsystem can share one ownership model.

The existing ownerless Starter Watchlist is a historical test fixture, not a public/global watchlist and not user-owned production data.

## Decision summary

### Identity authority

Supabase Auth is the canonical end-user identity provider for monitoring features.

- `auth.users.id` is the canonical owner identifier.
- v1 watchlists are available only to **permanent authenticated users**.
- unauthenticated visitors remain able to use the existing public Market/Assessment/Opportunity read surfaces, but they cannot read or mutate private watchlists.
- Supabase anonymous users are not accepted as watchlist owners in v1. If anonymous sign-in is introduced elsewhere later, watchlist policies must explicitly reject JWTs whose `is_anonymous` claim is true.
- no separate application `users` table is required merely to own a watchlist. A profile table may be added later for display/preferences, but it must not replace `auth.users.id` as the authorization key.

### Authentication UX

MON-002 should introduce a normal Supabase Auth session for users who choose to use watchlists.

Preferred v1 sign-in is email-based Supabase Auth (magic link / OTP or an equivalent permanent email identity). OAuth may be added later without changing the ownership model because all providers resolve to the same `auth.users.id`.

The implemented Next.js workspace uses request-safe authenticated session handling rather than converting the module-level public data client into a shared persistent session client. Public dashboard reads remain usable without login.

### Ownership

Each watchlist has exactly one owner.

- `watchlists.owner_user_id` must be non-null before writes are enabled.
- on insert, `owner_user_id` must equal the authenticated user's `auth.uid()`.
- ownership is immutable through normal client updates; users cannot transfer a watchlist by changing `owner_user_id`.
- deleting an Auth user may cascade-delete that user's watchlists and, through existing foreign keys, their watchlist items.
- watchlist items inherit ownership exclusively through `watchlist_id`; `watchlist_items` does not need a duplicate owner column.
- v1 has no shared/team/public watchlists and no cross-user collaboration.

The same ownership key should be reused by future `alerts.owner_user_id` work under MON-003/MON-004.

## Access matrix

| Actor | Watchlist metadata | Watchlist items | Mutation |
|---|---|---|---|
| Unauthenticated / `anon` | No access | No access | No access |
| Permanent authenticated user | Own watchlists only | Items belonging to own watchlists only | Create/update/delete own data only |
| Authenticated anonymous Supabase user | No access in v1 | No access in v1 | No access in v1 |
| Another authenticated user | No access | No access | No access |
| Trusted `service_role` / migration path | Administrative access as required | Administrative access as required | Backend/migration only; never exposed to the browser |

Watchlist names, descriptions, notes, ordering and membership are private user data in v1. There is no public read policy.

## Implemented database boundary

MON-002 implemented this contract before enabling watchlist writes. The requirements below remain the active ownership and security boundary.

### Schema hardening

1. Remove the legacy ownerless Starter Watchlist (and its cascading test item) or explicitly migrate it to a real permanent user before changing nullability. It must not be silently assigned to an arbitrary account.
2. Make `watchlists.owner_user_id` `NOT NULL`.
3. Add an index on `watchlists(owner_user_id)` because ownership is the primary RLS/filter key.
4. Enforce at most one default watchlist per owner, preferably with a partial unique index on `owner_user_id WHERE is_default`.
5. Ensure `updated_at` is maintained on watchlist updates if the UI relies on it.
6. Retain the existing `(watchlist_id, instrument_id)` primary key so an instrument cannot be duplicated within one list.

A user may temporarily have zero watchlists. The first successfully created list becomes the default when no default exists. Deleting a default either promotes another owned list transactionally or leaves no default until the next list is created; two defaults are never permitted.

### Grants

Before client writes are enabled:

- revoke all watchlist privileges from `anon`;
- do not grant `TRUNCATE`, `TRIGGER` or `REFERENCES` to normal authenticated clients;
- grant only the row operations required by the product (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) to `authenticated`;
- trusted backend/service access remains server-only and must never be represented by a public environment variable.

RLS is the row authorization boundary; minimal grants are an additional defense-in-depth boundary.

### RLS contract

Policies must be scoped `TO authenticated` and must reject anonymous Auth users if that feature is ever enabled.

Conceptually, watchlist policies are:

- **SELECT:** existing row is visible only when `owner_user_id = auth.uid()`;
- **INSERT:** new row is accepted only when `owner_user_id = auth.uid()`;
- **UPDATE:** existing row must be owned by `auth.uid()` and the resulting row must remain owned by the same user;
- **DELETE:** row must be owned by `auth.uid()`.

Use the optimized `(select auth.uid())` form in policies and make the permanent-user intention explicit, for example by requiring the JWT `is_anonymous` claim not to be true.

For `watchlist_items`, every operation must require that the referenced parent `watchlists.id` belongs to the current user. An `EXISTS` ownership check against the parent watchlist is acceptable because the parent has a direct non-recursive ownership policy. Do not infer item ownership from client-supplied data.

## Application boundary for MON-002

- The public Market/Assessment/Opportunity application remains readable without authentication.
- A signed-out user may see a non-mutating “Sign in to use watchlists” affordance, but must not be given optimistic/local-only watchlist persistence that looks server-backed.
- A signed-in permanent user may read and mutate only their own lists through the publishable-key client plus RLS.
- The application should include the current user ID as an explicit query filter where practical, even though RLS remains authoritative.
- Never use a service-role/secret key in the browser to bypass RLS.
- Server-rendered authenticated content must use a request-scoped session/client so one user's session cannot leak into another request.

## Required MON-002 verification matrix

MON-002 is not complete merely because a watchlist can be added in the UI. Builder and Auditor should verify at least:

1. unauthenticated requests cannot select, insert, update or delete either watchlist table;
2. authenticated permanent user A can create a list owned by A;
3. A can add, update, reorder and delete items only inside A's list;
4. authenticated permanent user B cannot read or mutate A's list or items, even when A's UUID/watchlist UUID is known;
5. an insert/update cannot forge or transfer `owner_user_id`;
6. duplicate instruments within one list remain rejected by the existing primary key;
7. at most one default list can exist per owner;
8. user deletion/cascade behaviour is deliberate and tested;
9. current public dashboard routes remain healthy while signed out;
10. no privileged Supabase credential is required by the frontend;
11. if anonymous Auth is enabled in the project, an anonymous authenticated JWT is denied watchlist access;
12. the legacy ownerless Starter Watchlist is explicitly removed or deliberately migrated before ownership becomes mandatory.

## Out of scope for MON-001

- enabling authentication in production;
- creating Auth users;
- adding RLS policies or changing grants;
- deleting/migrating the Starter Watchlist;
- enabling watchlist UI writes;
- shared/team watchlists;
- alert trigger semantics or notification delivery;
- admin impersonation/support tooling.

Those are implementation or later monitoring tasks. This document only establishes the mandatory ownership and access boundary that must exist before writes are enabled.
