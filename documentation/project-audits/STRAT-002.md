# STRAT-002 — Define test-run ingestion format

## Review — 24 August 2026, 16:23 AWST

**Project-plan status at review start:** `IN REVIEW`  
**Decision:** `PASS WITH ADVICE`

### Definition of Done

Project-plan requirement: **Backtest/paper/live provenance and metrics are documented.**

| Check | Verdict | Independent evidence |
|---|---|---|
| Backtest, paper and live test types are explicitly defined | VERIFIED | Canonical `documentation/specifications/strategy-test-run-ingestion.md` defines all three types and live Supabase retains the exact `backtest`, `paper`, `live` check constraint. |
| Test-run provenance is documented | VERIFIED | The specification separately defines strategy identity, data provenance and execution provenance, including type-specific requirements for backtest, paper and live evidence. |
| Immutable strategy identity is preserved | VERIFIED | Live trigger `trading_test_runs_capture_provenance_v1` captures strategy code/version/methodology, JSONB snapshot, SHA-256 hash and capture time. Rollback-only audit inserted a real owner draft and verified a 64-character hash; later snapshot mutation was rejected. |
| Retry/idempotency identity is defined | VERIFIED | `run_key` is required and owner-scoped unique in live Supabase. A rollback duplicate using the same owner/run key was rejected. |
| Lifecycle and failure semantics are defined | VERIFIED | Live states are `draft`, `running`, `succeeded`, `failed`, `cancelled`; terminal rows require `completed_at`, and `failed` requires a non-empty `failure_message`. Both constraints were independently exercised in rollback. |
| Period/capital/source fields are defined | VERIFIED | Live schema contains input cutoff, overall/in-sample/out-of-sample periods, initial/ending equity, base currency, engine/source run identity, data provenance and execution provenance. |
| Metrics used by Standard Strategy Review have explicit semantics | VERIFIED | `strategy-test-metrics-v1` defines instrument/trade counts, net profit, return, win rate, profit factor, expectancy, max drawdown, Sharpe and out-of-sample return, including cost treatment and first-backtest Sharpe convention. |
| Owner security remains deliberate | VERIFIED | Rollback real-role test confirmed the strategy owner could insert/read a draft and a second authenticated user could neither see the row nor attach a test to the owner's strategy. Browser roles cannot directly execute the provenance helper; `service_role` can. |
| STRAT-002 did not load a real result | VERIFIED | `public.trading_test_runs` contained zero rows before audit, the independent matrix was rolled back, and the post-test count remains zero. |
| STRAT-003 remains the real-result stage | VERIFIED | Canonical specification and Strategy Framework both state that STRAT-003 must produce/persist the first real backtest under this contract. |

### Primary evidence inspected

#### GitHub

- `automation/project-plan-auditor.md` v1.1 — fresh-read at the beginning of this audit.
- `documentation/project-plan.md` — fresh-read; STRAT-002 was the single `IN REVIEW` item.
- `documentation/specifications/strategy-test-run-ingestion.md` — canonical `strategy-test-ingestion-v1` / `strategy-test-metrics-v1` contract.
- `supabase/migrations/20260824154000_define_strategy_test_run_ingestion_v1.sql`.
- `supabase/migrations/20260824154500_add_strategy_test_run_idempotency_v1.sql`.
- `supabase/migrations/20260824154700_require_strategy_test_run_provenance_v1.sql`.
- `documentation/strategy-framework.md` — now links the canonical ingestion contract and preserves the STRAT-003 boundary.
- `documentation/project-audits/STRAT-002.md` did not exist before this review.

#### Supabase production (`glvbqcplgjdfgjyknzsa`)

- All new STRAT-002 columns are present in live `public.trading_test_runs`.
- Live check constraints retain exactly the three test types and five lifecycle states documented by the specification.
- `run_key`, strategy identity/snapshot/hash and capture time are required in live schema.
- Unique `(owner_user_id, run_key)` index is present.
- Provenance trigger is live.
- Provenance helper is not directly executable by `anon` or `authenticated`; `service_role` can execute it.
- Matching three migration-history entries are present.
- Independent rollback-only matrix verified:
  - exact strategy snapshot/hash capture;
  - snapshot/hash immutability;
  - duplicate owner/run-key rejection;
  - terminal state requires `completed_at`;
  - failed state requires `failure_message`;
  - owner read/insert path;
  - second-user isolation;
  - cross-owner attachment denial.
- Post-rollback `trading_test_runs` row count remained `0`.

#### Vercel / production

- Latest production deployment at audit time: `dpl_ArRvwWqQirV4bgZYCyzKQvWTSRFL`, `READY`, repository commit `3bb55469617c0dd2a741573929a396f30f49df29`.
- Build independently passed palette compliance, Next.js compilation and TypeScript.
- `/strategies` returned HTTP 200 and continued to show zero test runs, consistent with the deliberate STRAT-002 zero-row boundary.

### Assessment

STRAT-002 creates a complete evidence contract rather than merely adding more metric columns. A future result can be tied to the exact tested strategy definition, stable logical run identity, data cutoff, execution model, in/out-of-sample periods and versioned metric semantics. The distinction between backtest, paper and live provenance is explicit, and schema support for `live` is correctly documented as non-authorising.

The implementation also carries forward the STRAT-001 audit advice by capturing an immutable strategy snapshot/hash automatically at insertion instead of trusting a later read of a mutable strategy row.

### Non-blocking advice

STRAT-003 should implement a trusted, atomic prepare/upsert/finalise path for the first real backtest. That finalisation path should refuse `run_status = 'succeeded'` unless the required backtest metrics and data/execution provenance declared by `strategy-test-ingestion-v1` are populated and internally consistent. STRAT-002 documents that rule, but the generic table intentionally does not hard-code every successful-backtest field as globally non-null because paper/live and failed/cancelled records have different requirements.

### Final state

**Audit decision:** `PASS WITH ADVICE`  
**Final project-plan status:** `DONE`  
**Next promoted task:** `STRAT-003 — Load first real test run`
