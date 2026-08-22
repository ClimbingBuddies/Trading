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

---

## Re-review — 22 August 2026, 13:55 AWST

- **Task:** CONV-003 — Add convergence history and retry rules
- **Project-plan status at review start:** `IN REVIEW`
- **Decision:** **PASS**
- **Final project-plan status:** `DONE`
- **Next promoted task:** CONV-004 — Surface convergence in frontend

## Definition of Done

> Daily/history uniqueness and stale-input behaviour are deterministic.

| Check | Verdict | Independent evidence |
|---|---|---|
| Remediation source exists and is live | **VERIFIED** | GitHub contains `20260822052500_enforce_market_convergence_retry_chain.sql` at blob `f80e8ee3dab2c6fccf1e630c95742607a1e952d8`; live migration history contains `20260822052654 enforce_market_convergence_retry_chain`. |
| Database prevents retry siblings | **VERIFIED** | The live `market_convergence_runs_retry_of_idx` is a unique partial index on non-null `retry_of_run_id`. An Auditor-owned direct sibling insert failed with unique-violation SQLSTATE `23505`. |
| Function prevents reusing an ancestor | **VERIFIED** | Live `run_v1` checks for any existing child, regardless of status. Retrying the failed attempt-1 ancestor after attempt 2 existed failed with SQLSTATE `55000` and created no row. |
| Automatic retry selects only a failed leaf | **VERIFIED** | Live `retry_latest_failed_v1` excludes any failed run with a child of any status. In rollback testing it selected attempt 2, not the attempt-1 ancestor. |
| Attempts progress exactly 1 -> 2 -> 3 | **VERIFIED** | Auditor-owned forced failures produced one three-row chain with attempts `[1,2,3]`, direct parent links `1 -> 2 -> 3`, zero sibling groups and terminal `failed` status for each attempt. |
| Fourth attempt is rejected | **VERIFIED** | Directly retrying attempt 3 failed with SQLSTATE `22023`; chain count remained three. `retry_latest_failed_v1` then returned `null`. |
| Retry cutoff and scope remain immutable | **VERIFIED** | Attempts 2 and 3 inherited the attempt-1 cutoff and instrument ID even though conflicting cutoff/scope arguments were supplied. |
| Four-day/five-day freshness boundary remains deterministic | **VERIFIED** | Fresh Auditor rollback testing at exactly four calendar days produced one fresh pair and one write; the unchanged repeat produced zero writes with stable row ID, timestamp and payload. Moving one source to five days produced one stale pair and zero writes. |
| History identity remains unique and idempotent | **VERIFIED** | The four-day test created exactly one source-date identity; its retry retained the same row and payload. Duplicate identity groups remained zero. |
| Current stale-input behaviour remains truthful | **VERIFIED** | A fresh real `service_role` run considered 30 instruments, found 30 eligible pairs, classified 0 fresh / 30 stale and changed zero rows. |
| Existing results retain exact lineage and formula parity | **VERIFIED** | Independent reconstruction of all 30 persisted rows found zero lineage mismatches and zero Technical/AI snapshot, convergence score, confidence or label mismatches. |
| Real retry/run lifecycle remains durable | **VERIFIED** | Forced function failures reached terminal `failed` with SQLSTATE `42501`; the current real run reached terminal `succeeded` with counts, timestamps, methodology and no error. |
| Access boundary remains deliberate | **VERIFIED** | Both retry functions are security-invoker, PostgreSQL-owned and fixed to `search_path=pg_catalog`. `service_role` can execute; `anon` and `authenticated` cannot. RLS remains enabled on run and result tables. |
| Auditor tests leave no fixtures | **VERIFIED** | Retry, source-date and permission tests were transactionally rolled back. Final live state contains 30 results, zero result duplicates, zero retry rows and zero retry-sibling groups. |
| Documentation matches enforced behaviour | **VERIFIED** | The current specification and pipeline document one child per failed run, failed-leaf selection, exact `1 -> 2 -> 3` progression, the unique index and fourth-attempt rejection. |
| Advisors show no new task-scoped blocker | **VERIFIED** | Current security advisors contain no Market Convergence finding. Existing performance notices are unrelated legacy/unused-index information and do not invalidate CONV-003. |

## Primary evidence inspected

### GitHub

- `automation/project-plan-auditor.md` — blob `50e4ca1d2b7f57505e98418322e6d831b062dfd0`
- `documentation/project-plan.md` — starting blob `a4d5cb81c50512907ed853a2ab2880403d0ce668`
- `documentation/project-audits/CONV-003.md` — starting blob `c2234a24a7a1d382e3ef241caa6504385c431a99`
- `supabase/migrations/20260822052500_enforce_market_convergence_retry_chain.sql` — blob `f80e8ee3dab2c6fccf1e630c95742607a1e952d8`
- `documentation/specifications/market-convergence-specification.md` — blob `fdf768ff44b0d0f2741a6bd5252bbee03feaaf9f`
- `documentation/pipelines/market-convergence-pipeline.md` — blob `fa1929ad9f3235b6b0cc4456e6668aed8f8a0302`

### Live Supabase — `glvbqcplgjdfgjyknzsa`

- Migration history, live table constraints, unique partial retry index and RLS state.
- Live definitions, owners, fixed search paths and ACLs for all four Market Convergence functions.
- Auditor-owned rollback-only direct database sibling test.
- Auditor-owned rollback-only forced `service_role` failure chain through attempts 1, 2 and 3.
- Auditor-owned ancestor and fourth-attempt rejection tests.
- Auditor-owned failed-leaf selection test.
- Auditor-owned rollback-only four-day/five-day boundary and repeated-history idempotency test.
- Auditor-owned real current `service_role` run.
- Independent 30-row source-lineage and formula reconstruction.
- Final counts, hashes, duplicate checks, permission restoration and security/performance advisors.

### Vercel / production / browser

Not applicable to CONV-003. Frontend presentation is the separate CONV-004 item.

## Independent result summary

- Live remediation migration: **present**
- Unique direct children per parent: **enforced**
- Auditor attempt sequence: **1, 2, 3**
- Auditor sibling groups: **0**
- Ancestor retry: **rejected**
- Direct fourth retry: **rejected**
- Automatic retry after attempt 3: **null**
- Chain rows before/after fourth attempt: **3 / 3**
- Cutoff/scope inheritance mismatches: **0**
- Four-day first/repeat writes: **1 / 0**
- Five-day writes: **0**
- Current fresh/stale pairs: **0 / 30**
- Current real-run writes: **0**
- Persisted convergence rows: **30**
- Formula mismatches: **0**
- Lineage mismatches: **0**
- Duplicate result identities: **0**
- Persisted Auditor fixtures: **0**

## Decision

**PASS.**

The prior retry-ceiling defect is fixed at both function and database layers. Fresh independent testing proves a linear three-attempt chain, leaf-only selection, immutable retry scope, fourth-attempt rejection, deterministic freshness/history behaviour, stable idempotency, deliberate access and clean rollback. CONV-003 may be marked `DONE`, and CONV-004 may be promoted to `NEXT`.

