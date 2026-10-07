# Daily Trading Controller

**Specification version:** 1.8 (complete watched recommendation coverage)
**Last updated:** 7 October 2026
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
6. `automation/daily-shared-decision-lab.md`

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

### Readiness and completion contract

Retrieve `automation/daily-reviewer-playbook.md` and `scripts/daily-reviewer-preflight.sql` fresh alongside this specification. Run the read-only preflight before creating a new Market Assessment run. Save its per-instrument findings with the invocation report; a successful history job does not prove research or Decision Lab completion.

Before freezing a research cutoff, verify the required raw prices have arrived for the target completed sessions. Queue missing price history first, using the existing idempotent history queue, and wait for a later invocation to recheck. Data maintenance is not an analytical stage. Permanent identity/provider limitations must be explicitly accounted for as blocked instruments; they must not silently disappear or indefinitely prevent supported instruments from progressing under a truthful partial run.

Preserve the existing subsystem date/lifecycle rules. Record exchange session dates separately from wall-clock execution. Do not reinterpret a later New York date as permission to create a duplicate historical run. Recovery that cannot fit the existing lifecycle remains explicitly blocked until the next legitimate run. Never move a frozen cutoff or backdate decisions to admit later-loaded prices.

Before reporting completion, run all eight evidence checks in the playbook. Store PASS, FAIL or UNVERIFIED with evidence for each. A terminal partial assessment permits downstream processing of eligible instruments but does not mean the daily pipeline is complete.

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
- required price ingestion has passed the readiness contract above, with unsupported instruments explicitly accounted for; and
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

## Shared Decision Lab stage (after C)

The owner-specific Personal Recommendations stage is superseded. Preserve existing personal records, but do not publish new owner-specific recommendations from this controller.

Retrieve `automation/daily-shared-decision-lab.md` fresh and follow its release/readiness gates. This stage researches the distinct union of watched instruments plus open shared calls once per instrument; personal notes must never enter shared research or performance. Supported instruments proceed individually; explicitly report unsupported inputs.

Publication is an analytical stage subject to the existing one-stage-per-invocation limit. Deterministic evaluation is separate: run the private shared evaluator in a SERIALIZABLE transaction only after its release gate is accepted. Existing original calls remain locked; append dated reviews. A WAIT is a valid call, not an instruction to force a position. Weekly/monthly checkpoints never force a sale.

This specification is a release candidate until the shared stage acceptance and deployed source revision are recorded. If the release gate is disabled, report `SHARED_EVALUATOR_ADAPTER_NOT_VERIFIED`; continue the independent upstream stages and do not fall back to personal recommendations or bypass the gate. The existing 04:30-09:30 Perth cadence and analytical independence are unchanged.

## Per-invocation behaviour

On every controller invocation:

1. retrieve this file fresh;
2. verify Trading Supabase access;
3. calculate current Perth and New York timezone-aware date/time;
4. inspect persisted states for Opportunity, External Opinion, Market Assessment, shared Decision Lab and Opportunity-history cleanup;
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
- Shared Decision Lab published/reviewed/evaluated/blocked counts and concrete missing-data reasons;
- Opportunity Exposure History Cleanup status;
- any recovery/resume performed;
- newly queued or completed history symbols;
- unresolved mapping/validation items;
- minimum Owner action actually required.

Only say that the Daily Trading pipeline completed normally when every required completion check passed. Otherwise report partial, blocked or failed, with the affected ticker, exact reason, evidence and next recovery action. Do not count UNVERIFIED checks as passed.

## Operating principle

The Daily Trading Controller is one scheduled orchestrator, not a fourth analytical opinion.

Its job is to execute the right independent subsystem at the right time, using durable state to avoid duplicates, then leave the morning Trading data reconciled and observable.


## Durable invocation receipts and independent watchdog

Retrieve documentation/trading-pipeline-reliability.md at the same exact commit SHA. The database watchdog is an independent monitor, not an analytical controller. It checks saved records every 15 minutes and raises overdue incidents after 10:15 Australia/Perth, starting 5 October 2026.

Before work commit private.claim_trading_stage_v1(stage, exact_commit_sha) and retain the attempt UUID. Commit the start separately from research or evaluation. Stage names are opportunity, external, market, publication, evaluation, or preflight when no analytical stage is eligible. Finish using private.finish_trading_stage_v1(attempt_uuid, terminal_state, sanitized_reason_code) after checking the subsystem receipt. A completed attempt is not proof of business completion. Refresh private.run_trading_watchdog_v1() after finalization and report its per-share counts/blockers.

At most two attempts per analytical stage per Perth morning; at most six preflight receipts. Exhausting an independent earlier stage must not starve a later independently eligible stage. Preserve the failed prerequisite and do not bypass actual research dependencies. Supported shares may progress from a truthful terminal partial assessment. Do not race a recent running attempt. After 45 minutes inspect actual task/subsystem activity before recording interruption or attempting safe resume. Never change a frozen cutoff or backdate a missed decision.

By the final 09:30 invocation report saved research, shared publication and accepted scheduled evaluation receipts, unsupported coverage and exact missing evidence. Zero new BUY calls is not a failure if the required reviews are saved. No calls to evaluate, missing fresh research or missing controller receipts cannot count as successful operation. Renew calendar verification from official sources before expiry; never merely extend a timestamp.

## Unconfigured-venue research-only continuation

During source collection, record original issuer documents in immutable private research receipts before freezing the applicable assessment cutoff. Follow the research-only section of `automation/daily-shared-decision-lab.md` at the same exact source SHA. Fresh completed independent ASX, NYSE or Nasdaq equity assessments without measurable configuration may publish via the guarded research publisher in the existing publication stage. Keep research-only saved counts separate from measured calls/evaluation and preserve missing-data blockers. The original WA1/1AI manual study is a bounded historical primary-source review; it does not prove complete current-news coverage or a successful scheduled daily run.

At final verification reconcile all active watched shares against saved AI recommendation coverage, using the guarded owner projection and per-instrument research/publication receipts. Report missing names and exact evidence blockers; never use a placeholder action to claim coverage. A current manually published research-only view can complete recommendation display coverage without completing the scheduled daily pipeline or becoming measurable.
