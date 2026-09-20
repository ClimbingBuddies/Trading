# Shared Decision Lab data contract v1

19 September 2026 · Implementation contract; public read API and persistence adapter are not yet implemented. Engine functions are server-side Node code, not browser imports. Existing personal records retain their own legacy path.

## Identity and publication

One immutable original `shared_decision_calls.id` identifies a paper cycle for an instrument. Updates in `shared_decision_reviews` point to that call. Outcomes point to the same call. An instrument can have multiple historical cycles but at most one nonterminal cycle under the future publisher's transaction lock. Assessment IDs must be unique across original calls AND reviews, enforced by the publisher; existing separate table constraints are insufficient alone.

Only trusted publication accepts independent research with a validated 64-character SHA-256 input hash, actual model identity, source cutoff and database-owned publication timestamp. The local engine does not validate research authenticity. Public reads contain no owner IDs, watchlist membership of other users, private notes or raw generation snapshots.

## Public read model

The future server/API adapter returns `contractVersion: 1`, `generatedAt` (UTC ISO timestamp), `items`, `nextCursor` (opaque string or null), counts and scheduled-run status. Each item has:

`items` contains published call cycles only. A separate `blockedItems` collection contains `{instrument, blocker}` for scoped instruments with no published call; it never contains private watchlist membership. Page it independently with `blockedCursor`, `blockedNextCursor` and page size 50 (cap 100), ordered by instrument ID ascending. Existing calls with data gaps remain in `items` with their own blocker, not in `blockedItems`.

Counts shape: `{trackedCalls, watching, awaitingEntry, open, exitSignal, closed, cancelled, blockedWithoutCall, callsNeedingAttention}`. The six position-state counts sum exactly to trackedCalls. `callsNeedingAttention` counts call cycles with a blocker or non-READY dataStatus and overlaps the position counts; `blockedWithoutCall` counts distinct instruments with no call. Display needs-attention total as `callsNeedingAttention + blockedWithoutCall` and label it as items needing attention, not distinct shares. All counts use the complete selected scope, independent of both pages. `blockedWithoutCall` does not contribute to trackedCalls.

| Field | Type / meaning |
| --- | --- |
| callId | UUID; immutable cycle ID |
| instrument | `{id, symbol, name, exchange, currency}`; verified instrument metadata |
| original | `{id, action, publishedAt, sourceCutoff, thesis, risks, modelIdentity, assessmentId}` from the original call |
| latestReview | Same decision fields or null; unchanged reviews are persisted but can be collapsed in the timeline |
| lastReviewedAt | Latest persisted original/review publication time, never fetch time |
| state | `WATCHING`, `AWAITING_ENTRY`, `OPEN`, `EXIT_SIGNAL`, `CLOSED`, `CANCELLED` |
| dataStatus | `READY`, `MISSING_DATA`, `CALENDAR_REQUIRED`, `UNVERIFIED`; separate from position state |
| entry / exit | `{outcomeId, at, price, currency}` or null; recorded fills only |
| performance | `{outcomeId, asOf, netReturn, benchmarkReturn, costPerSide, benchmark, kind}` or null |
| pricesAsOf | Latest validated session close used for the displayed calculation, or null |
| blocker | `{code, message, stage, lastAttemptAt, nextAction}` or null; no internal secrets |

Actions: BUY, WAIT, HOLD, SELL, REDUCE, AVOID. Returns and costs are decimal fractions (`0.097802` displays `9.78%`), never already-formatted percentages. Prices/returns from Postgres numeric are canonical decimal strings on the API; UI parses only for display, never authoritative recalculation. Null means unavailable, never zero. A benchmark includes instrument ID, symbol, name and currency, pinned to the cycle. Never change an old call's benchmark to the current configuration.

The engine's string state is an intermediate result, not a persisted UI enum. The adapter derives position state from immutable ENTRY/EXIT/CANCELLED evidence and signals, with data health separate. A prior valid return may be shown as historical with its date, but cannot appear as current performance after a data gap or revision. DATA_GAP alone does not close a position. Separate blocked instruments with no published call have instrument identity and blocker, never a fabricated call ID or original action.

## Lists and filtering

`scope=all|watched`, `checkpoint=latest|5|20`, page size 50 capped at 100. Watched scope is calculated under the current authenticated user's RLS; never accept a caller-supplied owner ID. Sort by original publication descending then call ID descending with a cursor over both keys. Stable list refresh may restart pagination. Counts describe the entire selected scope, not the current page, using disjoint position states; needs-attention is a separate overlapping data-health count. All cycles can be listed; label closed cycles clearly. Blocking rows without calls are counted separately from tracked calls.

## Detail drawer and evidence

Fetch by call ID after authentication. Display original call, chronologically ordered review/outcome timeline (timestamp then UUID), benchmark, costs and sanitized evidence. Evidence projection exposes source URLs/titles/dates, approved price-observation IDs/values and calculation methodology. Do not expose `private.shared_decision_evidence.snapshot` wholesale. Explicit loading, not-found, denied and failed states; failed reads must not render an empty-success state. Paginate long histories separately; do not silently truncate.

## Private notes

Read `shared_decision_private_notes` through owner RLS, separately from the shared payload. Append through `append_shared_decision_private_note(p_call,p_action,p_note,p_request)`; ownership comes from auth.uid(). Retain the request UUID and identical payload after an uncertain response; a changed payload needs a new request ID. These records are notes, never execution instructions or AI performance inputs. UI labels: Your private notes, Only you can see this. No automatic promotion of old personal notes into shared records.

## Trusted engine adapter

Map original plus reviews into ordered events: `id`, `assessmentId`, `action`, `publishedAt`, `sourceCutoff`, `model`, `thesis`, `risks`, `inputHash`. Map immutable saved outcomes into engine outcomes including idempotency key, session ID and pinned price evidence. Supply a complete verified calendar spanning the original signal through evaluation, with stable session IDs and UTC opens/closes. Map prices with instrument/provider identity, currency, close, adjustedClose and load timestamp. Partial calendars must not move an existing fill or checkpoint.

Evaluator output is proposed append-only outcomes. A database transaction must recheck cycle/version and prevent concurrent duplicates before saving, using unique event/session keys and single ENTRY/EXIT/CANCELLED rules. No browser may submit prices, outcomes, clocks or AI publications. Validate finite numerical values and currency/identity before conversion. Database precision, source authenticity, entry recovery deadline and post-close revision audits remain adapter/methodology deliverables; local fixtures do not verify them.

Persist `evaluatedThrough` as a monotonic cycle evaluation watermark even when an evaluation emits no outcomes. Reject earlier evaluation clocks and newly appended calls published at or before the watermark; identical publication retries remain idempotent. Existing stored outcome `recordedAt` values are a second lower bound. Reject a supplied calendar that relocates a pinned entry; missing next-session coverage for a Sell must report CALENDAR_REQUIRED, not an apparently healthy exit signal. These require adapter storage/transaction enforcement before live use.

## Scheduled status

Return safe `lastAttemptAt`, `lastCompletedAt`, `state` (pending/running/partial/succeeded/failed), target exchange sessions and blocker counts from durable run records. Distinguish scheduled-run completion from full universe completion. Unknown values remain null/unverified; no inferred success from a page refresh.

## Contract acceptance

Both builders use this version. Changes require controller review and targeted consumer tests. Verify original-to-drawer identity, stable paging, scoped counts, decimals, null returns, blocked/no-call rows, private-note isolation and source sanitization at integration. This file defines behavior; it does not claim those endpoints exist or that live data has passed readiness.
