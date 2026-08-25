# Alert Trigger Specification

**Task:** MON-003 — Define alerts  
**Specification version:** `alert-trigger-v1`  
**Date:** 24 August 2026  
**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

Define the approved v1 alert types, target scopes, source-of-truth tables, trigger semantics, ownership rules, evaluation timing and event-deduplication contract implemented by MON-004.

MON-003 established this contract. MON-004 implemented it as documented in the [Alert Lifecycle](../alert-lifecycle.md) and passed independent review in the [MON-004 audit](../project-audits/MON-004.md).

## Design principles

1. **Alerts observe existing systems; they do not influence them.** Alert evaluation may read Market data, independent ChatGPT Market Assessment, independent Technical Engine output, Market Convergence and Opportunity Assessment output, but must never feed alert state back into those calculations.
2. **Supabase Auth ownership is mandatory.** `auth.users.id` is the canonical user identity, matching the watchlist ownership model established by MON-001/MON-002.
3. **Only permanent authenticated users may own alerts.** Supabase anonymous-auth users and unauthenticated users are not alert owners in v1.
4. **Alert events are edge-triggered, not level-spammed.** A true condition produces one event when it is entered or crossed. It must not produce a new event on every evaluator run while it remains true.
5. **Evaluation must use persisted source data.** Browser-local values, fabricated values and UI-derived calculations are not valid alert sources.
6. **Stale or ineligible source data must not create analytical alerts.** Freshness alerts are the mechanism for warning about stale Market data.
7. **Event creation must be idempotent.** Re-running an evaluator against the same source transition must not create a duplicate event.
8. **External notification delivery is not part of v1.** Production persists trustworthy alert-event history with `notification_status = 'not_requested'`. Email/SMS/push delivery requires a separate approved delivery contract; event persistence does not depend on delivery success.

## Implemented production boundary

The production MON-004 lifecycle provides:

- `alerts.owner_user_id` is mandatory and references a permanent Supabase Auth user;
- owners can manage only their own alert definitions through owner-scoped RLS;
- `alert_events` are owner-readable and evaluator-written, so browser users cannot forge history;
- anonymous and authenticated-anonymous access is denied;
- exactly one instrument, watchlist or Opportunity-theme target is required according to alert type;
- internal evaluator state and run telemetry are not client-write surfaces;
- deterministic event keys and persisted state provide deduplication and re-arm behaviour.

Zero user alert or event rows is a valid production state and does not mean the lifecycle is unimplemented.

## Alert target model

Every enabled alert must have exactly one target scope.

| Target scope | Required target | Approved alert types |
|---|---|---|
| `instrument` | `instrument_id` | price, freshness, Market Assessment, convergence, technical |
| `watchlist` | `watchlist_id` owned by the alert owner | price, freshness, Market Assessment, convergence, technical |
| `theme` | Opportunity `theme_id` | Opportunity Assessment only |

A watchlist-scoped alert is evaluated independently for each current watchlist instrument. Each generated event records the actual `instrument_id` that fired.

Opportunity alerts are theme-scoped in v1. Production uses a nullable `theme_id` foreign key to `opportunity_themes(id)` and enforces exactly one target among `instrument_id`, `watchlist_id` and `theme_id`. An unvalidated theme UUID inside JSON is not a canonical target relationship.

## Common condition contract

`alerts.condition` remains a type-specific JSONB payload, but every v1 condition must contain:

```json
{
  "condition_version": "alert-trigger-v1",
  "operator": "...",
  "minimum_confidence": 0
}
```

Rules:

- `condition_version` is mandatory and must equal `alert-trigger-v1` for this specification.
- Numeric thresholds must be finite numbers.
- Scores/confidence thresholds must be between 0 and 100 where the source metric is defined on that range.
- `minimum_confidence` is a filter, not a trigger by itself; default is 0 unless the alert type below imposes a stricter source rule.
- Unsupported fields/operators must be rejected rather than silently ignored.
- Changes to a condition should re-arm the alert from the next eligible source state; historical rows must not be replayed as new alerts merely because the user edited the condition.

## Approved alert types

### 1. Price threshold — `price_threshold`

**Purpose:** Notify when a tracked instrument's live quote crosses a user threshold.

**Source:** `market_observations` rows with `interval_code = 'quote'`.

**Targets:** instrument or watchlist.

Approved operators:

- `crosses_above`
- `crosses_below`

Required condition fields:

```json
{
  "condition_version": "alert-trigger-v1",
  "operator": "crosses_above",
  "threshold": 250.00,
  "currency_code": "USD"
}
```

Trigger rule:

- `crosses_above`: prior eligible quote close `<= threshold` and new eligible quote close `> threshold`;
- `crosses_below`: prior eligible quote close `>= threshold` and new eligible quote close `< threshold`.

The threshold currency must match the instrument's configured currency. No currency conversion is performed in v1.

A quote already beyond the threshold when an alert is created establishes initial state and does **not** immediately fire. A subsequent re-cross is required.

### 2. Market-data freshness — `data_freshness`

**Purpose:** Warn when an actively monitored instrument's quote feed becomes due, stale or missing.

**Source:** latest eligible `market_observations` quote plus the same market-session logic used by the Markets dashboard.

**Targets:** instrument or watchlist.

Approved states:

- `due` — age 91–120 minutes while the instrument/session is expected to update;
- `stale` — age greater than 120 minutes while the instrument/session is expected to update;
- `no_observation` — no quote exists after the active instrument has exceeded the normal 120-minute startup/grace boundary.

`market_closed` is explicitly **not** a freshness alert condition. Closed US equity/ETF sessions must remain separate from stale data.

Required condition fields:

```json
{
  "condition_version": "alert-trigger-v1",
  "operator": "enters_state",
  "states": ["stale"]
}
```

The event fires when the instrument enters a selected state. It re-arms only after returning to a non-selected healthy/closed state and later entering the selected state again.

Because freshness changes with time even when no new quote arrives, the production evaluator runs freshness on a recurring cadence no slower than the existing 15-minute Market-data cadence.

### 3. Independent ChatGPT Market Assessment — `market_assessment`

**Purpose:** Alert on a material change in the independent AI Market Assessment.

**Source:** `gpt_market_assessments` linked to a terminal successful `gpt_market_runs` row. Technical Engine or convergence outputs must not be used to form this source signal.

**Targets:** instrument or watchlist.

Approved metrics/operators:

- `rating` + `enters_value` using current canonical ratings `Buy`, `Hold`, `Sell`;
- `score` + `crosses_above` / `crosses_below`;
- `rating` + `changes` for any rating transition.

Examples:

```json
{
  "condition_version": "alert-trigger-v1",
  "metric": "rating",
  "operator": "enters_value",
  "values": ["Buy"],
  "minimum_confidence": 60
}
```

```json
{
  "condition_version": "alert-trigger-v1",
  "metric": "score",
  "operator": "crosses_above",
  "threshold": 70,
  "minimum_confidence": 60
}
```

Only a newly persisted eligible assessment may change assessment-alert state. Re-reading the same assessment row must not retrigger it.

### 4. Opportunity Assessment — `opportunity_assessment`

**Purpose:** Alert on a material change in a long-term Opportunity theme.

**Source:** `opportunity_assessments` and its persisted independent Structural/Technology source lineage.

**Target:** Opportunity theme only.

Approved metrics/operators:

- `opportunity_level` + `enters_value` using `emerging`, `watch`, `high`, `major`, `transformational`;
- `opportunity_score` + `crosses_above` / `crosses_below`;
- `commercial_readiness` + `enters_value` using `early`, `watch`, `developing`, `actionable`, `mature`.

Examples:

```json
{
  "condition_version": "alert-trigger-v1",
  "metric": "opportunity_level",
  "operator": "enters_value",
  "values": ["major", "transformational"],
  "minimum_confidence": 60
}
```

```json
{
  "condition_version": "alert-trigger-v1",
  "metric": "commercial_readiness",
  "operator": "enters_value",
  "values": ["actionable", "mature"],
  "minimum_confidence": 60
}
```

Opportunity alerts must remain long-term research alerts. They must not use short-term Market Assessment ratings, Technical Engine scores or price momentum as inputs.

### 5. Market Convergence — `market_convergence`

**Purpose:** Alert on a material change in the explicit short-term convergence of independent Technical and AI Market views.

**Source:** `market_convergence_assessments` only.

**Targets:** instrument or watchlist.

Approved metrics/operators:

- `convergence_label` + `enters_value`;
- `convergence_label` + `changes`;
- `convergence_score` + `crosses_above` / `crosses_below`.

Canonical labels are:

- `very_strong_bullish`
- `strong_bullish`
- `moderate_bullish`
- `neutral`
- `mixed`
- `conflict`
- `moderate_bearish`
- `strong_bearish`
- `very_strong_bearish`

Example:

```json
{
  "condition_version": "alert-trigger-v1",
  "metric": "convergence_label",
  "operator": "enters_value",
  "values": ["strong_bullish", "very_strong_bullish", "conflict"],
  "minimum_confidence": 60
}
```

The convergence evaluator observes the persisted convergence result; it does not independently recompute convergence inside the alert subsystem.

### 6. Independent Technical Engine — `technical_score`

**Purpose:** Alert on a material score movement from the independent Technical Engine.

**Source:** `market_scores` only.

**Targets:** instrument or watchlist.

Approved metrics:

- `overall_score`
- `momentum_score`
- `trend_score`
- `volatility_score`
- `volume_score`

Approved operators:

- `crosses_above`
- `crosses_below`

Example:

```json
{
  "condition_version": "alert-trigger-v1",
  "metric": "overall_score",
  "operator": "crosses_above",
  "threshold": 70,
  "minimum_confidence": 70
}
```

V1 technical alerts evaluate only `market_scores.score_status = 'complete'`. Partial scores may be displayed elsewhere but must not fire a v1 technical alert. Alert evaluation must not read GPT Market Assessment, Opportunity Assessment or Market Convergence rows to alter the Technical signal.

## Source eligibility and ordering

For source-driven analytical alerts, evaluation uses the newest eligible persisted source row after the alert's previous evaluation point.

| Alert type | Eligible source ordering |
|---|---|
| Price | `market_observations.observed_at`, then row `id` |
| Market Assessment | `assessment_date`, then `created_at`, then `assessment_id` |
| Opportunity | `assessment_date`, then `updated_at`, then `id` |
| Convergence | `assessment_date`, then `updated_at`, then `id` |
| Technical | `score_date`, then `calculated_at`, then `id` |

Historical rows earlier than alert creation are baseline state only and must not generate historical alert events.

## Evaluation timing

The production lifecycle evaluates each type after its authoritative producer finishes, rather than polling every table indiscriminately:

- **Price:** after a successful Market-data quote load; freshness also gets a scheduled time-based evaluation at the 15-minute Market cadence.
- **Market Assessment:** after the relevant GPT Market run reaches terminal success.
- **Opportunity:** after the Daily Opportunity Assessment run reaches terminal success for the applicable theme output.
- **Technical:** after the Technical Engine run reaches terminal success.
- **Market Convergence:** after the convergence run reaches terminal success.

A retry of a producer must not create duplicate alert events for an unchanged source row.

## Rearm and event semantics

Every alert has a persisted logical state independent of `last_triggered_at`.

Persisted evaluator state records:

- last source row/key evaluated;
- prior condition truth/state;
- last evaluation time;
- last trigger time.

For crossing conditions:

1. establish baseline from the first eligible value after alert creation;
2. fire only on false-to-true threshold crossing;
3. remain armed-off while still beyond the threshold;
4. re-arm after crossing back to the opposite side.

For `enters_value` / `enters_state`:

1. fire when current value enters the selected set from outside it;
2. do not repeat while it remains in the selected set;
3. re-arm after it exits the set.

For `changes`, fire once for each new source row whose selected metric differs from the previously evaluated eligible source row.

## Event idempotency and provenance

`alert_events` enforces a non-null deterministic `event_key` with uniqueness on `(alert_id, event_key)`.

The event key must identify the triggering transition, for example:

- price: source observation ID + trigger code;
- assessment/convergence/opportunity/technical: source row ID + trigger code;
- freshness: alert ID + instrument ID + entered state + rearm cycle identity.

Every event preserves enough provenance to explain why it fired. `alert_events.metadata` includes where applicable:

- `condition_version`;
- alert type and operator;
- source table and source row ID;
- source timestamp/date;
- prior value/state;
- current value/state;
- configured threshold/selected values;
- confidence and methodology version;
- evaluator version;
- watchlist ID when the event came from watchlist scope.

`trigger_value` is used when the triggering value is numeric. Label/state triggers use metadata and may leave `trigger_value` null.

## Implemented ownership and access contract

Production alerts align with the MON-001/MON-002 permanent-user model.

### `alerts`

- `owner_user_id` must be `NOT NULL` and continue to reference `auth.users(id) ON DELETE CASCADE`;
- insert owner must equal `auth.uid()`;
- ownership must be immutable through normal client updates;
- `anon` gets no table privileges;
- `authenticated` gets only the row operations required to maintain its own alert definitions;
- RLS policies must be `TO authenticated`, use `(select auth.uid())`, reject `is_anonymous = true`, and scope all CRUD to the owner;
- watchlist-target alerts must additionally validate that the watchlist is owned by the same user.

### `alert_events`

Alert-event history is system-generated evidence, not user-authored content.

- authenticated permanent users may read events only through alerts they own;
- normal browser users must not be able to insert, update or delete event-history rows;
- event creation/update is restricted to the trusted evaluator/service/database path;
- `anon` gets no event-history access;
- event rows should cascade with their parent alert unless retention requirements are explicitly changed later.

No service-role/secret credential may be exposed to the frontend.

## Notification status

The existing `alert_events.notification_status` column must not be treated as proof of message delivery.

The v1 event-history implementation uses `not_requested`. If an outbound channel is separately approved later, delivery lifecycle may use `pending`, `sent`, `failed` or `skipped`, but the underlying alert event must already be durably persisted before delivery is attempted.

## MON-004 implementation evidence

The completed Builder and independent Auditor verification covered:

1. permanent user A can create/edit/disable/delete only A's alert definitions;
2. user B cannot read or mutate A's alerts or events;
3. `anon` and authenticated-anonymous users cannot access alerts;
4. browser users cannot forge `alert_events`;
5. instrument, watchlist and Opportunity-theme target integrity is enforced;
6. one representative alert of each of the six approved types evaluates against real persisted source data;
7. crossing/enter-state alerts do not repeatedly fire while condition remains true;
8. recovery/rearm followed by a second crossing creates a new legitimate event;
9. retrying evaluation against the same source transition creates no duplicate event;
10. source/evaluator provenance is stored with each event;
11. freshness does not classify a closed US market as stale;
12. technical alerts read only Technical Engine output and Opportunity alerts remain independent of short-term Market/Technical outputs;
13. alert-event persistence remains correct even with no outbound notification provider;
14. the frontend uses only the publishable Supabase configuration and RLS for user alert-definition access.

## Definition of Done mapping for MON-003

The project-plan requirement is: **Approved price, freshness, assessment, opportunity, convergence and technical triggers are documented.**

This specification defines all six required trigger families, their authoritative persisted sources, target scopes, operators, conditions, eligibility, rearm rules, evaluation timing, event deduplication/provenance and the ownership/security boundary implemented by MON-004.
