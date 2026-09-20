# Shared paper adapter

`lib/shared-paper-adapter.mjs` is a Node-only bridge to the deterministic engine.
It is not a deployed evaluator. No scheduler, database gate or browser API is changed.

## Trusted snapshot transport

`evaluateSharedCall(callId, {readSnapshot, commitProposal, maxConflictRetries: 1})`
requires privileged injected transports. `readSnapshot` must read a consistent
database transaction snapshot and return:

- `contractVersion: 1`, database-owned `asOf` with timezone.
- `call`: full shared call row, including decimal-string `cost_per_side`.
- `reviews`: complete ordered review rows; no silently truncated history.
- `state`: `{call_id, version, evaluated_through}`. Version is an integer string;
  watermark is a timestamp or null.
- `outcomes`: all persisted rows, including immutable `evidence.engine` payloads
  originally emitted by this adapter; all DB numeric columns are decimal strings
  or null. Existing rows without that evidence fail closed; do not guess a mapping.
- `instrumentExchange` and `benchmarkExchange`: verified matching exchange IDs.
- `calendar`: `{exchange, complete: true, coverageStart, coverageEnd,
  provenance: {verified: true, verifiedAt, reference, revision},
  sessions: [{id, opens_at, closes_at}]}`. Sessions must be complete and in order,
  span the original publication through evaluation, and come from an independently
  verified exchange calendar. Prices cannot establish session completeness. Include
  the next eligible future session for pending entries/exits, with coverageEnd
  beyond that session; absent future coverage remains Calendar required.
- `observations`: `{id, instrument_id, provider_id, currency, interval_code,
  session_id, session_close, loaded_at, close, adjusted_close}`. Numeric values are
  decimal strings. Session attribution must be verified in the DB read transport;
  do not reinterpret provider midnight timestamps as exchange closing timestamps.

Flags and references are structural validation, not authentication or independent
proof of provenance. The trusted DB transport must source them from verified stored
records. Never expose these functions as a browser-controlled JSON evaluator.

## Proposal and commit obligations

`prepareSharedEvaluation(snapshot)` validates and maps the snapshot, evaluates with
no wall-clock calls, and returns a frozen deterministic proposal containing snapshot
hash, previous outcomes hash, expected version, next watermark, state and append-only
rows. Existing outcomes are not rewritten. PostgreSQL JSONB key order is normalized
for pinned engine price evidence. Hashes use recursively sorted JSON object keys
and SHA-256, NOT PostgreSQL JSONB text formatting. Commit transport must reproduce
this canonicalization or compare a trusted saved snapshot token/hash.

The commit transaction must acquire the publisher's instrument advisory lock,
recheck version, decision history, price/calendar revisions and exact snapshot hash,
validate every proposed calculation against trusted evidence, append with unique
keys and advance the watermark/version together even when no outcomes are emitted.
It must own recorded timestamps and preserve engine `recordedAt` evaluation evidence;
the current mapping requires those timestamps agree. Implement the DB writer before
enabling the gate. This module does not itself prove a submitted proposal trustworthy.

Return `{status:'COMMITTED', callId, proposalHash, version, evaluatedThrough}` where
version equals expectedVersion+1. For an explicit transaction conflict return
`{status:'VERSION_CONFLICT'}`. Only that response triggers a bounded fresh-read and
recompute (0–3 retries). Network exceptions and invalid acknowledgements propagate;
the caller must reconcile uncertain commits before attempting again. Never retry
an unknown commit result automatically.

## Limitations and required tests

Temporary coverage restriction: instrument and benchmark must use the identical
verified exchange ID. Nasdaq/NYSE Arca cross-venue pairs are intentionally rejected
even where their trading sessions might align. Do not rename venues to pass this
check. A later verified calendar-compatibility mapping must retain original venues
and prove shared sessions before broad US benchmark coverage can be enabled.

Pinned history rejects cancellation with position outcomes, exits or performance
without entry, fills inconsistent with Buy/Sell events, preentry/postexit marks,
incorrect checkpoint session indices and records appended after terminal outcomes.
The trusted DB writer must independently enforce these same lifecycle invariants.

No live DB read/commit implementation, trusted calendar importer, enrollment or
schedule wiring is included. The SQL outcome gate stays closed. Engine arithmetic
uses IEEE doubles; input decimals above 15 significant digits fail closed. Persisted
return validation requires documented DB tolerance/rounding, not an arbitrary JSON
write. The engine's REDUCE behavior remains unchanged (no partial fills).

Required tests: deterministic Buy/Hold/Sell mapping, unchanged pinned outcomes after
JSONB key reordering, watermark-only commits, duplicate observation IDs, mismatched
currency/provider/session, incomplete/unverified calendar, stale watermark,
unsupported decimal precision, retry only VERSION_CONFLICT, exhausted conflicts,
network failures without retry, and receipt identity/hash/version mismatch.
