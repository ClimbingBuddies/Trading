# Alert Lifecycle Implementation

**Task:** MON-004 — Implement alerts and event history  
**Date:** 24 August 2026  
**Contract:** `documentation/specifications/alert-trigger-specification.md` (`alert-trigger-v1`)  
**Evaluator:** `alert-evaluator-v1`  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

MON-004 implements the approved `alert-trigger-v1` contract as a private, permanent-user alert system with durable evaluator state, idempotent event history, producer-aligned evaluation and an authenticated Alerts workspace.

External email/SMS/push notification delivery remains out of scope. A fired alert is durably stored first with `notification_status = 'not_requested'`.

## Database implementation

Production migrations:

- `supabase/migrations/20260824122500_implement_alert_lifecycle_v1.sql`
- `supabase/migrations/20260824124500_fix_alert_evaluator_event_key_ambiguity.sql`
- `supabase/migrations/20260824125200_harden_alert_internal_tables_and_indexes.sql`
- `supabase/migrations/20260824130000_fix_public_market_status_function_boundary.sql`

### Alert definitions

`public.alerts` now:

- requires non-null `owner_user_id` linked to `auth.users(id)`;
- supports exactly one target: `instrument_id`, `watchlist_id`, or Opportunity `theme_id`;
- restricts alert types to the six approved v1 families;
- enforces Opportunity alerts as theme-targeted and all other v1 alerts as instrument/watchlist-targeted;
- requires `condition.condition_version = 'alert-trigger-v1'`;
- validates type-specific operators, metrics, labels, thresholds and price currency;
- verifies that a watchlist target belongs to the alert owner;
- persists `last_triggered_at` and `updated_at`.

### Event history

`public.alert_events` now:

- stores instrument or Opportunity-theme context;
- requires a deterministic `event_key`;
- uniquely enforces `(alert_id, event_key)` so retrying an unchanged source transition cannot duplicate an event;
- stores numeric trigger values where applicable and structured provenance in `metadata`;
- defaults to `notification_status = 'not_requested'` for the event-history-only v1 product.

### Evaluation state and telemetry

`public.alert_evaluation_state` persists per-alert/per-target evaluator state including:

- last source key/table/time;
- last value/state;
- prior condition truth;
- rearm cycle;
- last evaluation/trigger times.

`public.alert_evaluator_runs` records real evaluator executions with reason, target filters, terminal status, alert/event counts, errors and `alert-evaluator-v1` identity.

Both are internal tables. Client grants are absent and explicit RLS deny policies document that browser users have no direct access.

## Ownership and RLS

The alert subsystem reuses the permanent-user model established by MON-001/MON-002.

- `anon`: no privileges on `alerts` or `alert_events`.
- permanent `authenticated` users: SELECT/INSERT/UPDATE/DELETE only on their own alert definitions.
- permanent `authenticated` users: SELECT only on event rows belonging to alerts they own.
- authenticated-anonymous JWTs are explicitly rejected.
- browser users cannot insert/update/delete event history.
- evaluator/internal-state writes remain in the trusted database/service path.
- no service-role or privileged secret is used by the Alerts frontend.

## Six evaluator branches

`alerting.evaluate_one_v1` observes only the persisted source appropriate to the alert type:

| Alert type | Authoritative source |
|---|---|
| `price_threshold` | `market_observations` quote rows |
| `data_freshness` | latest quote plus canonical session/freshness classifier |
| `market_assessment` | `gpt_market_assessments` linked to successful `gpt_market_runs` |
| `opportunity_assessment` | `opportunity_assessments` |
| `market_convergence` | `market_convergence_assessments` |
| `technical_score` | complete `market_scores` rows |

The Technical branch does not use GPT, Opportunity or Market Convergence to form its signal. The Opportunity branch does not use short-term Market/Technical outputs.

## Evaluation ownership and timing

Evaluation is producer-aligned:

- quote insert trigger evaluates price alerts for that instrument;
- successful GPT Market run evaluates Market Assessment alerts;
- successful Opportunity run evaluates Opportunity alerts;
- successful Technical Engine run evaluates Technical alerts;
- successful Market Convergence run evaluates convergence alerts;
- `alert-freshness-v1` runs every 15 minutes via `pg_cron` because freshness can change without a new quote.

Creating or materially editing/re-enabling an alert clears its evaluator state and establishes a fresh baseline. Existing historical conditions therefore do not fire immediately.

## Canonical market freshness classifier

MON-003 audit advice required one canonical classifier so the Alerts subsystem and Markets dashboard cannot drift.

Production now uses:

- `public.market_session_status_v1(...)`
- `public.market_freshness_status_v1(...)`
- `public.latest_market_status`

The canonical states are:

- current: <= 90 minutes while active;
- due: > 90 and <= 120 minutes while active;
- stale: > 120 minutes while active;
- market closed: US equity/ETF session is closed, taking precedence over age;
- no observation: no quote after the startup/grace boundary.

The public dashboard view maps alert-internal `no_observation` to its established `no_data` UI token. The Markets page now reads `latest_market_status`, so both surfaces use the same session/holiday/freshness calculation.

The public functions are narrowly scoped `SECURITY DEFINER` functions with an empty search path so the public view can call the private holiday/session helper without granting browsers access to the private `alerting` schema.

## Frontend

Implemented:

- `app/alerts/page.tsx`
- `components/AlertsClient.tsx`
- Alerts navigation in `components/AppNav.tsx`
- canonical Markets data reader in `lib/markets-data.ts`

The Alerts workspace uses `lib/supabase-browser.ts`, the same publishable-key persistent Auth client as Watchlists.

Signed-in permanent users can:

- create all six approved alert types;
- target an instrument, owned watchlist, or Opportunity theme as allowed by the contract;
- edit definitions;
- enable/disable alerts;
- delete alerts;
- view their persisted event history.

Event history is read-only in the browser.

## Builder verification

### Six-source evaluator matrix

A rollback-only transaction used real persisted source rows for one tracked instrument and one Opportunity theme. It created temporary alerts for all six approved types, established controlled prior states, and verified:

- one legitimate event for each of the six source families;
- exact-source retries produced no duplicate events;
- freshness recovery rearmed the alert and a later stale transition produced a second legitimate event;
- event metadata contained source provenance.

An initial harness run exposed a PL/pgSQL ambiguity between the evaluator variable and `alert_events.event_key`. The Builder did not hand off that state. `20260824124500_fix_alert_evaluator_event_key_ambiguity.sql` renamed the variable and the complete matrix then passed.

No temporary alert, event or state row was retained.

### RLS/security matrix

Rollback-only execution under the real `authenticated` role and JWT claims verified:

- owner A can create/read an A-owned alert;
- owner forgery is rejected;
- user B sees zero A alerts and cannot mutate A;
- B cannot target A's watchlist;
- authenticated-anonymous sees zero A alerts and cannot insert;
- authenticated browser event-history insert is rejected.

### Freshness/session boundary

Deterministic checks verified:

- aged equity data on a weekend classifies `market_closed`, not stale;
- no-observation equity on the weekend also classifies `market_closed`;
- an aged always-active crypto/24h instrument classifies stale.

### Real unattended evaluator telemetry

After activation, real production execution persisted terminal `succeeded` runs without test data:

- one `freshness-cron` run at the 15-minute cadence;
- two `quote-insert` evaluator runs from subsequent live quote loads;
- zero failed or partial evaluator runs in the inspected state.

With no permanent user alerts yet, those runs correctly considered zero alerts and created zero events.

### Advisers

After hardening:

- Supabase Security Adviser reports no new alert-table security finding; only the previously accepted `pg_net` extension placement warning remains.
- new alert foreign-key/index and RLS-policy findings were remediated;
- remaining performance-adviser entries are existing/general unused-index and connection-policy advice, not a failed MON-004 boundary.

### Production/build

Vercel production deployment `dpl_9pEHPNB2CbAyey7Ft6BR3TrCYstV` reached `READY` on repository commit `a7845b6cb0495db525d5e343508093cba14ed59e`.

Build evidence:

- palette compliance passed for 19 component/style files;
- Next.js 16.3.1 compiled successfully;
- TypeScript completed successfully;
- `/alerts` was generated;
- deployment completed successfully.

Production verification after the database boundary fix:

- `/alerts`: HTTP 200 with Alerts navigation/route present;
- `/markets`: HTTP 200 with 30 real instruments and canonical freshness statuses;
- production error/fatal runtime logs for the inspected hour: none.

The final database-boundary migration is committed after the above application build; it changes no application artefact and took effect immediately in Supabase. A later Vercel deployment of that documentation/migration-only repository commit is not required for the database correction to be live.

## Handoff boundary

Builder verification is pre-flight only. The independent Auditor should re-establish the Definition of Done from primary evidence, including source/live migration parity, RLS boundaries, representative six-source evaluation/idempotency/rearm behaviour, real evaluator telemetry, production `/alerts` and `/markets`, and the absence of privileged frontend credentials.
