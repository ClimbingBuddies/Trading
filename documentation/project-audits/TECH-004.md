# TECH-004 Audit

## Review — 22 August 2026, 08:56 AWST

- **Task:** TECH-004 — Add scheduler and monitoring
- **Starting status:** IN REVIEW
- **Decision:** **PASS**
- **Final status:** DONE
- **Next task:** TECH-005 — Verify Technical Engine independence

## Definition of Done

| Check | Result | Independent evidence |
|---|---|---|
| Scheduling frequency is explicit and active | **VERIFIED** | Live `pg_cron` contains active primary job `trading-technical-engine-daily-0715-awst` at `15 23 * * *` UTC (07:15 AWST) and active retry watcher `trading-technical-engine-retry-0745-awst` at `45 23 * * *` UTC (07:45 AWST). |
| Scheduling and execution ownership are explicit | **VERIFIED** | Both cron jobs are owned by `postgres`. The live orchestration functions are owned by `postgres`, use a fixed `pg_catalog` search path, and grant execution only to `postgres` and `service_role`. |
| Errors are recorded and lifecycle reaches a terminal state | **VERIFIED** | The live `technical_engine_runs` contract records status, timestamps, SQLSTATE and error text. In an Auditor-owned rollback-only fault injection, revoking helper execution produced a terminal `failed` run with error code `42501` and `permission denied for function refresh_v1`; the transaction was rolled back after verification. |
| Retry behavior is explicit and bounded | **VERIFIED** | `technical_engine.retry_latest_failed_v1()` selects only the latest eligible failed run for the current Perth operating date, refuses active/successful descendants, and caps attempts at three. The 07:45 AWST watcher completed successfully and correctly found no retry need after the successful primary run. |
| Retries are idempotent | **VERIFIED** | A rollback-only failed-parent fixture produced a successful attempt-2 child with the correct `retry_of_run_id`. Indicator and score totals remained 1,136 and 71; dataset digests were unchanged; duplicate identities remained zero. Test fixtures were rolled back and cleanup queries returned zero fixtures. |
| Admin visibility is operational | **VERIFIED** | The production `/admin` route returned HTTP 200 and displayed the fresh scheduled run, terminal status, source/attempt, 1,136 indicator upserts, 71 score upserts, 61 complete/10 partial scores, methodology versions, duration, schedule and retry guidance. Vercel reported no `/admin` runtime errors in the preceding 24 hours. |

## Project-wide Definition of Operational

| Requirement | Result | Independent evidence |
|---|---|---|
| Schema and implementation exist | **VERIFIED** | GitHub migration `20260821095000_add_technical_engine_scheduler_monitoring.sql` matches the live run table, orchestration functions, RLS policy and cron jobs. |
| Trigger ownership is explicit | **VERIFIED** | Live cron owner, function owner and service-only execution grants were inspected directly. |
| Source data is validated | **VERIFIED** | The scheduled run consumed the canonical Tiingo observation path through the previously audited indicator/scoring engines and completed across all 71 instruments. |
| Real results are persisted | **VERIFIED** | The unattended 22-Aug-2026 Perth run persisted 1,136 `technical-engine-v1` indicator results and 71 `technical-score-v1` score results. |
| Lifecycle reaches a terminal state | **VERIFIED** | The fresh run reached `succeeded` with `finished_at`; the fault probe reached `failed` with `finished_at`. |
| Errors are durable | **VERIFIED** | Error SQLSTATE and message were independently observed in the run record during the rollback-only fault probe. |
| Retries are idempotent | **VERIFIED** | Retry child lineage, stable counts, stable dataset digests and zero duplicates were independently verified. |
| Access policies are deliberate | **VERIFIED** | `anon` and `authenticated` can read run telemetry but cannot insert, update or delete it and cannot execute orchestration; `service_role` can execute orchestration. |
| Frontend needs no privileged secret | **VERIFIED** | Admin telemetry is read through the publishable Supabase client; no service-role credential is required by the frontend. |
| End-to-end run is verified | **VERIFIED** | `pg_cron` started the primary job at 07:15 AWST; the run succeeded in about 22 seconds and appeared on the live production Admin page. |
| Actual flow is documented | **VERIFIED** | `documentation/pipelines/technical-engine-operations.md`, the documentation index and Supabase data-model documentation describe the live schedule, retry, lifecycle, access and monitoring flow. |

## Primary evidence

### GitHub

- `automation/project-plan-auditor.md` — blob `50e4ca1d2b7f57505e98418322e6d831b062dfd0`
- `documentation/project-plan.md` — starting blob `a9c15e1f14fcd150dca6d3416668cf9758129f27`
- `supabase/migrations/20260821095000_add_technical_engine_scheduler_monitoring.sql` — blob `6b2d6409a182a2450c4b5e18e3c349eb1215b526`
- `lib/technical-engine-runs.ts` — blob `18f939636bacb85275d74678defd15c32d42799d`
- `app/admin/page.tsx` — blob `23e25a82b8e51d1388e07349af017a3596f28961`
- `documentation/pipelines/technical-engine-operations.md` — blob `9f5d43191ad58f5b67d87f5bb38907d492e8b4fb`
- `documentation/README.md` — blob `9b59440dd3d61b2849639d060933d86f3940c818`
- `documentation/supabase-data-model.md` — blob `2ad4391027a58b8942ffc989c96078656303c9ae`

### Supabase

- Project: `glvbqcplgjdfgjyknzsa`
- Primary cron execution: run ID 2744, started `2026-08-21 23:15:00 UTC`, `succeeded`
- Retry-watcher execution: run ID 2747, started `2026-08-21 23:45:00 UTC`, `succeeded`
- Persisted scheduled run: `17c3a1b6-3139-4f03-abf9-5732bf70475b`
- Scope: 71 instruments, 1,136 indicator rows, 71 score rows
- Indicator identity duplicates: 0
- Score identity duplicates: 0
- Relevant Supabase security-advisor findings: none

### Vercel production

- Project: `boulders-market`
- Deployment: `dpl_AybDfZZoRVnbYkcbifFDz3ryQVSr` — READY
- Git commit: `4304c9b91a8119b8f4c0d95654333c251792ee37`
- Production route: `https://discoverbouldersmarkets.vercel.app/admin` — HTTP 200
- Production `/admin` runtime errors in the preceding 24 hours: none

## Audit conclusion

TECH-004 satisfies its item-specific Definition of Done and every applicable project-wide Definition of Operational check. The scheduler is active under explicit ownership, the latest unattended run completed successfully, failures are durably represented, retries are bounded and idempotent, access is deliberate, and current telemetry is visible in production.

**Decision: PASS.**
