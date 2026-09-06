# MYDASH-006 — Producer Evidence

**Gate:** MYDASH-006

**Role:** Producer

**Record status:** IN_PROGRESS — PHASES 1–3 LOCALLY VERIFIED

**Date:** 6 September 2026

## Phase 1 — immutable capture foundation

The local candidate introduces the approved personal decision ledger without applying it to Supabase. It deliberately does not reuse `trading_test_runs` or `trading_decision_evaluations`: MYDASH-001 found those records describe strategy tests rather than owner decisions with forward clocks.

Implemented boundaries:

- AI-signal decisions derive instrument, normalized action, complete source snapshot and `decision_at` from a succeeded independent Market assessment and its owning run's authoritative `analysis_cutoff_time`;
- user-paper decisions use one server `clock_timestamp()` for both `source_cutoff` and `decision_at`, and never accept a client timestamp or arbitrary source snapshot;
- both persist the approved horizon, `NEXT_DAILY_CLOSE` entry rule, bounded fees/slippage/notional, currency identities, optional benchmark and `personal-forward-return-v1` calculation identity;
- decisions and events are owner-select-only, reject anonymous callers, deny browser table writes and reject UPDATE/DELETE through triggers;
- capture/event RPCs derive `owner_user_id` from `auth.uid()`, validate parent ownership and expose no broker, order, account or execution field;
- EXIT/CANCEL are append-only and limited to one terminal event; same-owner decision linkage is added to paper portfolio positions.

## Verification

- Focused migration contract: **5/5 passed**.
- Repository tests: **132/132 passed**.
- TypeScript: `npx tsc --noEmit` passed.
- Whitespace/error check: `git diff --check` passed.
- Database/RLS/RPC execution: deferred; migration intentionally remains unapplied and no hosted/private row was accessed.
- Browser verification: not applicable to this phase because no UI changed.

## Publication

Phase 1 and its delivery record are published through `17cc5b7c977f7d4662b48f5032960efa26b36ea6`; local and `origin/main` identities were confirmed equal before phase 2 began.

## Phase 2 — owner-scoped reads and lifecycle UI

The dashboard performs separate owner-filtered reads of immutable decisions and append-only events, validates their identities, chronology and approved enums before display, and keeps the whole Decision Lab result hidden if either response is malformed. Lifecycle is derived without guessing: terminal EXIT/CANCEL is completed, an exact paper-position link is open, and otherwise the decision is pending entry. AI assessment cutoff and user-paper server capture clocks remain visibly distinct. Entry price and returns remain unavailable rather than zero until MYDASH-007 produces forward evidence.

- Focused Decision Lab checks: **8/8 passed**.
- Repository tests: **135/135 passed**.
- TypeScript, palette and `git diff --check`: passed.
- Localhost desktop and 390 × 844: the selected Decision Lab tab remains responsive and exposes the existing authenticated private-data unavailable state because the candidate migration is intentionally unapplied; no browser console error appeared.
- No capture mutation was added in this phase. No database, hosted/private row, deployment, provider, broker or trading action occurred.
- Phase-2 functional/control commit `024bcfb0a8ee7c8b680b015a7f63fd41c47ff372` was pushed without force and independently confirmed as both local `HEAD` and `origin/main`.

## Phase 3 — constrained capture controls

Decision Lab now exposes two deliberately separate capture paths. The user-paper form sends only an active instrument, approved action, approved horizon and bounded optional note; the audited RPC derives owner identity, source snapshot and one trusted server clock. The AI path is offered only from persisted recommendation lineage whose source family is `MARKET_AI`; the RPC receives only that assessment identity and revalidates its succeeded independent run before deriving action, instrument, snapshot and original analysis cutoff.

Both paths make the fixed v1 paper assumptions visible: base-currency notional 1,000, zero fees/slippage, no benchmark and `NEXT_DAILY_CLOSE`. Browser table inserts remain absent. Technical, Opportunity and external-fact evidence cannot be promoted into an AI decision, and no broker, account, order or execution control was added.

- Focused decision migration/UI checks: **9/9 passed**.
- Repository tests: **136/136 passed**.
- TypeScript, palette and `git diff --check`: passed.
- Localhost desktop: authenticated Decision Lab rendered the user-paper fields, explicit assumptions, eligible-source empty state and unapplied-schema error state; the document had no horizontal overflow, Next.js error overlay or console warning/error.
- A fresh 390 × 844 viewport was unavailable in the current browser-control surface. The responsive CSS collapses both new grids/actions below 680 px, but this source inspection is not claimed as fresh narrow-screen execution evidence.
- No form was submitted during browser verification. No database, hosted/private row, deployment, provider, broker or trading action occurred.
- Phase-3 implementation/test/control commit `31616d681258f4b2597e0197cff93a782c66c88c` was pushed without force and confirmed as both local `HEAD` and `origin/main` before this publication record.

## Limitations and next phase

MYDASH-007 remains responsible for deterministic entry resolution and return snapshots. MYDASH-006 still needs whole-gate regression and independent audit handoff. Available localhost success states plus isolated database policy/ACL/RPC execution remain deferred while the migration is unapplied; fresh narrow-screen execution also remains deferred. This is not an Auditor decision and does not promote the gate.
