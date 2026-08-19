# OPS-007 — Historical Market run and backlog resolution

**Builder verification date:** 19 August 2026  
**Project-plan item:** `OPS-007 — Resolve historical Market run and backlog`  
**Decision:** Ready for independent audit  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Canonical specification:** `automation/daily-market-assessment.md`

## Scope

This Builder pass deliberately resolved the legacy Market Assessment lifecycle and queue backlog without replaying historical work and without deleting or rewriting assessment/evidence content.

The canonical Market specification requires normal production work to use only the current New York assessment date and explicitly assigns stale historical cleanup to this project-plan item.

## Pre-change inventory

Live Supabase contained three Market Assessment runs:

1. **1 August 2026 legacy test run**
   - run ID `1bebc82b-5727-4d9a-ac86-e1ca32c07ed7`;
   - `analysis_mode = 'test'`;
   - status `running`;
   - requested/completed lifecycle fields: 30/0;
   - `completed_at = null`;
   - 30 persisted assessments across 30 instruments;
   - 30 persisted evidence rows;
   - no linked queue record.

2. **14 August 2026 test execution**
   - run ID `ad29d1ea-97d7-46cd-a8e0-81e3ffe5e7eb`;
   - terminal `succeeded`;
   - 30/30 assessments and 60 evidence rows;
   - linked succeeded queue `8`.

3. **18 August 2026 unattended production execution**
   - run ID `ccb2b535-a454-4988-ad03-1f7f14907428`;
   - terminal `succeeded`;
   - 30/30 assessments and 68 evidence rows;
   - linked succeeded queue `9`.

The queue also contained seven unattempted orphan records for 3–7 and 10–11 August 2026:

- IDs `1`–`7`;
- status `pending`;
- `attempt_count = 0`;
- `started_at = null`;
- `processed_at = null`;
- `gpt_run_id = null`.

Seven matching historical schedule-log rows record that the retired Supabase-owned scheduler triggered those queue requests.

No active `pg_cron` job referenced Market Assessment, so the retired backlog source was not still running.

## Implementation

Created and applied:

`supabase/migrations/20260819035000_resolve_legacy_market_backlog.sql`

The migration performs two narrowly bounded, non-destructive actions.

### 1. Finalise populated stale test lifecycle

For stale pre-12-August test runs that remained `running` but already had persisted assessments, it derives `tickers_completed` from the assessment table and applies the existing terminal-status rules.

The 1 August legacy run therefore became:

- status `succeeded`;
- requested/completed: 30/30;
- `completed_at = 2026-08-19 03:32:59.855999+00`;
- assessment rows: 30;
- evidence rows: 30.

The completion timestamp is the administrative reconciliation time, not a reconstructed claim about the original execution finish. The appended run note states that lifecycle was finalised from persisted rows and no assessment/evidence records were replayed, created, changed or deleted.

### 2. Close retired orphan backlog without replay

The seven pre-14-August queues that were unattempted, unlinked and still claimable were moved to the existing terminal `failed` queue status.

Each record now has:

- `status = 'failed'`;
- `attempt_count = 0`;
- `started_at = null`;
- `gpt_run_id = null`;
- `processed_at = 2026-08-19 03:32:59.855999+00`;
- an explicit error message stating it was superseded during OPS-007, deliberately closed without replay, and no GPT run was created.

The existing terminal status was used instead of inventing a new queue-state value. The precise error text distinguishes administrative supersession from an attempted analysis failure.

## Preserved records

No rows were deleted.

Post-change totals remain:

- Market runs: 3;
- Market assessments: 90;
- Market evidence rows: 158;
- queue rows: 9;
- schedule-log rows: 7.

All seven schedule-log rows remain intact with their original `triggered` status and notes, preserving the historical fact that the retired scheduler created the requests.

The already-correct 14 August test run and 18 August production run remained terminal `succeeded` with their original counts, timestamps and notes.

## Verification

Live post-change verification found:

- stale `running` test runs: 0;
- claimable legacy queues before 14 August: 0;
- queue status distribution: 7 `failed`, 2 `succeeded`;
- duplicate assessment groups by run/instrument: 0;
- duplicate evidence groups by assessment/source URL/evidence text: 0;
- active Market Assessment `pg_cron` jobs: 0;
- migration history contains `resolve_legacy_market_backlog`.

The migration's selectors now match zero rows, so rerunning its data logic would make no further changes.

## Builder conclusion

The legacy test lifecycle is truthfully finalised from its persisted rows, the seven obsolete backlog requests are terminally and explicitly superseded, and none was replayed as current work. All historical assessments, evidence and schedule logs remain available for audit.

`OPS-007` is ready for independent review. The Builder has not marked it `DONE` and has not promoted `SEC-001`.
