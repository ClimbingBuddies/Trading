# Discover Boulders Markets — Operational Runbook

## Development ownership and recovery

Before changing source, schema, schedules or deployments, follow [development coordination](development-coordination.md). Check current lock ownership and the exact environment; inspect pending changes and recovery compatibility. Source publication, approved integration, database migration and production deployment are separate checkpoints. Discovery found divergent `main` and deployed-source histories; do not assume `main` is a production rollback point. Existing runtime jobs retain their existing authority; this protocol does not pause or change them.

## Personal prediction workflow

The additive migration source is `scripts/prediction-ledger-v1.sql`, applied under the migration name `personal_prediction_ledger_v1`. The standard CLI could not initialise its local cache in the restricted desktop environment, so this change uses the Supabase migration connector. Do not apply the SQL twice.

The `personal-prediction-ledger-v1` cron job runs every 15 minutes. Its private publisher records fresh independent AI ratings for equity/ETF instruments in explicitly enrolled owners' watchlists. Its evaluator then appends results. The browser enrolment RPC derives the owner from the existing authenticated session and accepts no arbitrary owner ID. Enrolment is explicit; other accounts are not enabled by deployment.

Records are write-once. Retries use `(owner, assessment, horizon)` for plans and `(prediction, status)` for evaluation states. Never repair an outcome by changing its publication clock, frozen entry or original price. New AI assessments produce new plans. There is no historical backfill. New observations may resolve a prior incomplete state, but a recorded completed result is not recalculated.

For empty predictions, check enrolment, watchlist addition dates, new assessment creation/completion after enrolment, a source cutoff within 24 hours and the cron job run log. For incomplete results, check Tiingo mapping, daily-price freshness, duplicates, session gaps and adjusted/raw price consistency. Entry evidence must have been loaded before the seven-day entry deadline. The daily date is a session label, so entry is the first complete date strictly after the UTC publication date. Exit is 5/20 subsequent observed sessions; missing benchmark sessions must not extend it silently. A missing price is not a zero return or proof that a trade did not enter.

Cost assumptions are 10 basis points per side. Returns are in the instrument currency; QQQ comparisons require matching dates/currency and valid evidence. This is individual-pick measurement, not a capital-constrained portfolio, optimal AI timing forecast, or proof of outperforming a broad-market index. The UI explains these limits under its methodology disclosure.

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
2. Check job 1, `trading-market-data-every-15-minutes`, is active with schedule `0-14/2 3,7,11,15,19,23 * * *`. Its legacy name is retained; the schedule defines four-hour cycles with internal two-minute batches.
3. Check the latest `quote` observation time and `loaded_at` time for affected active instruments.
4. Check instrument eligibility before calling data stale:
   - forex and crypto are normally continuously eligible;
   - US equities and ETFs are only eligible during the configured New York market session and supported trading days.
5. Review the latest loader error message and inserted/failed counts.

## Interpret `sync_runs`

- `succeeded`: no symbol failures for the invocation.
- `partial`: at least one row inserted and at least one symbol failed.
- `failed`: the invocation failed. An interruption recovery has `completion_counts_verified=false`; recorded counters cannot prove that no prices were saved.

A successful cron invocation is not sufficient proof that every instrument is current. Verify the affected observations as well.

Cycle-aware receipts include `cycle_started_at` and `selected_instrument_ids`. Reconcile selected, inserted, failed and unfinished instruments across the whole cycle. Capacity is at most 64 eligible symbols; overflow blocks explicitly and delays can reduce completed coverage. The service-only claim RPC serializes selection/initial receipts. The [14 November interruption recovery](market-quotes-interruption-recovery.md) defines strict validated expiry for version 2/3 quote receipts; recent, malformed and unknown receipts remain blocking. Confirm the installed revision in the evidence log before relying on this behavior. Terminal batches impose a 60-second cooldown. Current operational freshness allows 255 minutes; due extends through 285 minutes, then stale while active. Analytical freshness/cutoffs and daily history remain separate. See the claim SQL, `scripts/market-quotes-four-hour.sql` and its paired rollback; code recovery alone does not restore the prior schedule or thresholds.

## Recovery

For quote-worker replacement or rollback, pause job 1 with `cron.alter_job`, account for its queued HTTP requests and allow at least eight minutes from the last possible old invocation start before switching workers/resuming. [Supabase's hosted wall-clock limits](https://supabase.com/docs/guides/functions/limits) are at most 400 seconds. Keep original observations and receipts. Two exact pre-cutover unfinished legacy receipts from 2 and 7 November are excluded by the new claim gate because their workers cannot still be running; their unknown outcomes remain unchanged. All other unfinished receipts must either pass the reviewed interruption recovery or remain blocking for investigation. The release/rollback SQL requires paused dispatch and restores activity only with the matching schedule.

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

Use [`scripts/technical-coverage-review.sql`](../scripts/technical-coverage-review.sql) through an authorized operator connection for a read-only inventory. It includes every instrument, chooses the latest compatible score by score date/calculation time/ID, and groups active and inactive records separately. ASX expects the separate `technical-score-asx-v1`/`technical-engine-asx-v1` pair; other venues retain the original Tiingo pair. It includes missing scores and daily provider presence without exposing symbols or account data. Provider presence means stored rows exist, not that prices are valid, complete, current or licensed for additional ingestion. `complete` is the persisted score's input-availability status, not an overall workflow health verdict. Compare the returned date ranges with the applicable market sessions separately.

For partial scores, inspect the persisted availability weights and source indicator reasons before repair. A new listing cannot supply 200 completed weeks; do not splice predecessor histories to manufacture them. Forex historical volume may be unavailable; zero or bid/ask sizes are not substitutes. The [ASX source contract](specifications/asx-technical-source-contract.md) admits only verified Yahoo windows with explicit source/cutoff lineage; older adjustment generations stay unused, so weekly SMA-200 remains unavailable. Inactive history support must not be promoted into the active universe to improve a count. Verify mapping, listing identity, provider entitlement and evidenced gaps before any new backfill. Local diagnostic verification: `node scripts/test-technical-coverage-review.mjs` with `PGLITE_MODULE` pointing to an installed PGlite module if required.

ASX release recovery: under the development lock, verify exact Trading project, idle Technical run state and the installed `run_v1` definition against the accepted release before executing [`rollback-asx-technical-scheduler.sql`](../scripts/rollback-asx-technical-scheduler.sql). That restores the prior runner without deleting snapshots, indicators, scores or audits. Restore no observation data and do not replay the whole migration history. New private functions/tables may remain unused. Compare cron schedules and original Tiingo function digests before/after; reverting code is not a data rollback. A recovery operator must also keep the ASX methodology excluded from downstream admission until it is reviewed again.

The ASX post-ingestion path is separate: restore its prior service-only hook with [`rollback-asx-history-technical-refresh.sql`](../scripts/rollback-asx-history-technical-refresh.sql) and redeploy complete worker-v8 source from `2228bc1c48c63b66cb8d7c9c131da4169517abed` with JWT verification retained. Check idle history/Technical work and exact installed definitions first. Restoring only the scheduled runner leaves the new worker hook active. A successful provider job with an ASX Technical warning means ingestion persisted but derived refresh needs diagnosis/recovery; do not repeat the provider fetch solely to clear that warning. Verify current score source matches and preserve prior snapshots.

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

### History demand dispatch and correction recovery

#### Controller coverage recovery (17 November 2026)

##### Yahoo placeholder recovery (18 November 2026)

The 18 November scheduled controller adopted v1.12 at `2db26e9` and completed Opportunity, partially completed External Opinion, then blocked Market on ASX session conflict plus Tiingo saved-output rights. Publication lacked fresh assessment and evaluation retained the Tiingo restriction. Training-setting uncertainty was no longer the blocker. This is source-adoption evidence, not business acceptance.

Yahoo's affected response contained a close-null placeholder and a complete same-session bar with matching other values. Normalizer v2 admits only an independently valid whole complete bar whose duplicate placeholders lack both close fields and exactly match open/high/low/volume. Native disagreements remain quarantined. All source duplicates and the selected timestamp are audited. Follow the [source contract](specifications/asx-technical-source-contract.md#complete-bars-alongside-close-null-placeholders).

Legacy quarantined inputs require a bounded fresh one-year audit, including all previously rejected dates in that horizon. The existing worker performs this on the first eligible daily v2 job. Transport/write failure retains pending state for existing bounded retries. A completed provider response omitting a required date is unresolved, writes no observations, and suppresses repeated full fetches pending reviewed recovery. Ordinary overlap fetching resumes after clean completion. Inspect the latest matching Yahoo sync audit independently of the history job: a failed attempt may have no job-linked sync ID. Preflight exposes the link flag, audit ID/status, rejected count and whitelisted revalidation state without raw payloads.

Release recovery: redeploy the prior reviewed worker bundle from `2db26e9` with JWT verification preserved. This is code rollback only: do not delete or relabel new observations, audit history or Technical snapshots. Preserve existing four-hour quotes, daily enqueues and two-minute demand dispatch. No database migration or frontend deployment is required. Verify one actual v2 audit plus its source/Technical receipt before expanding a manual recovery; do not retry mapping/validation holds or race pending/running jobs. A successful worker or source snapshot still does not certify calendar completeness, measured ASX outcomes or a fresh independent assessment.

Controller v1.13 requires a per-instrument/provider/operation admission ledger. The old quote view classifies equities using US hours, so it cannot certify ASX sessions. Missing session evidence and Tiingo-dependent saved-output restrictions remain separate. Published Tiingo section 1.6 explicitly covers durable raw data and derived outputs for Starter/trial; section 1.7's conditional reference use does not waive it. Record applicable account/effective-date evidence privately and do not infer entitlement from successful API usage. No account upgrade, data deletion or provider substitution is authorized by this repair. Independently eligible non-Tiingo work must retain its own path.

Inspect the actual stage receipts and frozen run cutoff first. Reconcile the active research universe separately from the distinct watched/open shared-call scope. `scripts/daily-reviewer-preflight.sql` now reads shared scope only, prioritizes open calls then watched shares, and returns conditional routing plus price-count metadata. It never invokes personal candidates, returns raw prices/private notes, or certifies that a saved assessment is fresh/valid. Use the trusted shared candidate/input functions after research finalizes; a missing measurable benchmark does not itself prevent supported research-only publication.

Prepare direct-source receipts for research-only watched equities **before** `prepare_chatgpt_market_assessment` freezes a new cutoff. Link evidence to the exact verified receipt afterwards. If an old assessment lacks eligible pre-cutoff proof, preserve it; do not backdate a receipt, change its cutoff or create a duplicate same-date run. An assessed instrument outside watched/open scope does not repair recommendations coverage. Evaluate existing calls independently when their own release/provider/session gates permit it.

For provider blockers, record the affected operation and missing evidence: configured account plan/storage rights, AI-reference use and runtime data controls, or sharing/display scope. Do not infer rights from a token or public pricing page, conflate reference inference with training, or apply one provider's blocker to unrelated supported paths. The existing cleanup specification still requires plan verification before new persistent Tiingo ingestion. Current [Tiingo terms](https://www.tiingo.com/tos/) distinguish Starter/trial storage limits, eligible paid storage, conditional AI reference use and sharing. Account-specific and effective-date facts remain necessary. Preserve existing stored history; retention/remediation is a separate explicit owner decision. Record only a sanitized evidence reference, scope and verification date in shared project records, never credentials or billing details.

##### Operator-confirmed runtime setting (18 November 2026)

Evidence `runtime-no-training-20261118`: in the Trading recovery conversation, the designated operator answered "It is off" when asked whether ChatGPT's "Improve the model for everyone" is off for the account running Daily Trading Controller. Status: **OPERATOR_CONFIRMED**. No connector/API inspection of the setting was available; do not relabel this as automated verification. Scope is the existing hosted controller account, not every contributor, workspace, API project or future runtime.

Use this evidence for the no-training-setting component of AI-reference eligibility. Reconfirm after a runtime account/workspace/provider/setting change or contrary evidence; lack of an account-settings connector alone is not a reason to repeatedly ask the same question. [OpenAI documentation](https://learn.chatgpt.com/docs/browser) identifies Settings > Data controls as the account control surface. [Tiingo section 1.7](https://www.tiingo.com/tos/) distinguishes conditional reference analysis from model training; storage and saved-output restrictions remain separate under section 1.6.

The operator also completed a local credential-fingerprint comparison and reported a match to the configured ingestion credential. That establishes the account/key relationship, not persistence or sharing permission. Neither successful provider requests nor this runtime-setting confirmation approves retaining additional provider data or derived outputs. Those operation-specific rights remain unresolved for the intended workflow; report that precise remaining blocker rather than "training setting unknown". Existing data is preserved. No subscription, API key, scheduler, database permission or analytical result is changed by this record.

After publication, verify a genuine controller invocation records a source commit containing this evidence and reports the correct remaining gates. A source merge alone is not evidence of hosted adoption or end-to-end completion. An invocation already pinned to an earlier commit retains its source identity; do not change a frozen run cutoff or launch a duplicate run to force adoption.

The 17 November trace found 108 jobs queued at 06:30 Perth with one dispatch every two minutes; 49 inactive support jobs competed with 59 active instruments. Only three ASX jobs completed before the 08:10 research cutoff; the other 12 completed later. The queue completed around 10:08. A successful history job after the cutoff cannot repair that run's chronology.

The reviewed queue migration splits the same daily eligible universe: ASX at **22:15 Perth** (after Sydney midnight in both DST states), other venues at **06:30 Perth**. ASX still loads only prior-Sydney-date bars; no current-day price-finality rule is relaxed. Active open-call jobs precede active watched jobs, then other active jobs and inactive support. Initial backfills retain preference within each cohort. The existing one-job/two-minute demand dispatch and four-hour quote windows remain unchanged. Technical's existing cron IDs/names/commands move to **08:00 and 08:05 Perth**; their names retain historical 07:15/07:45 labels. These times are capacity planning, not a completion guarantee: retries, backlog and provider delays still require source/readiness checks before research or convergence. Monitor inactive backlog for starvation.

Both daily enqueue wrappers share an advisory lock and a database UTC cycle date. `daily_enqueue_cycles` in job metadata records when an earlier pending/running job is reused; original enqueue metadata, retry counts and due times remain intact. It is a deduplication marker, **not** proof that the target session was fetched. Repeated wrapper calls do not recreate a completed/failed cycle. Latest mapping/validation holds remain held. The generic `enqueue_job` API remains unchanged and does not acquire this wrapper lock; manual repair still needs its existing evidence/authorization gates.

Release only after exact live function/cron hashes, migration history, independent SQL tests/review and idle worker checks. The migration performs no provider request or manual analytical run. Baseline function definitions are preserved in `scripts/history-queue-baseline.sql`; do not blindly replay that reference. Recovery must restore the old enqueue/claim definitions and Technical times together, remove the ASX cron and new helper functions, preserve all jobs/data and verify grants. To avoid a second same-cycle ASX enqueue, perform the full rollback only before the new ASX UTC enqueue time and when no ASX job already records today's UTC cycle; otherwise keep the split enqueue definitions until a safe cycle boundary. Never delete jobs or research to make recovery appear clean. Deployment and genuine scheduled adoption are separate evidence.

For ASX downstream diagnosis, run `scripts/asx-admission-review.sql` unchanged through the trusted operator connection. It returns aggregate Technical/AI quality and age screens plus calendar/configuration inventory, never executable SQL or an admission certificate. The controller readiness code `ASX_TECHNICAL_VERSION_UNSUPPORTED` identifies a valid stored ASX-method score that the existing v1 convergence cannot consume; do not relabel it, backfill Tiingo unnecessarily or bypass the blocker. Follow the [ASX downstream review](specifications/asx-downstream-admission-review.md). Independently inspect controller attempts when fresh AI is absent: a Technical success does not establish research, publication, evaluator or provider-entitlement acceptance.

The source release in `scripts/market-history-demand-dispatch.sql` wraps only
the existing history cron HTTP call with the installed claim's pending/due
predicate. Apply only after exact command-hash/cadence checks pass. The paired
`scripts/market-history-demand-dispatch-rollback.sql` restores only that exact
wrapper and rejects drift. No observations or queue history are deleted.

Before replacing the history worker, pause its existing cron under the project
lock, account for queued HTTP work and running jobs, and allow already dispatched
work to finish. Deploy all worker dependencies with JWT verification retained.
Restore the same cron's active state, then apply the reviewed dispatch wrapper.
Verify exact files/version, the cron command, unchanged other jobs, and an actual
scheduled receipt. Worker source rollback is the complete previous version,
including its dependencies; database command rollback is separate.

A `state_unconfirmed` response means a job receipt write was not acknowledged.
Do not report success or blindly reset the job. Read its durable status and
matching sync-run evidence before a bounded recovery. Unresolved Yahoo price/event
revisions remain failures. A pure unresolved gap may coexist with successful safe
daily closes, but retains an explicit warning and unresolved repair metadata.
Review the provider-confirmed missing/revised dates.
Never fabricate prices, reopen entitlement holds, or reset all historical failures.

For audits with `storage_comparison_version=1`, overlap comparisons use exact
price/volume storage scales (8/4 decimal places). Inspect material differences
at those scales; full provider precision differing from stored rounding is not
alone evidence of a correction. Provider-to-provider conflicts remain strict.
Older unresolved corrections are retained, not automatically cleared. Recover
this worker-only release with the complete v9 runtime at
`94b61f59fa2fd6da3fa1524c055782016fc19240`; retain JWT verification, observations,
audit history, queue receipts and the unchanged four-hour quote schedule.

- `documentation/pipelines/market-data-pipeline.md`
- `documentation/pipelines/market-assessment-pipeline.md`
- `automation/daily-market-assessment.md`
- `automation/daily-opportunity-assessment.md`
- `documentation/pipelines/technical-engine-operations.md`
- `documentation/pipelines/market-convergence-pipeline.md`
- `documentation/security-and-operational-notes.md`
- `documentation/project-plan.md`

## AI-selected recommendation timing — 13 September 2026

For AI timing, inspect private.ai_timing_candidates_v2() for exact eligibility gaps. Stale research or daily prices, missing mappings or matching-currency QQQ coverage block publication. Follow automation/daily-personal-recommendations.md for bounded recovery; never backdate refreshed evidence into an earlier assessment. The existing personal-prediction-ledger-v1 cron remains every 15 minutes, with its old publisher returning zero and its evaluator honoring locked v2 timing. Daily controller cadence is unchanged; no separate schedule was created or verified from this repository change.

## Decision history and outcome tracking — v3

For Decision Journal v3 inspect private.decision_candidates_v3 for missing inputs; use private.evaluate_decisions_v3 for a safe evaluator retry. The personal-prediction-ledger-v1 job now runs both legacy and v3 evaluators. Do not rerun retired publish_ai_timing_v2. New model calls are generated by the existing Daily Trading Controller instructions. Missing data remains explicit; no synthetic forecasts are inserted in production.

### ASX convergence admission/recovery

Run `scripts/asx-convergence-readiness.sql` using trusted Trading SQL after due Market work is terminal. Follow [the ASX contract](specifications/asx-convergence-v1.md): commands expire after five minutes; source/AI/calendar blockers are not success. Check exact `market_convergence.asx_runs_v1` receipt IDs. Original v1 retry helpers cannot recover ASX failures. Diagnose exact failed leaves, preserve original cutoff/input, maximum three linear attempts. Disable ASX dispatch/revoke runner execute for recovery; preserve all history. Calendar trust needs reviewed renewal before 25 November 2026 02:34:21 UTC. Automatic ASX convergence alerts remain separate work.
