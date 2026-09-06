# MYDASH-006 — Producer Evidence

**Gate:** MYDASH-006

**Role:** Producer

**Record status:** IN_PROGRESS — PHASES 1–2 LOCALLY VERIFIED

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

## Limitations and next phase

MYDASH-007 remains responsible for deterministic entry resolution and return snapshots. MYDASH-006 still needs user-paper and eligible AI-signal capture controls, whole-gate regression, available localhost states after schema application and independent audit handoff. Isolated database policy/ACL/RPC execution remains deferred while the migration is unapplied. This is not an Auditor decision and does not promote the gate.
