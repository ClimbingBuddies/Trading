# Watchlist Activation

**Implemented under:** MON-002  
**Last reconciled:** 25 August 2026

Watchlists are an active private owner workspace at `/watchlists`.

## Production contract

- Supabase Auth permanent users own watchlists through `watchlists.owner_user_id -> auth.users.id`.
- `owner_user_id` is mandatory.
- `watchlists` and `watchlist_items` use owner-scoped RLS.
- Unauthenticated users, authenticated-anonymous users and other authenticated users cannot read or mutate an owner's data.
- Authenticated owners can create, edit, order and delete their own lists and items.
- Owner forgery and cross-owner item placement are rejected.
- The database maintains the one-default-list rule.
- Public Markets and assessment routes remain readable without authentication.
- Browser code uses the Supabase publishable key only.

## Frontend

The production `/watchlists` route resolves the permanent-user session, presents signed-out guidance when required and supports authenticated CRUD. A user may legitimately have no watchlists; that state is shown intentionally.

## Verification

MON-002 passed independent audit after:

- schema, foreign-key, grant and RLS inspection;
- rollback-only owner/cross-owner/anonymous tests;
- production build, palette and TypeScript verification;
- production route and public-route regression checks;
- authenticated owner workflow verification.

Historical Builder blockers and deployment attempts are retained in [the MON-002 audit record](project-audits/MON-002.md) and controller journal rather than repeated here.

## Related documentation

- [Watchlist authentication and ownership model](security/watchlist-auth-model.md)
- [Frontend route map](frontend-route-map.md)
- [Supabase data model](supabase-data-model.md)
