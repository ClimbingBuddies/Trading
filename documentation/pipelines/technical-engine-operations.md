# Technical Engine Scheduling and Monitoring

This document defines the operational ownership, schedule, lifecycle, retry and Admin visibility for the independent Technical Engine introduced by TECH-004.

## Operational boundary

The scheduled unit runs two deterministic stages in order:

1. technical_engine.refresh_v1(null) refreshes technical-engine-v1 daily and weekly indicators from persisted Tiingo 1day observations.
2. technical_engine.refresh_scores_v1(null) refreshes technical-score-v1 market scores from those indicators and persisted market observations.

The job does not fetch external market data. It consumes the latest canonical observations already persisted in Supabase. It does not read GPT Market Assessment, Opportunity Assessment or convergence outputs.

The 16 November ASX extension adds a third stage, `technical_engine.refresh_asx_v1(null)`, under the same lock and transaction. It admits a verified Yahoo ASX/AUD window, computes `technical-engine-asx-v1` indicators and `technical-score-asx-v1` scores from one immutable source/cutoff snapshot, and records separate aggregate counts and blockers in `metadata.asx`. Existing run count/version columns continue to describe Tiingo. See the [ASX contract](../specifications/asx-technical-source-contract.md) and dated release evidence for installed state.

Composite success requires all ASX source admissions to pass. Source blockers produce `failed/asx_source_blocked` with sanitized reason counts while retaining completed calculations; raised errors roll back both branches in the existing exception block. Scheduled deduplication requires the `tiingo-v1+asx-v1` pipeline contract, so an earlier Tiingo-only success cannot suppress ASX adoption. Existing retry limits and both cron expressions remain unchanged. Partial scores caused by unavailable indicator history are successful calculations, distinct from a blocked source.

The private input-snapshot table preserves exact cutoff envelopes for replay; source hashes alone do not identify a weekly calculation cutoff. Trusted consumers must check `asx_score_source_matches_v1(score_id)` before using ASX results, and separately enforce market/session freshness. No ASX convergence/shared-outcome permission is implied. The rolling verified window intentionally excludes older adjustment generations and cannot supply weekly SMA-200.

## Frequency and timezone

The history worker also calls the existing service-only `public.refresh_market_trends_for_instrument(uuid)` after a successful Yahoo audit. The hook routes ASX to the same snapshot-based refresh; other venues retain Tiingo behavior. ASX refresh errors or blocked source admission leave a durable warning on the successful ingestion job, rather than repeating an already persisted provider fetch. The HTTP receipt separately reports `technical_refresh`. The next existing Technical run provides recovery; a concurrent refresh can hold the shared advisory lock, so ingestion success alone does not certify fresh derived results. Check source-match before downstream use. Hook recovery uses `scripts/rollback-asx-history-technical-refresh.sql`; worker recovery redeploys the exact pre-change source from PR #55 with JWT verification retained.

Supabase pg_cron is configured in GMT/UTC. Australia/Perth does not observe daylight saving time.

| Job | Cron expression | UTC | Australia/Perth | Purpose |
|---|---:|---:|---:|---|
| trading-technical-engine-daily-0715-awst | 0 0 * * * | 00:00 daily | 08:00 same calendar day | Primary full-universe indicator and score refresh |
| trading-technical-engine-retry-0745-awst | 5 0 * * * | 00:05 daily | 08:05 same calendar day | Retry the latest eligible failed attempt for that Perth operating date |

The 17 November queue-alignment migration preserves these historical cron names/IDs and commands while moving their execution later. ASX history is queued after Sydney midnight; non-ASX active jobs receive priority at the existing two-minute dispatch pace. These times do not certify completed ingestion: the controller must still inspect actual source/session readiness and preserve frozen cutoffs. Check the release receipt for installed state and the operational runbook for paired recovery.

The run log stores scheduled_for as the logical Australia/Perth operating date. A second successful scheduled attempt for the same operating date is recorded as skipped rather than recalculated.

## Ownership and access

- Both cron jobs are owned by the Supabase database role postgres.
- technical_engine.run_v1(text, uuid) and technical_engine.retry_latest_failed_v1() are executable by service_role.
- PUBLIC, anon and authenticated cannot execute either function.
- technical_engine remains a private schema.
- public.technical_engine_runs is read-only operational telemetry for anon and authenticated, matching the existing public Admin/load-monitoring model.
- Client roles have no insert, update or delete privileges on the run log.

The frontend therefore requires only the Supabase publishable key and cannot start, alter or retry Technical Engine work.

## Run lifecycle

Each invocation writes one technical_engine_runs record with:

- trigger source: scheduled, manual or retry;
- Perth operating date;
- immediate retry parent and attempt number;
- start and finish timestamps;
- terminal succeeded, failed or skipped status;
- indicator and score counts;
- calculation and scoring methodology versions;
- bounded error code/message and operational metadata.

The orchestration function acquires a transaction-scoped advisory lock. A concurrent invocation is terminally recorded as skipped with already_running.

Indicator and score work runs in an inner exception block. If either stage fails, its data changes are rolled back and the outer run record is updated to failed. The function deliberately returns the run ID instead of re-raising, so the durable application failure record commits. Consequently:

- cron.job_run_details confirms that the database invocation ran;
- technical_engine_runs.status is authoritative for the Technical Engine pipeline outcome.

## Retry policy

The 08:05 AWST retry job calls retry_latest_failed_v1(). It returns without creating a row when no eligible failed attempt exists.

A retry:

- must reference an existing failed run;
- keeps the original Perth operating date;
- increments attempt_number;
- is limited to three total attempts;
- is rejected if the parent already has a running or successful child;
- reruns the same idempotent indicator and score refresh functions.

A trusted operator can run an additional bounded retry with:

~~~sql
select technical_engine.run_v1('retry', '<failed-run-uuid>'::uuid);
~~~

A trusted manual full run is:

~~~sql
select technical_engine.run_v1('manual', null);
~~~

## Admin visibility

/admin reads the latest 12 rows from technical_engine_runs and displays:

- latest status, trigger, attempt and completion time;
- indicator and score row counts;
- complete/partial score counts;
- calculation and methodology versions;
- duration and error message;
- the primary and retry schedule.

No privileged frontend credential or execution control is exposed.

## Builder verification — 21 August 2026

The implementation was verified against live Supabase primary evidence:

- both cron jobs are active and owned by postgres;
- a real service_role run completed for 71 instruments;
- it upserted 1,136 indicators and 71 scores;
- the result contained 1,121 complete and 15 incomplete indicator rows, plus 61 complete and 10 partial scores;
- an immediate second full run retained 1,136 indicators and 71 scores, preserved deterministic payload digests and produced zero duplicate identities;
- a controlled failed parent produced a successful attempt-2 retry through retry_latest_failed_v1(); the temporary verification rows were then removed;
- anon and authenticated can read telemetry but cannot write it or execute the engine;
- service_role can execute the orchestrator.
