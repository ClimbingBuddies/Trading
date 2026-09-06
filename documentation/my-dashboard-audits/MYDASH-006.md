# MYDASH-006 — Producer Evidence

**Gate:** MYDASH-006

**Role:** Producer

**Record status:** IN_PROGRESS — PHASE 1 LOCALLY VERIFIED

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

## Limitations and next phase

The candidate has no Decision Lab UI yet and MYDASH-007 remains responsible for deterministic entry resolution and return snapshots. MYDASH-006 still needs owner-scoped decision/event reads, user-paper and eligible AI-signal capture controls, explicit pending/open/completed presentation, browser verification and whole-gate security evidence. This is not an Auditor decision and does not promote the gate.
