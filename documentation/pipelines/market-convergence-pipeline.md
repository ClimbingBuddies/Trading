# Market Convergence Population Pipeline

**Methodology:** `market-convergence-v1`  
**Live Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Last verified:** 22 August 2026

## Purpose

This pipeline persists Market Convergence only after the independent Technical Engine and independent AI Market Assessment have each produced an eligible result for the same instrument.

The canonical calculations and labels are defined in the [Market Convergence Specification](../specifications/market-convergence-specification.md). This document describes the trusted implementation and its verified persistence contract.

## Trusted execution surface

The implementation exposes four private PostgreSQL functions:

```sql
market_convergence.refresh_v1(p_instrument_id uuid default null)
market_convergence.refresh_as_of_v1(p_cutoff_at timestamptz, p_instrument_id uuid default null)
market_convergence.run_v1(p_execution_source text, p_retry_of_run_id uuid, p_cutoff_at timestamptz, p_instrument_id uuid)
market_convergence.retry_latest_failed_v1()
```

- The functions are owned by `postgres`, run as `security invoker`, and use `search_path = pg_catalog`.
- Every table reference is schema-qualified.
- Only `service_role` has schema usage and function execution.
- `anon` and `authenticated` cannot access the private schema or execute a function.
- `public.market_convergence_assessments` and `public.market_convergence_runs` remain read-only to clients.
- Row-level security remains enabled on both public tables.

Trusted current refresh:

```sql
select * from market_convergence.refresh_v1(null);
```

Trusted monitored run with an explicit immutable cutoff:

```sql
select market_convergence.run_v1(
  'manual',
  null,
  '2026-08-22T04:00:00Z'::timestamptz,
  null
);
```

`refresh_as_of_v1` returns considered, eligible, fresh, stale, missing-input and changed-row counts. `run_v1` records the same evidence and returns the durable run ID.

## Eligible inputs

### Technical branch

The pipeline selects the latest eligible row per instrument from `public.market_scores` where:

- `methodology_version = 'technical-score-v1'`;
- `score_status` is `complete` or `partial`;
- `overall_score` and `confidence_score` are present and within 0–100;
- `score_date` is on or before the run's New York logical date;
- `calculated_at` is on or before the run's immutable cutoff.

Selection is deterministic:

1. `score_date desc`;
2. `calculated_at desc`;
3. `id desc`.

### AI Market branch

The pipeline independently selects the latest eligible row per instrument from `public.gpt_market_assessments` where:

- `methodology_version = 'independent-market-ai-v1'`;
- `technical_engine_input_used is false`;
- `score` and `confidence` are present and within 0–100;
- `rating` is one of Strong Buy, Buy, Hold, Sell or Strong Sell;
- `assessment_date` is on or before the run's New York logical date;
- `created_at` is on or before the run's immutable cutoff.

Selection is deterministic:

1. `assessment_date desc`;
2. `created_at desc`;
3. `assessment_id desc`.

Only instruments with one eligible result from both branches are populated.

## Persisted contract

For every eligible pair, the pipeline writes one `public.market_convergence_assessments` row with:

- `assessment_date` equal to the later source date;
- mandatory `technical_score_id` and `ai_assessment_id` lineage;
- immutable source score, signal and confidence snapshots;
- the canonical equal-weight convergence score;
- the canonical confidence penalty and cap;
- the canonical `mixed` / `conflict` precedence and convergence label;
- a deterministic summary containing both branch results, combined result, agreement class, score gap, source dates, source methodologies, separation from Opportunity Assessment, and the non-advice disclaimer;
- `methodology_version = 'market-convergence-v1'`.

A database constraint prevents incomplete `market-convergence-v1` rows from being stored. Identity remains:

```text
(instrument_id, assessment_date, methodology_version)
```

The refresh uses an upsert against that identity and updates only when the persisted payload differs. A new later source date creates a historical row. No-input calendar days create no artificial snapshot. Prior convergence rows are never analytical inputs.

## Freshness, history and retry rules

The run cutoff is converted to an `America/New_York` logical date. Both selected source dates must be no more than four calendar days old. This deterministic window admits an ordinary weekend while rejecting materially stale daily inputs without relying on a partial exchange-holiday calendar.

A stale pair is counted in `public.market_convergence_runs` and skipped. A missing branch is counted separately and skipped. Neither condition inserts a neutral/default convergence row or changes an existing historical row.

Every run records:

- logical date and immutable cutoff;
- optional instrument scope;
- execution source;
- retry parent and attempt number;
- considered, eligible, fresh, stale, missing-input and changed-row counts;
- terminal status, error code/message and timestamps;
- methodology and freshness-rule metadata.

Retries require a failed parent, inherit its cutoff and scope, and are limited to three total attempts. Lineage is strictly linear: each failed run may have at most one direct child of any status, a subsequent retry targets only the latest failed leaf, and attempt numbers advance exactly `1 -> 2 -> 3`. `run_v1` rejects an ancestor that already has any child and rejects attempt 3 as a retry parent; a unique partial index on non-null `retry_of_run_id` independently prevents sibling children. `retry_latest_failed_v1` selects only a failed leaf with no child and returns `null` when no retryable leaf remains. Because result identity remains `(instrument_id, assessment_date, methodology_version)`, unchanged retries are idempotent.

## Independence boundary

Permitted inputs are limited to:

- `public.market_scores`;
- `public.gpt_market_assessments`.

The implementation requires the AI independence flag and does not read Opportunity Assessment, Opportunity Convergence, prior Market Convergence conclusions, or frontend state.

## Live Builder verification

A trusted `service_role` refresh on 22 August 2026 produced:

- 30 eligible Technical/AI instrument pairs;
- 30 persisted `market-convergence-v1` rows;
- 30 distinct instruments;
- zero missing lineage values;
- zero missing output values;
- zero out-of-range scores or confidence values;
- zero invalid labels;
- zero duplicate identities;
- zero independent formula or selected-source mismatches.

The original CONV-002 retry reported `rows_changed = 0`. All 30 row identities and calculation payloads remained unchanged.

CONV-003 then verified the live history/retry path:

- three real `service_role` current runs each considered 30 instruments and recorded 30 stale pairs, zero fresh pairs and zero writes;
- the remediation run preserved all 30 result rows and the complete identity/timestamp/payload hash, with zero duplicate identities;
- a rollback-only fresh-source test inserted one new source-date history row with zero duplicate identities;
- a rollback-only forced-failure test produced one linear chain with attempts `1`, `2` and `3`, inherited cutoff and instrument scope, SQLSTATE `42501` on the two function-created failed attempts, and zero sibling groups;
- retrying the ancestor was rejected because it already had a child, directly retrying attempt 3 was rejected by the ceiling, and `retry_latest_failed_v1` returned `null` after the ceiling;
- the attempted fourth invocation left the chain at exactly three rows, and all rollback-only source and retry fixtures were removed automatically.

Verified label distribution:

| Label | Rows |
|---|---:|
| `strong_bullish` | 7 |
| `moderate_bullish` | 4 |
| `neutral` | 12 |
| `moderate_bearish` | 1 |
| `mixed` | 3 |
| `conflict` | 3 |

Client privilege verification confirmed:

- `service_role`: execute and write allowed;
- `anon`: read allowed, execute/write denied;
- `authenticated`: read allowed, execute/write denied.

## Completed delivery boundary

CONV-002 established current-state persistence, CONV-003 added deterministic source-date history, stale-input decisions and bounded retries, and CONV-004 deployed distinct Technical, AI and Convergence presentation.

## Existing-controller continuation — 10 November 2026

Controller specification 1.10 adds a deterministic continuation after terminal Market work, before shared publication. This is source wiring for the existing single daily controller, not proof that its hosted task has loaded this revision. No new scheduler, trigger, schema or analytical methodology is introduced. Preserve the current native function implementation, including the retry-chain correction in `20260822052500_enforce_market_convergence_retry_chain.sql`.

1. Retrieve this document and `scripts/market-convergence-readiness.sql` at the same exact commit as the controller. Confirm the existing controller's production-date and terminal-Market prerequisites; do not manufacture a missed or non-session run.
2. Execute the SQL file unchanged using the trusted Trading SQL connection. It is a single read-only query with no placeholders. `statement_timestamp()` supplies one fixed current cutoff and its New York logical date. This is a separate convergence cutoff after the completed sources were saved, not a change to either branch's research cutoff. Do not substitute a historical timestamp.
3. Retain its cutoff and selected Technical/AI IDs with the invocation evidence. Source selection matches `refresh_as_of_v1`, then additionally requires the selected AI run to be `succeeded` or `partial`, with `completed_at <= cutoff_at`. It intentionally does not select an older terminal AI assessment when the canonical latest eligible assessment belongs to an unfinished run. Missing, stale, unfinished and existing-run conditions return explicit readiness codes and null executable SQL.
4. For each `READY` row, execute its exact `invocation_sql` sequentially in a separate short transaction. The SQL text contains safely quoted literal UUID/cutoff values and calls `run_v1('scheduled', null, cutoff, instrument_id)`. Run at most one new attempt per instrument per invocation. The native function remains authoritative for overlap, same-date deduplication and persistence. Do not hold a transaction open while researching or use a whole-universe scope. If interrupted before dispatch, discard unexecuted commands and recheck current readiness; do not replay a saved command batch in a later invocation.
5. Retain each returned `run_id`, then query `public.market_convergence_runs` by that exact ID. Verify its scope, cutoff, terminal status and counts. For a successful instrument run require `instruments_considered = eligible_pairs = fresh_pairs = 1`, `stale_pairs = missing_input_instruments = 0`, and `rows_changed` of 0 or 1. Reconcile the result at `(instrument_id, greatest(technical_date, ai_date), 'market-convergence-v1')` to both selected source IDs and the canonical snapshots. Zero changed rows is valid for an unchanged already-persisted result; zero fresh pairs is not success for morning coverage. Preserve any mismatch as a blocker rather than overwriting history to make evidence agree.
6. `ALREADY_SUCCEEDED` reports the existing scoped run ID and matching lineage; do not rerun it. `SAME_DAY_INCOMPLETE_SUCCESS` or `SAME_DAY_LINEAGE_CHANGED` needs investigation, not a `manual` call that bypasses scheduled deduplication. The native run status only certifies execution: source eligibility and receipt reconciliation remain necessary. A new source-date result on a later legitimate invocation preserves history through the existing identity rules.
7. `CONVERGENCE_RUNNING` means do not race the run. A lost response requires checking durable runs for the exact cutoff/scope before any replay. If the result remains uncertain, stop that instrument and report it. Failed leaves return their exact IDs and attempt numbers but no automatic invocation. On a later permitted invocation, an explicitly diagnosed retry uses that exact leaf with `run_v1('retry', failed_leaf_id, original_cutoff, instrument_id)`; the function inherits and enforces the original cutoff/scope. Check that no child exists, preserve the maximum three-attempt linear chain, and never start a fresh scheduled/manual chain to bypass it. Do not use `retry_latest_failed_v1()` blindly because it may choose an unrelated historical failure. Later-arriving evidence does not belong to an old retry's cutoff.
8. Report fresh, already-completed, blocked and uncertain instrument counts separately, with native run IDs and sanitized reason codes. Native receipts are this step's persistence contract; `private.claim_trading_stage_v1` has no convergence stage. The watchdog currently does not certify convergence. Do not stall independently eligible shared work over a convergence blocker, add a follow-up schedule, or exceed the single controller's 90-minute budget.

The readiness query is not a transaction fence against source edits between inspection and invocation. The fixed cutoff excludes later-created/calculated rows; the receipt and source-snapshot reconciliation detects changed lineage/payload. Diagnose a mismatch without backdating or rewriting the saved source history.
