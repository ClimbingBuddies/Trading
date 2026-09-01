# Daily Trading Controller

**Specification version:** 1.1  
**Last updated:** 01 September 2026  
**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

This is the canonical execution specification for the **single scheduled Daily Trading Controller**.

The controller is the only ChatGPT scheduled task required for the morning Trading workflow. It runs several times through the early Perth morning, inspects current timezone-aware clock state and persisted Supabase state, and executes the next eligible stage itself.

The downstream analytical specifications remain authoritative for methodology:

1. `automation/daily-opportunity-assessment.md`
2. `automation/daily-external-opinion-review.md`
3. `automation/daily-market-assessment.md`
4. `documentation/pipelines/opportunity-exposure-history-cleanup.md`
5. `documentation/pipelines/historical-market-data-backfill.md` when a provider seed is required

Do not duplicate or paraphrase those methodologies here. Retrieve the applicable file fresh immediately before executing its stage.

## Single-task schedule

Run this same controller task at:

- 04:30 Australia/Perth
- 05:30 Australia/Perth
- 06:30 Australia/Perth
- 07:30 Australia/Perth
- 08:30 Australia/Perth
- 09:30 Australia/Perth

This hourly morning cadence intentionally spans both US daylight-saving states.

The controller must derive the actual current `Australia/Perth` and `America/New_York` date/time on every invocation. Never assume a fixed offset between them.

The three former dedicated task schedules are not part of the operating model. Their scheduled tasks should remain disabled while this controller is enabled.

## Required fresh GitHub sources

At the beginning of every invocation retrieve this controller file fresh from `ClimbingBuddies/Trading` and record its source identity.

Before executing a downstream stage, retrieve that stage's specification fresh. If a required specification cannot be retrieved, do not execute that stage from memory.

## Systems of record

- **GitHub** is authoritative for methodology and sequencing.
- **Supabase** is authoritative for run state, dates, instruments, exposures, external opinions, Market Assessment state, historical observations and backfill queues.
- **Scheduled-task history is not authoritative** for whether a subsystem actually completed.

## Stage eligibility

### A. Daily Opportunity Assessment

Due once per current Australia/Perth date, beginning at or after the first 04:30 Perth controller invocation.

Inspect `public.opportunity_assessment_runs` and the current daily Opportunity state according to `automation/daily-opportunity-assessment.md`.

If today's work is already truthfully terminal and complete enough under that specification, skip it.

If it is missing, partial or failed and the specification permits safe resume/retry, execute it once in the current controller invocation.

Opportunity remains analytically independent from short-term Market Assessment, Technical Engine and external-opinion conclusions.

### B. External Opinion Review

Due only when:

- the applicable America/New_York date is a scheduled production weekday; and
- the current New York time is at or after **17:00**.

At the first controller invocation meeting those conditions, inspect persisted External Opinion state according to `automation/daily-external-opinion-review.md`.

If already terminal for that New York date, skip it. Otherwise execute/resume it exactly as its specification allows.

A terminal partial review may still satisfy the prerequisite for Market Assessment, provided failures are preserved truthfully.

### C. Daily Trading Market Assessment

Due only when:

- the applicable America/New_York date is a scheduled production weekday;
- current New York time is at or after **18:15**; and
- External Opinion for that New York date is terminal.

At the first controller invocation meeting those conditions, inspect persisted Market Assessment state according to `automation/daily-market-assessment.md`.

If already complete, skip it. Otherwise execute/resume it exactly as its specification allows.

Preserve Market Assessment independence from Opportunity, Technical Engine and Market Convergence. External opinion may be consumed only under the existing `external-opinion-v1` rules.

### D. Opportunity Exposure History Cleanup

Eligible after:

1. the current Perth-date Opportunity Assessment is terminal and its exposure set is trustworthy; and
2. any External Opinion Review due for the applicable New York date is terminal; and
3. any Market Assessment due for that New York date is terminal; and
4. no conflicting Opportunity exposure historical batch is already running.

Retrieve `documentation/pipelines/opportunity-exposure-history-cleanup.md` and follow it exactly.

The cleanup must be coverage-driven. Do not download five years every morning merely to obtain one new daily bar. Seed only new or materially incomplete exposure history under the existing Tiingo backfill procedure.

For external Opportunity exposures, preserve the approved history-only boundary:

- inactive supporting `public.instruments` rows may exist solely for Tiingo history;
- they are not active tracked Trading-universe instruments;
- do not create Twelve Data mappings for them;
- do not set them permanently active;
- ambiguous or unsupported provider identities become `mapping_required`, never guesses.

## Per-invocation behaviour

On every controller invocation:

1. retrieve this file fresh;
2. verify Trading Supabase access;
3. calculate current Perth and New York timezone-aware date/time;
4. inspect persisted states for Opportunity, External Opinion, Market Assessment and Opportunity-history cleanup;
5. determine the earliest eligible unfinished stage;
6. execute **at most one analytical stage** in that invocation;
7. after a Market Assessment execution completes, history cleanup may also be started in the same invocation if every prerequisite is now terminal and doing so is safe;
8. if no analytical stage is due, advance or verify history cleanup if applicable;
9. never race a currently running recent stage;
10. never create a duplicate same-date logical run merely because the controller is invoked again.

Later morning invocations are deliberate checkpoints. They should normally find earlier stages already terminal and advance the next eligible stage rather than repeat work.

## Expected morning timing

During US daylight saving, the normal pattern is approximately:

- 04:30 Perth — Opportunity Assessment
- 05:30 Perth — External Opinion Review, after 17:00 New York
- 06:30 Perth — Market Assessment, after 18:15 New York
- 06:30/07:30 onward — history cleanup and verification

During US standard time, External Opinion and Market Assessment naturally shift roughly one Perth hour later, while the controller schedule remains unchanged.

The objective is normally to have the complete morning pipeline settled by the final 09:30 Perth invocation without maintaining separate ChatGPT task cards.

## Retry, idempotency and overlap

- Reuse same-date subsystem lifecycle and idempotency mechanisms exactly as their specifications require.
- Do not replay completed instruments or evidence.
- Do not create a second External Opinion or Market Assessment for the same applicable New York date.
- Opportunity run-audit semantics remain governed by its specification.
- Do not create a second Opportunity exposure historical batch while one is running.
- If a stage is `running` with recent activity, do not race it.
- If a stale running state is suspected, diagnose from durable timestamps and runbook rules before repairing it.

## Weekend and non-session behaviour

The controller itself runs daily.

Opportunity Assessment remains due daily under its own Perth-date specification.

External Opinion and Market Assessment are required only when their New York production schedule makes them due. Do not fabricate weekend or non-session short-term assessments.

History cleanup may still run when its prerequisites for that morning are satisfied.

## Failure handling

If GitHub or Supabase is unavailable, do not fabricate execution or completion.

If External Opinion fails, follow its required finalisation and source-family telemetry; Market Assessment waits until the review reaches a truthful terminal state.

If Opportunity is incomplete or unreliable, do not auto-onboard newly discovered external exposure history from that run.

If Tiingo identity is ambiguous, record `mapping_required` and continue other safe symbols.

If Tiingo returns a quota/rate-limit condition, stop new provider calls and preserve truthful batch state.

## Reporting

Each invocation should report only material state changes. Do not produce six repetitive morning notifications when nothing changed.

The final morning state should summarise:

- current Perth controller time/date;
- applicable New York business date;
- Opportunity status;
- External Opinion status;
- Market Assessment status;
- Opportunity Exposure History Cleanup status;
- any recovery/resume performed;
- newly queued or completed history symbols;
- unresolved mapping/validation items;
- minimum Owner action actually required.

If everything completed normally, say that the Daily Trading pipeline completed normally.

## Operating principle

The Daily Trading Controller is one scheduled orchestrator, not a fourth analytical opinion.

Its job is to execute the right independent subsystem at the right time, using durable state to avoid duplicates, then leave the morning Trading data reconciled and observable.