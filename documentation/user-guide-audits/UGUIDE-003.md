# UGUIDE-003 — Producer implementation evidence

**Gate:** Document signed-in monitoring workspaces  
**Producer decision:** READY_FOR_AUDIT  
**Functional implementation commit:** `173672b067ca8a4a37fd55a4515b5395b82b02c0`  
**Functional file changed:** `documentation/user-guide.md`  
**Evidence timestamp:** 26 August 2026, 05:04 Australia/Perth  
**Data or schema effects:** none

## Scope implemented

The canonical guide now documents only the bounded UGUIDE-003 scope:

- the permanent-account sign-in boundary shared by Watchlists and Alerts;
- creating, renaming, defaulting and deleting an owner Watchlist;
- adding, ordering, annotating and removing tracked instruments;
- the six v1 alert types, their permitted target/condition pattern and safe meaning;
- creating, editing, disabling, enabling and deleting an alert definition;
- baseline, edge-trigger, rearm and duplicate-prevention behaviour;
- read-only event-history interpretation and the `not_requested` delivery boundary;
- owner isolation, valid empty states, no-live-trade and non-advice safeguards;
- precise `AUTH_REQUIRED` records for the unavailable owner-state screenshots.

No application source, Supabase schema/data/policy/function/schedule, Vercel configuration or production state was changed.

## GitHub evidence checked

Current default-branch source and canonical references were fetched:

| Evidence | Blob SHA |
|---|---|
| `documentation/user-guide.md` after implementation | `2f4142f9be2a73b477c2b0ea510169b00aa46584` |
| `app/watchlists/page.tsx` | `afd3b39dc1d405a4b271bfaad2249905b003f6a8` |
| `components/WatchlistsClient.tsx` | `65872f60fa4ad22648c2c028c46bcbcd746162b7` |
| `app/alerts/page.tsx` | `aa53b3e82c29fb425a21f1bdffc444fca9cd87a3` |
| `components/AlertsClient.tsx` | `5ce359fb7745413cf22d44b8244f23009f2ee483` |
| `documentation/security/watchlist-auth-model.md` | `38022b972872b15aba150c869524b4b47aee98a5` |
| `documentation/watchlist-activation.md` | `206eac8c79d9e2393a8568a2443bb5619823e597` |
| `documentation/specifications/alert-trigger-specification.md` | `f69fb7c457084f62916a1bcaa6006407b9e158b4` |
| `documentation/alert-lifecycle.md` | `0ea5bd1402ff8b245a0548ecd2c9880a7136180d` |

The exact implementation commit was independently fetched: its diff changes only `documentation/user-guide.md`.

## Production and browser evidence

Production URL: `https://discoverbouldersmarkets.vercel.app`

- Latest checked Vercel production deployment: `dpl_A6KPQBpua8Zk4QY4QWaDMj6FbckE`
- Deployment state: `READY`
- Deployment commit: `173672b067ca8a4a37fd55a4515b5395b82b02c0`
- Stable viewport: 1363 × 936 CSS pixels, device-pixel-ratio 1
- `/watchlists`: resolved with heading **Watchlists**, permanent-email explanation and **Sign in to use watchlists**
- `/alerts`: resolved with heading **Alerts**, shared permanent-identity explanation and **Sign in to use alerts**
- No already-authorised permanent-owner session was present.

The route checks verify the current signed-out boundary only. They do not claim authenticated UI verification.

## AUTH_REQUIRED and screenshot decision

`AUTH_REQUIRED` applies to:

- `/watchlists`, authenticated owner state;
- `/alerts`, authenticated owner definition and event-history state.

Accordingly:

- no screenshot was captured from a sign-in form;
- no credential, sign-in link, owner email or user ID was requested, entered, stored or exposed;
- `documentation/images/user-guide/watchlists-owner-desktop.png` does not exist;
- `documentation/images/user-guide/alerts-owner-desktop.png` does not exist;
- neither reserved filename is counted as a delivered screenshot;
- no private row, alert, event, metric, price or screenshot state was invented.

This satisfies the gate's explicit alternative: record a precise blocker when an already-authorised session is unavailable.

## Read-only Supabase evidence

Project: `glvbqcplgjdfgjyknzsa`

Read-only queries confirmed:

- RLS is enabled on `watchlists`, `watchlist_items`, `alerts` and `alert_events`;
- Watchlist CRUD policies require a permanent authenticated user and match `owner_user_id` to `auth.uid()`;
- item policies inherit access through an owner-matched parent Watchlist;
- Alert CRUD policies require the same owner match and validate owner access to Watchlist targets;
- `alert_events` exposes only SELECT to a permanent authenticated owner through the owned parent Alert;
- no browser policy permits event insertion, update or deletion;
- the inspected aggregate state contained 1 Watchlist, 2 Watchlist items, 0 Alert definitions and 0 Alert events.

Only aggregate counts and policy definitions were used. No owner identifier, email, Watchlist name, private note or row payload was read into the guide.

## Verification checks

- 17/17 Markdown link targets in the guide resolve on the default branch.
- The implementation commit changes one documentation file only.
- The two reserved owner-image paths return `NOT_FOUND`, consistent with the manifest and blocker.
- The guide contains no email address and no common credential/token pattern.
- Watchlist UI labels and actions match current source: create, list selection, save details, make default, add, private notes, reorder, remove and confirmed delete.
- Alert UI labels and actions match current source: create, edit, enable/disable, delete, six type-specific condition forms and event-history empty state.
- Source and lifecycle documents support baseline, rearm, idempotency, source provenance and no-outbound-delivery claims.
- Public/private boundaries and the no-live-trading/non-advice boundary remain prominent.
- No screenshot was added or replaced.
- No obsolete guide draft, duplicate image candidate or temporary reconciliation note was created.

## Acceptance-criteria mapping

| Criterion | Evidence |
|---|---|
| Explain sign-in boundaries | Guide sections 5–6 plus both current production signed-out route checks |
| Explain Watchlists | Section 5 task flow, current component source and Watchlist contract |
| Explain Alerts | Section 6 type/definition lifecycle, current component source and alert contract |
| Explain event history | Section 6 read-only history, notification-status and valid-empty-state guidance |
| Owner isolation | Current RLS/policy evidence and canonical ownership documents |
| Safe use | Explicit private-data, non-sharing, monitoring-not-execution and non-advice statements |
| Authenticated screenshots or blocker | Exact `AUTH_REQUIRED` routes and missing reserved files recorded in guide and this audit |
| No invented/private evidence | No authenticated claim or screenshot; only aggregate and policy evidence used |
| Documentation-only | Exact commit contains only `documentation/user-guide.md`; data/schema effects none |

## Known limitations

- Authenticated owner UI controls were verified against current source and canonical contracts, not through a live owner session.
- The two owner-state screenshots remain unavailable until an already-authorised owner session exists; final QA must not invent or substitute them.
- Production `/` redirects to `/admin` while `documentation/frontend-route-map.md` still says `/markets`; the prior Auditor advice remains due by UGUIDE-005.
- UGUIDE-004 remains responsible for Strategy, Admin, troubleshooting, glossary and representative mobile documentation.

## Exact next action

The independent Auditor must fetch the latest plan, journal, guide, this record and exact commit `173672b067ca8a4a37fd55a4515b5395b82b02c0`; verify the two signed-out routes, source/RLS claims and complete `AUTH_REQUIRED` evidence; then issue PASS/PASS WITH ADVICE or one complete correction set. The Producer must not work on UGUIDE-004 or mark this gate DONE.

## Independent Auditor decision — 26 August 2026

**Controller:** AUDITOR  
**Decision:** PASS_WITH_ADVICE  
**Implementation commit reviewed:** `173672b067ca8a4a37fd55a4515b5395b82b02c0`  
**Audit record:** `documentation/user-guide-audits/UGUIDE-003.md`  
**Screenshots added or replaced by this gate:** none  
**Complete correction set:** none  
**Next task promoted:** `UGUIDE-004`

### Handoff validation

The latest plan and journal identify UGUIDE-003 as the sole `IN REVIEW` gate with handoff owner `AUDITOR`. The latest Producer handoff contains every mandatory field: task identity, direction, `READY_FOR_AUDIT`, exact implementation commit, implementation/control files, screenshot result, routes and viewport, no data/schema effects, tests, limitations, acceptance evidence and exact next action. No unresolved UGUIDE-003 `HANDOFF_QUERY` exists.

### Independent evidence checked

- Fetched the exact implementation commit and confirmed it changes only `documentation/user-guide.md`.
- Confirmed the current guide and implementation-commit guide are byte-for-byte identical at blob `2f4142f9be2a73b477c2b0ea510169b00aa46584`.
- Fetched current Watchlists and Alerts page/client source plus the four canonical ownership/lifecycle documents; their blobs match the Producer evidence.
- Verified all 17 Markdown link targets resolve from the current default branch.
- Verified all 13 static/dynamic route source files referenced by the guide exist.
- Independently opened the root plus ten representative production states at 1363 × 936 CSS pixels and device-pixel-ratio 1:
  - `/` redirected to `/admin`;
  - `/admin`;
  - `/markets` and `/markets/amd`;
  - `/assessments` and `/assessments/gld`;
  - `/opportunities` and `/opportunities/ai_advanced_packaging`;
  - `/watchlists`, `/alerts` and `/strategies` signed-out states.
- Confirmed `/watchlists` and `/alerts` each showed the documented permanent-email sign-in boundary, no Sign out control and no authenticated owner state.
- Confirmed Vercel deployment `dpl_A6KPQBpua8Zk4QY4QWaDMj6FbckE` is `READY`, production-targeted, aliased to `discoverbouldersmarkets.vercel.app` and built from the exact implementation commit.
- Used read-only Supabase evidence to verify RLS on `watchlists`, `watchlist_items`, `alerts` and `alert_events`; owner/parent-owner policies; permanent-user checks; no `anon` grants; browser event-history SELECT-only access; alert/watchlist target integrity; cascade behaviour; one-default and duplicate-item uniqueness; and alert-event idempotency.
- Independently observed aggregate-only persisted state of 1 Watchlist, 2 Watchlist items, 0 Alert definitions and 0 Alert events. No identity, name, note or private row payload was inspected or reproduced.
- Confirmed the two reserved authenticated image paths are absent and the user guide explicitly does not count them as delivered.
- Confirmed the image directory contains only the four previously audited UGUIDE-002 images, with no duplicate or temporary UGUIDE-003 candidate.
- Confirmed all four images used by the current guide have unique meaningful alt text and concise captions; UGUIDE-003 introduced no image requiring visual re-audit.
- Scanned the guide for email addresses, JWT/token/key patterns and common secret labels; none are present.
- Confirmed public/authenticated boundaries, monitoring-versus-execution, no-live-trading and non-advice language remain prominent.
- Confirmed no application code, database/schema/policy/function/schedule, Vercel configuration or production data was changed.

### Findings

- PASS: the guide explains the permanent-account sign-in boundary without claiming an authenticated session was observed.
- PASS: Watchlist creation, edit/default, membership, private notes, ordering, removal, delete and empty-state instructions match current source and database constraints.
- PASS: all six alert types, permitted targets, condition patterns, baseline/rearm/idempotency behaviour and definition lifecycle match current source, contract and production constraints.
- PASS: event history is accurately described as private, read-only system evidence; `not_requested` is correctly distinguished from successful outbound delivery.
- PASS: owner isolation is supported by current grants, RLS policies, ownership checks and parent-row relationships.
- PASS: the explicit gate alternative is satisfied—`AUTH_REQUIRED` precisely names `/watchlists` and `/alerts`, the reserved files are absent, and no private or invented screenshot state appears.
- PASS: the exact implementation is documentation-only and remains unchanged on the default branch.
- ADVICE: retain the two `AUTH_REQUIRED` records unless an already-authorised owner session becomes available; final QA must not substitute a sign-in-form image or invented private state.
- ADVICE: production `/` still redirects to `/admin` while `documentation/frontend-route-map.md` says `/markets`; the production-accurate guide is correct and the stale route-map statement remains due for UGUIDE-005.

### Decision and next action

UGUIDE-003 passes with advice. Mark only UGUIDE-003 `DONE`, promote the valid `PLANNED` successor UGUIDE-004 to `NEXT`, and assign it to the Producer. The Producer must fetch the latest plan/journal, append `BUILD_ATTEMPT_STARTED`, and implement only UGUIDE-004; it must not revisit UGUIDE-003 unless a later Auditor handback explicitly requires it.
