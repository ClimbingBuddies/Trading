# Watchlist Authentication and Ownership Model

**Task:** MON-001 — Decide watchlist/auth model  
**Decision date:** 23 August 2026  
**Last reconciled:** 25 August 2026  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Status:** Implemented under MON-002 and independently audited

## Purpose

This document is the durable identity, ownership and access contract for private watchlists. Implementation and route details are maintained in [Watchlist Activation](../watchlist-activation.md).

## Identity authority

Supabase Auth is the canonical end-user identity provider for watchlists and alerts.

- `auth.users.id` is the owner identifier.
- V1 ownership is limited to permanent authenticated users.
- Unauthenticated visitors retain public read access to Market, Assessment and Opportunity surfaces but cannot read or mutate private monitoring data.
- Supabase anonymous-auth users are not accepted as owners.
- No separate application user table is required for authorisation.

The application uses request-scoped authenticated session handling. A service-role or secret credential must never be exposed to the browser.

## Ownership contract

Each watchlist has exactly one immutable owner.

- `watchlists.owner_user_id` is non-null and must equal the authenticated user's `auth.uid()` on insert.
- Normal client updates cannot transfer ownership.
- Watchlist items inherit ownership only through their parent `watchlist_id`.
- The existing `(watchlist_id, instrument_id)` identity prevents duplicate instruments inside one list.
- At most one default watchlist is permitted per owner.
- V1 has no shared, team or public watchlists.

The same permanent-user identity boundary is implemented for `alerts.owner_user_id` under MON-004.

## Access matrix

| Actor | Watchlist metadata | Watchlist items | Mutation |
|---|---|---|---|
| Unauthenticated / `anon` | No access | No access | No access |
| Permanent authenticated user | Own watchlists only | Items in own watchlists only | Create/update/delete own data only |
| Authenticated anonymous Supabase user | No access | No access | No access |
| Another authenticated user | No access | No access | No access |
| Trusted backend / `service_role` | Administrative as required | Administrative as required | Server or migration path only |

Watchlist names, descriptions, notes, ordering and membership are private user data.

## Implemented database boundary

- RLS is enabled on `public.watchlists` and `public.watchlist_items`.
- Policies are scoped to permanent `authenticated` users and use owner/parent-owner checks for all permitted operations.
- `anon` has no watchlist privileges.
- Authenticated browser access receives only the row operations required for owner CRUD.
- Ownership checks remain authoritative even when the application also filters explicitly by the current user.
- User deletion and item deletion follow the deliberate foreign-key cascade boundary.
- Default-list uniqueness, item uniqueness and maintained timestamps are enforced by the production implementation.

## Application boundary

- Signed-out users see a sign-in affordance, not local data that appears server-backed.
- Signed-in permanent users read and mutate only their own lists through the publishable-key client plus RLS.
- Server-rendered authenticated content uses a request-scoped session/client.
- The private owner workspace is exposed at `/watchlists`.

## Monitoring relationship

MON-004 implemented alerts and event history using the same permanent-owner model. Alert definitions are owner-managed; event history is evaluator-generated and owner-readable. External email, SMS and push delivery remain outside v1.

## Evidence

- [MON-001 design audit](../project-audits/MON-001.md)
- [MON-002 implementation audit](../project-audits/MON-002.md)
- [MON-004 alert lifecycle audit](../project-audits/MON-004.md)
- [Watchlist activation](../watchlist-activation.md)

The dated pre-implementation scaffold was intentionally removed from this current-reference document. Git history and the audit records preserve that historical evidence.
