# Project Audit — CONV-003

## Review — 22 August 2026, 12:52 AWST

- **Task:** CONV-003 — Add convergence history and retry rules
- **Project-plan status at review start:** `IN REVIEW`
- **Decision:** **REWORK**
- **Final project-plan status:** `IN PROGRESS`
- **Next promoted task:** None

## Definition of Done

> Daily/history uniqueness and stale-input behaviour are deterministic.

| Check | Verdict | Independent evidence |
|---|---|---|
| GitHub implementation exists and the migration is live | **VERIFIED** | GitHub contains `20260822042000_add_market_convergence_history_retry_v1.sql`; live migration history contains `20260822043217 add_market_convergence_history_retry_v1`; the live run table and four private functions exist. |
| Source selection is deterministic at an immutable cutoff | **VERIFIED** | Live `refresh_as_of_v1` restricts source date and creation/calculation timestamp to the cutoff, then orders Technical by `score_date, calculated_at, id` and AI by `assessment_date, created_at, assessment_id`, all descending. |
| Logical date and stale-input threshold are explicit | **VERIFIED** | The cutoff converts to an `America/New_York` logical date. Both branches must be zero to four calendar days old. Table constraints bind each logged logical date to its cutoff. |
| Four-day/five-day freshness boundary works | **VERIFIED** | Auditor-owned rollback testing produced one fresh pair and one history insert at exactly four days; the same source at five days produced one stale pair and zero writes. |
| Current stale inputs are handled truthfully | **VERIFIED** | Independent source selection found 30 pairable active instruments, Technical dates 14–15 August and AI date 20 August. The live current call classified all 30 as stale and changed zero rows. |
| Source-date history identity is deterministic | **VERIFIED** | A rollback-only fresh-source test created one new date identity under `(instrument_id, assessment_date, methodology_version)`; zero duplicate groups existed. |
| Repeat persistence is idempotent | **VERIFIED** | Repeating the same fresh test returned `rows_changed = 0` and preserved row ID, `updated_at` and complete payload hash. Existing current-state calls also changed zero rows. |
| The audited v1 formula remains unchanged | **VERIFIED** | Auditor-owned reconstruction independently matched selected Technical/AI IDs, convergence score, confidence and label for the rollback-only history row. |
| Stale or missing inputs do not create defaults | **VERIFIED** | Stale pairs are counted separately and skipped; no neutral/default result is created. Current stale testing retained the original 30 rows without mutation. |
| Run lifecycle and errors are durable | **VERIFIED** | Live run rows contain cutoff, logical date, counts, status and timestamps. Rollback-only permission failures reached terminal `failed` with SQLSTATE `42501` and a bounded error message. |
| Retry cutoff and scope are inherited | **VERIFIED** | Every Auditor-created retry inherited the failed parent's exact cutoff and instrument scope even when conflicting arguments were supplied. |
| Retry count is limited to three total attempts | **FAILED** | The live function blocks only running/succeeded children. Auditor-owned rollback testing created three failed children and then a successful child against the same failed parent. All four children were labelled `attempt_number = 2`, producing five total attempt rows (parent plus four retries), despite the documented three-attempt limit. |
| Access policy is deliberate | **VERIFIED** | `anon` and `authenticated` can read run/result telemetry but cannot write or execute; `service_role` alone can execute and write. RLS is enabled and all functions are security-invoker, owned by `postgres`, with `search_path=pg_catalog`. |
| History lineage indexes exist | **VERIFIED** | Covering indexes exist for Technical/AI assessment lineage and run retry/scope foreign keys. The current advisor no longer reports those foreign keys as unindexed. |
| Documentation matches live behaviour | **FAILED** | Documentation claims retries are limited to three total attempts, but the live function permits unlimited failed sibling children of the same parent until one succeeds. |

## Primary evidence inspected

### GitHub

- `automation/project-plan-auditor.md` — blob `50e4ca1d2b7f57505e98418322e6d831b062dfd0`
- `documentation/project-plan.md` — starting blob `45153314027ae664421ab9e81c5e8cabfc1c8ee5`
- `supabase/migrations/20260822042000_add_market_convergence_history_retry_v1.sql` — blob `2e0e69443ea11449ae714a6f7a7636a8d349c6f8`
- `documentation/specifications/market-convergence-specification.md` — blob `140efdc9466803545c7534489928f944c9c43fca`
- `documentation/pipelines/market-convergence-pipeline.md` — blob `46d96436f3473974888318f7ab39b458a2a20409`
- `documentation/supabase-data-model.md` — blob `5b0e2e173a28adde32249b4ebbc9f65283d77311`
- `documentation/project-audits/CONV-002.md` — blob `79bbe03da2acb5555017c011a63533a7025bb254`; prior covering-index advice was rechecked.

No prior `documentation/project-audits/CONV-003.md` existed.

### Live Supabase — `glvbqcplgjdfgjyknzsa`

- Migration history.
- Live run/result tables, columns, constraints, indexes, RLS policies and grants.
- Live definitions, owners, search paths and ACLs for all `market_convergence` functions.
- All current active Technical and AI source dates.
- Current result/run counts and duplicate identities.
- Auditor-owned current stale call.
- Auditor-owned rollback-only four-day/five-day freshness test.
- Auditor-owned rollback-only history/formula/idempotency test.
- Auditor-owned rollback-only retry-chain test with forced terminal failures.
- Final cleanup verification: 30 results, two production verification runs, zero duplicate identities and zero Auditor fixtures.
- Current Supabase security and performance advisors.

### Vercel / production / browser

Not applicable to CONV-003. This task changes trusted history, freshness and retry persistence; frontend presentation remains CONV-004.

## Independent result summary

- Active instruments considered: **30**
- Current pairable inputs: **30**
- Current fresh/stale pairs: **0 / 30**
- Current result rows: **30**
- Current duplicate identities: **0**
- Exactly-four-day test: **fresh; one insert**
- Exactly-five-day test: **stale; zero writes**
- Repeat history test: **zero changes; stable identity and payload**
- Formula/source mismatches: **0**
- Retry inheritance mismatches: **0**
- Claimed maximum total attempts: **3**
- Auditor-achieved total attempts against one parent: **5**
- Sibling children labelled attempt 2: **4**
- Persisted Auditor test fixtures after rollback: **0**

## Required remediation

1. Make retry lineage linear: a failed run may have at most one direct retry child, regardless of that child's terminal status.
2. Enforce the rule at the database layer, for example with a unique partial index/constraint on non-null `retry_of_run_id`, and also reject any existing child in `run_v1`.
3. Require subsequent retries to target the latest failed leaf so attempts progress exactly `1 -> 2 -> 3`; never retry an ancestor that already has a child.
4. Ensure `retry_latest_failed_v1` selects only a failed leaf that has no child of any status.
5. Add an Auditor-reproducible test showing two forced failures produce attempts 1, 2 and 3, and that a fourth invocation is rejected without creating another run.
6. Update the pipeline/specification if the final enforced retry contract differs from the present wording.
7. Return CONV-003 to `IN REVIEW` after live migration, trusted-role verification, idempotency recheck and GitHub verification.

## Decision

**REWORK.**

History identity, freshness boundaries, stale-input behaviour, formula preservation, security and ordinary idempotency are independently verified. The bounded-retry requirement is not true in the live implementation: retry siblings can bypass the documented three-attempt ceiling. CONV-003 must return to `IN PROGRESS`; CONV-004 remains `PLANNED`.
