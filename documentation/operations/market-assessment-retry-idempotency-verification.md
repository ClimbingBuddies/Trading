# OPS-006 — Market retry/idempotency verification

**Builder verification date:** 19 August 2026  
**Project-plan item:** `OPS-006 — Verify Market retry/idempotency`  
**Decision:** Ready for independent audit  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Canonical specification:** `automation/daily-market-assessment.md`  
**Target completed run:** `ccb2b535-a454-4988-ad03-1f7f14907428`  
**Target queue:** `9`  
**New York assessment date:** `2026-08-18`

## Scope

This Builder pass tested the canonical same-date retry and resume contract against the first completed unattended Market Assessment run. It did not generate new assessments, replay historical backlog, change analytical conclusions, or advance another project-plan item.

## Defect found

The first direct retry call to:

```sql
select *
from public.prepare_chatgpt_market_assessment(
  date '2026-08-18',
  'chatgpt-scheduled-task',
  'independent-market-ai-v1'
);
```

failed with PostgreSQL error `42702`: the unqualified `run_id` reference in the already-complete branch was ambiguous with the function's `RETURNS TABLE` output parameter.

This meant the documented completed-date idempotent early return could not execute.

## Implementation

Created and applied:

`supabase/migrations/20260819024000_fix_market_assessment_prepare_retry.sql`

The migration replaces `public.prepare_chatgpt_market_assessment` with the same public signature and workflow contract while explicitly qualifying queue/run table columns in both the already-complete lookup and partial-resume update paths.

Security posture is preserved:

- `SECURITY DEFINER`;
- `SET search_path = public`;
- execution revoked from `PUBLIC`, `anon`, and `authenticated`;
- execution granted to `service_role`.

No assessment, evidence, queue, or run schema was changed.

## Pre-retry snapshot

Before the successful retry test:

- queue rows for the run: 1;
- run rows: 1;
- assessment rows: 30;
- distinct assessed instruments: 30;
- evidence rows: 68;
- duplicate assessment groups: 0;
- duplicate evidence groups: 0;
- run status: `succeeded`;
- queue status: `succeeded`;
- requested/completed: 30/30;
- queue attempt count: 1;
- run `completed_at`, queue `processed_at`, and queue `updated_at`: `2026-08-19 01:05:18.958096+00`.

## Completed-date retry verification

After the migration, the exact same-date retry returned:

- queue ID: `9`;
- run ID: `ccb2b535-a454-4988-ad03-1f7f14907428`;
- effective date: `2026-08-18`;
- queue status: `succeeded`;
- run status: `succeeded`;
- requested/completed: 30/30;
- `already_complete = true`.

Post-retry verification confirmed:

- no second queue or run was created;
- assessments remained 30 across 30 distinct instruments;
- evidence remained 68;
- duplicate assessment groups remained 0;
- duplicate evidence groups remained 0;
- attempt count remained 1;
- lifecycle timestamps and notes were unchanged.

This verifies that a completed-date retry stops before assessment/evidence replay.

## Resume-path verification

The partial/resume branch was tested in a deliberately isolated PL/pgSQL subtransaction:

1. the existing run/queue statuses were temporarily represented as `partial`;
2. the same-date prepare function was called;
3. the returned identifiers, lifecycle state, row counts, and duplicate groups were captured;
4. a controlled exception rolled the entire probe back;
5. the restored persistent state was compared to the pre-probe snapshot.

During the isolated resume:

- the same queue ID `9` and run ID `ccb2b535-a454-4988-ad03-1f7f14907428` were reused;
- `already_complete = false`;
- queue status became `processing`;
- run status became `running`;
- attempt count became 2 within the probe;
- assessment rows remained 30;
- distinct instruments remained 30;
- evidence rows remained 68;
- duplicate assessment groups remained 0;
- duplicate evidence groups remained 0.

After rollback, the production state exactly matched the pre-probe snapshot: `succeeded` statuses, attempt count 1, original lifecycle timestamps, 30 assessments, and 68 evidence rows. The probe left no persistent test records or changed lifecycle state.

## Builder verification result

The live prepare function now supports both required idempotent paths:

- an already-complete retry returns the existing terminal run without mutation;
- a resumable non-terminal invocation reuses the existing run/queue and does not create assessment or evidence duplicates.

The database uniqueness constraint on `gpt_market_assessments(run_id, instrument_id)` remains an additional assessment-level safeguard. Evidence deduplication remains the caller's responsibility under the canonical specification; both the completed retry and isolated resume probe preserved zero duplicate evidence groups.

`OPS-006` is ready for independent audit. The Builder has not marked it `DONE` and has not promoted `OPS-007`.
