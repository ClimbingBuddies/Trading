# Discover Boulders Markets — Operational Runbook

**Applies to:** production Trading platform  
**Repository:** `ClimbingBuddies/Trading`  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Production:** `https://discoverbouldersmarkets.vercel.app`  
**Last reviewed:** 25 August 2026

## Purpose

This runbook is the first-response procedure for operational failures in the Trading platform. It covers four required failure classes:

1. market-data ingestion failure;
2. assessment workflow failure;
3. stale-data conditions;
4. Vercel deployment or production-route failure.

Use primary evidence before changing anything. Supabase is authoritative for persisted data and workflow state, GitHub is authoritative for source and methodology, and Vercel is authoritative for deployment state and production runtime health.

Never repair an incident by inventing market data, ratings, evidence, successful run states or deployment results. Preserve the analytical independence boundaries between Market Assessment, Opportunity Assessment and the Technical Engine.

## General incident sequence

For any incident:

1. identify the affected workflow and operating date/timezone;
2. confirm whether the problem is data, orchestration, application code, deployment, access/security or an external dependency;
3. capture the current terminal/non-terminal state before changing it;
4. use the workflow's documented idempotent retry path where one exists;
5. do not create parallel replacement runs when a resumable run already exists;
6. verify the recovered result from primary evidence;
7. record the incident, action taken and remaining risk in the relevant operational/audit record.

If evidence conflicts, stop and reconcile the sources before writing production state.

---

# 1. Market-data failure

## Scope

The operational current-market path is:

```text
Supabase pg_cron
  -> full-twelve-data-load
  -> Twelve Data quote API
  -> market_observations (interval_code = 'quote')
  -> sync_runs
  -> latest_market_observations / latest_market_status
  -> Admin and Markets dashboards
```

Historical Tiingo `1day` observations are analytical/backtest data. They must not be used to prove current quote freshness.

## First checks

1. Read the most recent `sync_runs` rows for the Twelve Data loader.
2. Check the active cron job `trading-market-data-every-15-minutes` and confirm it is active.
3. Check the latest `quote` observation time and `loaded_at` time for affected active instruments.
4. Check instrument eligibility before calling data stale:
   - forex and crypto are normally continuously eligible;
   - US equities and ETFs are only eligible during the configured New York market session and supported trading days.
5. Review the latest loader error message and inserted/failed counts.

## Interpret `sync_runs`

- `succeeded`: no symbol failures for the invocation.
- `partial`: at least one row inserted and at least one symbol failed.
- `failed`: failures occurred and no rows were inserted.

A successful cron invocation is not sufficient proof that every instrument is current. Verify the affected observations as well.

## Recovery

### One or a few symbols failed

- Confirm the provider mapping in `provider_instruments` is active and unambiguous.
- Confirm the instrument was eligible for loading at that time.
- Use the existing loader on its normal schedule or a controlled diagnostic load when appropriate.
- Verify a new `quote` row and the resulting freshness state after retry.

### Loader-wide failure

- Check whether the failure is Supabase/Edge Function connectivity, Twelve Data provider failure, authentication/secret configuration or application logic.
- Do not rotate or expose service-role/provider credentials in frontend code or chat records.
- If the dependency is transient, allow the next scheduled invocation or perform one controlled trusted retry.
- If the code/configuration is faulty, fix through the normal GitHub/deployment path and verify a real post-fix load.

### Historical backfill failure

Use `backfill-market-history` for Tiingo historical data. Confirm active instrument/provider mapping, requested coverage and `sync_runs` metadata. Repeating the same range should upsert by the canonical observation key rather than create duplicate dates.

## Exit criteria

Close the incident only when:

- the loader has a valid terminal run state;
- affected eligible instruments have current or deliberately accepted session-aware status;
- no historical `1day` row has been mistaken for the latest live quote;
- downstream workflows that require current market data can safely resume.

---

# 2. Assessment workflow failure

The platform has independent assessment branches. Recover each branch without contaminating another.

## 2A. Independent AI Market Assessment

Canonical specification: `automation/daily-market-assessment.md`.

### Normal lifecycle

```text
freshness check
  -> prepare_chatgpt_market_assessment()
  -> existing/new daily queue + gpt_market_run
  -> missing instruments only
  -> gpt_market_assessments + gpt_market_evidence
  -> finalize_chatgpt_market_assessment()
  -> succeeded | partial | failed
```

### Failure procedure

1. Determine the current `America/New_York` assessment date.
2. Check market-data freshness before preparing/resuming work.
3. Call the existing prepare function and use the returned `queue_id` and `run_id`.
4. If `already_complete = true`, do not create another run.
5. Compare active instruments with rows already present for that `run_id`.
6. Resume only missing instruments.
7. Finalise from the rows actually persisted.
8. Verify `tickers_completed`, run status and queue status from Supabase.

Do not replay historical pending queue rows automatically. Do not use Technical Engine, Market Convergence or Opportunity Assessment conclusions as Market AI inputs.

### Terminal interpretation

- all requested instruments persisted -> `succeeded`;
- some persisted -> `partial`;
- none persisted -> `failed`.

A retry must reuse the current-date run rather than create duplicate `(run_id, instrument_id)` records.

## 2B. Opportunity Assessment

Canonical specification: `automation/daily-opportunity-assessment.md`.

The Opportunity workflow is long-term research and is independent of short-term Market Assessment, Technical Engine scores and market momentum.

### Failure procedure

1. Determine the current `Australia/Perth` assessment date.
2. Create a distinct `opportunity_assessment_runs` execution record before research/writes; if this cannot be created, stop.
3. Read all current active/watch themes from Supabase.
4. Resume/update today's idempotent Structural, Technology Inflection and Opportunity records rather than creating duplicate daily rows.
5. Preserve the independence of Structural and Technology Inflection assessment until their defined convergence step.
6. Record terminal run status, themes requested/completed and any failure message.
7. Verify Research & Evidence / exposure updates only where the current specification requires them.

Short-term market-data staleness does not by itself invalidate the Opportunity workflow because short-term prices, Market ratings and Technical scores are prohibited Opportunity inputs.

## 2C. Technical Engine

Canonical operations document: `documentation/pipelines/technical-engine-operations.md`.

Primary schedule:

- 07:15 AWST full refresh;
- 07:45 AWST bounded retry watcher.

### Failure procedure

1. Check `technical_engine_runs`, not only `cron.job_run_details`.
2. A failed inner calculation rolls back data changes while the outer durable run row records `failed`.
3. Use `technical_engine.retry_latest_failed_v1()` for the scheduled bounded retry path.
4. Do not create parallel retries. Respect the three-attempt limit and existing parent/child lineage.
5. Verify indicator/score counts and methodology versions after recovery.

Client roles must not be granted orchestration access as part of incident repair.

## 2D. Market Convergence or other derived assessment

Do not fabricate a convergence result when either independent source branch is missing or outside its defined freshness contract. Repair the failed source branch first, then rerun the canonical convergence path using persisted lineage and its normal idempotency/retry rules.

---

# 3. Stale-data procedure

## Principle

“Old” is not always “stale”. Evaluate freshness in the context of interval, asset type, provider and market session.

For current dashboards and Market AI freshness checks, use the live `quote` path and the canonical `latest_market_status`/latest-observation semantics. Do not use Tiingo daily history to make current data appear fresher.

## Triage

1. Identify affected active instruments and asset types.
2. Check `latest_market_status`, latest `quote` observation and load time.
3. Check the current market/session eligibility.
4. Check recent Twelve Data `sync_runs` and loader errors.
5. Distinguish:
   - healthy/current;
   - due/aging;
   - genuinely stale while expected to be active;
   - market closed / not currently eligible;
   - no data yet.

## Downstream actions

### Market AI

If source data is clearly stale, loader health is bad, there was no relevant session, or Supabase is unavailable, stop the Market Assessment. Report the reason and do not manufacture a current rating.

### Technical Engine

The Technical Engine consumes persisted canonical daily history under its own methodology. Diagnose its required source history separately from live-quote freshness.

### Opportunity Assessment

Do not block or alter Opportunity conclusions merely because live quote data is stale. Opportunity must remain independent of short-term prices and Market/Technical conclusions.

### UI

The dashboard should display the truthful session/freshness state. Do not hide stale/no-data states by substituting fabricated prices or historical rows.

## Escalation condition

Escalate beyond a routine retry when:

- multiple eligible assets remain stale across repeated loader invocations;
- `sync_runs` repeatedly fail or remain non-terminal;
- provider authentication/configuration is invalid;
- cron/Edge Function execution is inactive or broken;
- source freshness cannot be determined reliably.

Record the external owner/clearance condition if a stable third-party or human dependency blocks recovery.

---

# 4. Deployment or production-route failure

## Source/deployment boundary

A GitHub commit, a Vercel deployment and production behaviour are separate evidence layers.

For any deployment incident identify:

- intended GitHub implementation commit;
- Vercel deployment ID;
- deployment state (`BUILDING`, `READY`, `ERROR`, `CANCELED`, etc.);
- commit SHA actually attached to the deployment;
- affected production routes;
- build/runtime error evidence.

## Build failure

1. Read the Vercel build logs for the failed deployment.
2. Identify the first material failure: dependency install, project guard, TypeScript, Next.js compile, static generation or other build step.
3. Fix the source problem in GitHub; do not mark an implementation complete while source/build checks fail.
4. Verify the next deployment reaches a terminal successful state before calling production current.

Do not repeatedly redeploy unchanged broken code as a substitute for fixing a deterministic build error.

## Deployment lag or queued build

If the committed implementation is complete and the only gap is that production has not caught up:

- record implementation commit, current production commit, deployment ID/status and the exact pending reason;
- do not rewrite working code merely to force a new deployment;
- in Builder/Auditor project work, a deployment-only gap can be independently verified without treating it as implementation failure.

## READY deployment but route failure

1. Confirm production alias points to the expected deployment.
2. Check representative affected route(s) for HTTP status and expected data-backed rendering.
3. Check deployment-scoped runtime errors/logs.
4. If only one route fails, inspect that route's server/client data path before changing unrelated application code.
5. If data routes fail, verify Supabase/environment configuration without exposing privileged secrets.

## Rollback

Rollback is appropriate only when the current production deployment is materially broken and a known-good prior deployment is safer than leaving the incident active.

Before rollback record:

- broken deployment ID/commit;
- known-good deployment ID/commit;
- reason rollback is safer;
- any database/schema compatibility concern.

Do not roll application code back across incompatible database migrations without verifying compatibility first.

After rollback, verify the production alias and representative routes. Then fix forward through GitHub and normal review.

---

# 5. Security and evidence rules during incidents

- Never expose Supabase service-role keys, provider API tokens or other privileged secrets in frontend code, logs or incident notes.
- Do not temporarily grant browser roles orchestration/write access to work around a backend incident.
- Preserve RLS and owner boundaries while diagnosing private strategy/watchlist evidence.
- Keep Market AI, Opportunity and Technical Engine analytical inputs independent during repair.
- Do not rewrite accepted historical assessment/backtest evidence merely to make a current incident look healthy.
- Prefer append-only/durable incident and run telemetry over silent state correction.

---

# 6. Evidence checklist for declaring recovery

Before reporting an incident recovered, capture the evidence applicable to that layer:

| Layer | Recovery evidence |
|---|---|
| Market data | terminal `sync_runs` state, eligible current quote rows, session-aware freshness |
| Market AI | reused current-date run, expected assessment/evidence count, terminal run + queue |
| Opportunity | execution run record, required current-date theme/signal/assessment updates, terminal telemetry |
| Technical Engine | terminal `technical_engine_runs`, valid retry lineage, expected indicator/score counts |
| Convergence | eligible independent inputs, persisted lineage, terminal idempotent output |
| Deployment | intended commit, deployment ID, terminal state, build/runtime evidence, route checks |
| Security | no widened client privileges or secret exposure introduced during recovery |

If a required evidence layer is unavailable, report that explicitly rather than inferring success.

## Related canonical documentation

- `documentation/pipelines/market-data-pipeline.md`
- `documentation/pipelines/market-assessment-pipeline.md`
- `automation/daily-market-assessment.md`
- `automation/daily-opportunity-assessment.md`
- `documentation/pipelines/technical-engine-operations.md`
- `documentation/pipelines/market-convergence-pipeline.md`
- `documentation/security-and-operational-notes.md`
- `documentation/project-plan.md`
