# Daily Trading Controller

**Specification version:** 1.0  
**Last updated:** 01 September 2026  
**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

This is the canonical supervisory specification for the **Daily Trading Controller**.

The controller coordinates the early-morning Trading workflow without merging the analytical methodologies or weakening their independence.

The governed morning pipeline is:

```text
Daily Opportunity Assessment
        |
        +------------------------------+
                                       |
External Opinion Review -> Daily Trading Market Assessment
                                       |
                                       v
                    Opportunity Exposure History Cleanup
                                       |
                                       v
                          Morning controller report
```

The first three workflows remain authoritative in their own GitHub specifications. The controller is responsible for scheduling alignment, persisted-state inspection, safe retry/resume, sequencing and the post-assessment historical coverage cleanup.

## 1. Required fresh GitHub sources

At the beginning of every controller run retrieve these files fresh from `ClimbingBuddies/Trading` and record their source identities:

1. `automation/daily-trading-controller.md`
2. `automation/daily-opportunity-assessment.md`
3. `automation/daily-external-opinion-review.md`
4. `automation/daily-market-assessment.md`
5. `documentation/pipelines/opportunity-exposure-history-cleanup.md`
6. `documentation/pipelines/historical-market-data-backfill.md` when the cleanup requires a provider seed

Treat each downstream file as complete authority for its own analytical or operational work.

If the controller file cannot be retrieved, stop without changing schedules or production data.

If a required downstream specification cannot be retrieved, do not substitute remembered logic for that stage. Record the exact blocked stage and continue only with stages whose independence and prerequisites remain safe.

## 2. Systems of record

### GitHub

GitHub is authoritative for workflow methodology and controller sequencing.

### Supabase

Trading Supabase project `glvbqcplgjdfgjyknzsa` is authoritative for persisted run state, active instruments, Opportunity themes/exposures, external-opinion evidence, Market Assessment state, historical observations and backfill queues.

### Scheduled tasks

Scheduled tasks are thin execution runners. Do not treat task text or task history as a substitute for persisted Supabase state.

## 3. Normal early-morning schedule

The intended normal schedule is:

### Daily Opportunity Assessment

- **04:30 Australia/Perth daily**
- uses the current Australia/Perth assessment date
- remains analytically independent from Market Assessment and External Opinion

### External Opinion Review

- **17:00 America/New_York, Monday-Friday**
- this naturally lands in the early Perth morning after the relevant US session
- retain New York scheduling so daylight-saving changes do not move the research to the wrong US market day

### Daily Trading Market Assessment

- **18:15 America/New_York, Monday-Friday**
- runs after the External Opinion Review
- retain New York scheduling for the same reason

### Daily Trading Controller

- **09:00 Australia/Perth daily**
- inspects the morning's durable state
- safely repairs/resumes incomplete due work when possible
- runs or starts Opportunity Exposure History Cleanup only after prerequisites are terminal
- produces one morning status report

Do not start all three analytical workflows simultaneously merely to reduce elapsed wall-clock time. External Opinion should precede Market Assessment because the Market Assessment is allowed to use current external-opinion evidence. Opportunity Assessment remains independent and can run earlier in parallel with the overall short-term pipeline.

## 4. Date reconciliation

The workflows deliberately use different business dates:

- Opportunity Assessment uses the current `Australia/Perth` date.
- External Opinion Review uses the current `America/New_York` date at its scheduled execution.
- Market Assessment uses the current `America/New_York` date at its scheduled execution.

At 09:00 Perth, the applicable New York date is commonly the previous Perth calendar date.

The controller must derive both dates from actual timezone-aware current time. Never assume that `Perth date - 1` is always the applicable New York date.

For External Opinion and Market Assessment, only require a production run when their New York weekday/session schedule makes that run due. Do not manufacture Sunday or exchange-holiday assessments merely because the Perth controller itself runs daily.

## 5. Controller preflight

Before doing any recovery or cleanup:

1. retrieve the required GitHub files fresh;
2. verify Trading Supabase access;
3. determine current Perth date and current New York date;
4. determine whether the External Opinion and Market stages are due for that New York date;
5. inspect durable state for all relevant stages;
6. inspect whether an Opportunity exposure historical batch is already running;
7. detect overlapping controller/backfill work before creating anything new.

Do not rely on a previous chat summary for completion state.

## 6. Stage A — Daily Opportunity Assessment

Inspect `public.opportunity_assessment_runs` and the current Perth-date Opportunity records according to `automation/daily-opportunity-assessment.md`.

If today's scheduled Opportunity Assessment already reached a truthful terminal state, do not duplicate it.

If it is missing, failed or incomplete and a safe retry is permitted by the Opportunity specification, execute/resume that specification once in the controller run using `execution_source` appropriate to controller recovery. Preserve all Opportunity independence rules.

The controller must not use Market Assessment ratings, Technical Engine outputs or external-opinion conclusions to form Opportunity results.

A failed Opportunity Assessment prevents the controller from treating today's exposure set as freshly reconciled. Historical cleanup may inspect existing coverage, but it must not auto-onboard newly discovered/external symbols from an untrustworthy incomplete Opportunity run.

## 7. Stage B — External Opinion Review

When a New York production review is due, inspect the persisted `external_opinion` review state and source-family telemetry according to `automation/daily-external-opinion-review.md`.

If the review is already terminal for the applicable New York date, do not duplicate it.

If it is missing/partial/failed and its specification permits retry, execute/resume it once before any controller recovery of the Market Assessment.

A terminal `partial` review may still allow Market Assessment to proceed, provided the Market Assessment treats missing source families truthfully and does not fabricate evidence.

External Opinion remains an evidence pipeline only. It must not calculate Opportunity signals, Technical Engine results or Market Convergence.

## 8. Stage C — Daily Trading Market Assessment

When a New York Market Assessment is due, require the External Opinion stage for that date to be terminal before controller recovery of the Market Assessment.

Inspect `public.gpt_market_runs`, queue state and persisted assessment rows according to `automation/daily-market-assessment.md`.

If the run is already complete, do not duplicate it.

If it is missing/partial/failed and safe idempotent retry is permitted, execute/resume the Market Assessment specification once.

Preserve the Market Assessment's independence from Opportunity, Technical Engine and Market Convergence. External opinion may be used only under `external-opinion-v1` and must not be double-counted.

## 9. Prerequisite gate before historical cleanup

The post-assessment historical cleanup may start only when:

1. the current Perth-date Opportunity Assessment is terminal and sufficiently complete to trust its current exposure set; and
2. any External Opinion Review due for the applicable New York date is terminal; and
3. any Market Assessment due for that New York date is terminal; and
4. there is no conflicting running Opportunity exposure historical seed batch.

A downstream analytical failure is not silently converted into success merely to release cleanup.

If a short-term stage is terminal `partial`, the controller may still perform historical coverage cleanup because that cleanup is based on Opportunity exposure identity, not on the short-term rating. The final report must preserve the partial status prominently.

If Opportunity itself failed or its current exposure write state is unreliable, do not auto-onboard new exposure history that day.

## 10. Stage D — Opportunity Exposure History Cleanup

When the prerequisite gate is satisfied, retrieve and follow:

`documentation/pipelines/opportunity-exposure-history-cleanup.md`

The cleanup must:

- inspect all current active Opportunity exposures;
- skip already-complete five-year-or-since-listing Tiingo seeds;
- never redownload five years merely because one new daily bar may exist;
- use the Owner-approved historical-only inactive instrument boundary for unambiguous external exposures;
- keep those supporting rows outside the active Trading universe;
- create no Twelve Data mapping for historical-only external exposures;
- queue only missing/incomplete approved seeds;
- use one actual Tiingo history request every two minutes;
- record unresolved provider identities rather than guessing;
- ensure the temporary two-minute cron removes itself after the batch is no longer running.

If there is nothing to seed, report a clean no-op.

## 11. Normal schedule versus controller recovery

The normal path is for the three dedicated scheduled tasks to perform their own work at their scheduled times. The controller should normally find them already terminal.

The controller is **not** a second routine copy of all three analyses.

Only perform controller-side recovery when durable evidence shows a due stage is missing, failed or incomplete and the downstream specification explicitly supports safe retry/resume.

This prevents duplicate research cost and preserves one logical run per business date where the subsystem is designed to be idempotent.

## 12. Overlap and retry rules

- Never run two controller recoveries for the same stage concurrently.
- Never create a second Opportunity exposure seed batch while one is running.
- Reuse same-date External Opinion and Market Assessment lifecycle helpers exactly as their specifications require.
- Respect Opportunity Assessment daily idempotency and run-audit rules.
- If another stage is currently `running` and its latest activity is reasonably current, do not race it. Report it as still running and avoid conflicting writes.
- If a stale orphaned running state is suspected, diagnose from durable timestamps and existing runbook rules before repairing it.

## 13. Active Trading-universe boundary

For controller purposes:

- `public.instruments.is_active = true` means the active tracked Trading universe;
- an inactive supporting instrument row used only for approved Opportunity history is **not** a tracked short-term instrument;
- historical-only rows must not receive Twelve Data mappings from the cleanup;
- the live Market Assessment and External Opinion workflows continue to process only their own active Trading-universe scope.

The controller must not expand the active Trading universe merely because an external Opportunity exposure has historical trend data.

## 14. Failure handling

### GitHub unavailable

Do not execute a stage whose authoritative specification could not be retrieved fresh.

### Supabase unavailable

Do not fabricate run state or completion. Stop production writes and report the failure.

### External Opinion failure

Follow its source-family/finalisation rules. Market Assessment recovery waits until the review is terminal, not necessarily fully successful.

### Market Assessment failure

Follow its prepare/resume/finalise rules. Do not fabricate ratings.

### Opportunity failure

Do not auto-onboard new exposure-history symbols from an incomplete Opportunity state.

### Historical mapping ambiguity

Mark/report `mapping_required` and continue other unambiguous symbols.

### Tiingo quota/rate-limit

Stop new provider requests for the batch and preserve truthful batch/queue state.

## 15. Morning completion report

At the end of every controller run provide one concise report with:

- controller Perth date/time;
- applicable New York business date;
- Opportunity Assessment: `SUCCEEDED`, `PARTIAL`, `FAILED`, `RUNNING`, `NOT_DUE` or `MISSING`;
- External Opinion Review: same status vocabulary;
- Market Assessment: same status vocabulary;
- Opportunity Exposure History Cleanup: `NO_OP`, `QUEUED`, `RUNNING`, `SUCCEEDED`, `PARTIAL`, `BLOCKED`;
- current active tracked-instrument count;
- current distinct active Opportunity exposure count;
- history coverage already complete/skipped;
- newly queued history symbols and batch ID when applicable;
- mapping/validation unresolved symbols;
- any recovery the controller performed;
- the minimum Owner action actually required, if any.

If all normal stages completed and history cleanup had nothing to do, say that the morning pipeline completed normally without inventing additional commentary.

Do not provide automatic trade execution or broker actions.

## 16. Operating principle

The Daily Trading Controller is an orchestrator, not a fourth analytical opinion.

Its job is to make the morning pipeline **ordered, idempotent, observable and self-cleaning** while preserving the analytical independence of the underlying systems.
