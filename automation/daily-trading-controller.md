# Daily Trading Controller

**Specification version:** 1.17 (bounded source recovery and precise failure evidence)
**Last updated:** 19 November 2026
**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

AI runtime operator: Cody, following `documentation/ai-execution-handover.md`. Both contributors retain equal project input and existing access. Do not infer that this repository update transferred a hosted task; verify the controlled cutover before enabling a replacement. This does not change the daily 08:00 schedule or the analytical methodology.

This is the canonical execution specification for the **single scheduled Daily Trading Controller**.

The controller is the only ChatGPT scheduled task required for the morning Trading workflow. It runs once daily at 08:00 Australia/Perth, inspects current timezone-aware clock state and persisted Supabase state, and executes eligible stages sequentially within one bounded invocation. Scope is exclusively the Trading project and ClimbingBuddies/Trading; do not include Discover Stories.

The downstream analytical specifications remain authoritative for methodology:

1. `automation/daily-opportunity-assessment.md`
2. `automation/daily-external-opinion-review.md`
3. `automation/daily-market-assessment.md`
4. `documentation/pipelines/opportunity-exposure-history-cleanup.md`
5. `documentation/pipelines/historical-market-data-backfill.md` when a provider seed is required
6. `automation/daily-shared-decision-lab.md`
7. `documentation/pipelines/market-convergence-pipeline.md`

Do not duplicate or paraphrase those methodologies here. Retrieve the applicable file fresh immediately before executing its stage.

## Single-task schedule

Run this controller once daily at **08:00 Australia/Perth (00:00 UTC)**. There are no additional hourly runs, automatic follow-up chats or routine retry schedules. At this time New York is normally 20:00 on the previous date during daylight saving and 19:00 during standard time, after both evening eligibility gates.

The controller must derive the actual current `Australia/Perth` and `America/New_York` date/time on every invocation. Never assume a fixed offset between them.

The three former dedicated task schedules are not part of the operating model. Their scheduled tasks should remain disabled while this controller is enabled.

## Required fresh GitHub sources

At the beginning of every invocation retrieve this controller file fresh from `ClimbingBuddies/Trading` and record its source identity.

Before executing a downstream stage, retrieve that stage's specification fresh. If a required specification cannot be retrieved, do not execute that stage from memory.

Before External Opinion or Market source collection, also retrieve `documentation/pipelines/research-source-recovery.md` at this same resolved commit. Execute its bounded fallback and private collection-ledger rules with the tools actually available. Reader failures, upstream access denials, unvisited scope and provider entitlement are separate reasons. Verify required direct-source receipts before freezing the Market cutoff; never clear an old run with later evidence.

## Systems of record

- **GitHub** is authoritative for methodology and sequencing.
- **Supabase** is authoritative for run state, dates, instruments, exposures, external opinions, Market Assessment state, historical observations and backfill queues.
- **Scheduled-task history is not authoritative** for whether a subsystem actually completed.

## Stage eligibility

### Readiness and completion contract

Retrieve `automation/daily-reviewer-playbook.md` and `scripts/daily-reviewer-preflight.sql` fresh alongside this specification. Run the read-only preflight before creating a new Market Assessment run. Save its per-instrument findings with the invocation report; a successful history job does not prove research or Decision Lab completion.

Before freezing a research cutoff, verify the required raw prices have arrived for the target completed sessions. Queue missing price history first, using the existing idempotent history queue, and wait for a later invocation to recheck. Data maintenance is not an analytical stage. Permanent identity/provider limitations must be explicitly accounted for as blocked instruments; they must not silently disappear or indefinitely prevent supported instruments from progressing under a truthful partial run.

Load the shared publication specification **before preparing Market research**, not only after it. For unconfigured watched equities, its direct-source receipts must be verified before the run cutoff. Prepare those receipts first, then freeze the cutoff and link the resulting assessment evidence. Prioritize active instruments with open shared calls, then watched shares, then the rest of the active universe; this changes processing order, not scope or scoring. A completed un-watched assessment does not count as watched-share recovery. If an existing cutoff lacks source proof, preserve it and record the exact blocker; do not add backdated receipts or invent another same-date run.

Provider restrictions are operation-specific: distinguish new persistent ingestion, AI reference analysis, saved outputs and sharing. Verify applicable account evidence rather than treating a working API key as entitlement or treating one provider's uncertainty as a global stop. Preserve genuine holds and independently eligible paths. Record the exact missing fact and affected operations; a broad `provider gate` message is not enough for recovery. See the runbook's controller recovery procedure.

Read [the current runtime confirmation](../documentation/operational-runbook.md#operator-confirmed-runtime-setting-18-november-2026) from the same resolved source commit. The designated hosted controller operator confirmed on 18 November that ChatGPT's "Improve the model for everyone" setting is off. Treat that specific fact as operator-confirmed, not connector-verified; do not report the training setting as unknown again solely because a connector cannot inspect it. Reconfirm if the runtime account, workspace, provider or setting changes, or contrary evidence appears. This confirmation does not establish permission for persistent provider data, saved derived outputs or sharing. Keep remaining operation-specific blockers explicit and do not infer permission from successful ingestion. Never bypass source freshness, source-proof, publication or evaluation checks.

Preserve the existing subsystem date/lifecycle rules. Record exchange session dates separately from wall-clock execution. Do not reinterpret a later New York date as permission to create a duplicate historical run. Recovery that cannot fit the existing lifecycle remains explicitly blocked until the next legitimate run. Never move a frozen cutoff or backdate decisions to admit later-loaded prices.

Before reporting completion, run all eight evidence checks in the playbook. Store PASS, FAIL or UNVERIFIED with evidence for each. A terminal partial assessment permits downstream processing of eligible instruments but does not mean the daily pipeline is complete.

#### Per-instrument admission ledger

Before deciding to block Market, record for every active instrument: provider, target completed exchange session, latest admitted daily session, audit identity, intended operation, eligibility and exact blocker. Reconcile eligible + blocked = expected with disjoint sets. Use the normal prepare/finalize lifecycle for the eligible subset and finalize truthfully partial. Block the whole stage only when no instrument is eligible or a genuine stage-wide prerequisite fails. A combined reason such as `ASX_SESSION_CONFLICT_AND_TIINGO_SAVED_OUTPUT_RIGHTS_UNVERIFIED` is a summary, not a replacement for this ledger. Recheck each downstream operation against its own inputs.

For ASX use Sydney session labels and Yahoo audit provenance. Fetch `documentation/asx-research-calendar.md` and `scripts/asx-research-readiness.sql` fresh at this same source commit. Check current official exchange alerts, then execute the read-only query unchanged before freezing a new Market cutoff. Record its calendar revision/hash, cutoff, target session, source hash/audit IDs and exact per-instrument readiness. Only `RAW_PRICE_SESSION_READY` clears this raw-price/session gate; issuer-source, rights, lifecycle, publication and outcome gates remain separate. The date-only calendar is research-specific; it never enters the shared fill calendar or enables measured ASX outcomes. Expired/missing calendar evidence or an affected official alert remains an explicit blocker. Follow the calendar document's cutoff/source recheck procedure without moving frozen cutoffs.

The legacy equity classifier behind `latest_market_status` uses US hours; `market_closed`, especially with a null quote timestamp, does not establish ASX daily-price readiness or a holiday. Preflight `history_requested_end`, `history_coverage_end`, `history_audit_id`, `yahoo_rejected_sessions` and `yahoo_revalidation_state` remain useful diagnostics. A succeeded history job with rejected sessions remains quarantined. Requested end is a range boundary, not a verified trading session.

Tiingo saved-output restrictions apply to outputs derived from Tiingo inputs, not automatically to independently sourced Yahoo/issuer research. Do not relabel provider data, omit lineage, or call a result independent if Tiingo contributed to it. Record the affected operation and applicable section/effective-date evidence. Training-disabled reference use alone does not authorize persistence. No subscription upgrade, history deletion, provider migration or scheduler change is implicit in admission.

### A. Daily Opportunity Assessment

Due once per current Australia/Perth date, beginning at or after the 08:00 Perth controller invocation.

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

### C.1. Deterministic Market Convergence continuation

After C is truthfully terminal for the applicable production date, including when C was already completed and skipped, retrieve `documentation/pipelines/market-convergence-pipeline.md` and `scripts/market-convergence-readiness.sql` at this invocation's exact GitHub commit. Follow the pipeline's controller continuation procedure. Do not run before due Market work is terminal or manufacture a weekend/missed-date run.

For active ASX instruments also retrieve `documentation/specifications/asx-convergence-v1.md` and `scripts/asx-convergence-readiness.sql` at that same commit. Route ASX exclusively through the latter diagnostic and `market_convergence.run_asx_v1`; discard any ASX invocation from the original v1 diagnostic. Verify current official ASX status alerts under the existing research-calendar procedure before dispatch. The date-only calendar is not a halt/disruption feed. Use the separate private `market_convergence.asx_runs_v1` receipt, requiring `succeeded` plus its linked immutable public `market-convergence-asx-v1` result and matching frozen source dates/IDs/values. No raw private envelope may be placed in reports. New admission cutoffs expire after five minutes; discard unexecuted SQL and recheck instead of replaying it later. Same-day identical inputs return the existing successful receipt. Changed inputs or immutable-result conflicts require diagnosis, never overwriting or a second methodology.

Both readiness queries are read-only and freeze a new current convergence cutoff after independent source writes have committed. Execute only non-null `invocation_sql` for READY instruments, sequentially, once per instrument in this invocation. The original non-ASX path uses private `market_convergence.run_v1` with per-instrument scheduled scope. Do not use a whole-universe call: a zero-fresh successful run would consume that scope's day. Preserve each method's date/freshness rules; never backdate or move a saved cutoff to admit later inputs.

For the original non-ASX path, use the native `public.market_convergence_runs` ID as the durable receipt; ASX uses the separate receipt described above. The private controller claim API does not support a `convergence` stage: do not invent that claim or mislabel convergence as Market research. Follow the pipeline's receipt, uncertainty and bounded-retry instructions; report skipped/missing/stale inputs explicitly. A zero-write result is healthy only when a fresh, matching lineage-backed result already exists. A zero-fresh result is not completion.

Convergence remains downstream of the two independent branches. It cannot modify them or become an input to Market research. Its blocker must not starve independently eligible shared publication/evaluation or history cleanup. Do not add a cron, trigger, follow-up invocation or extra research stage. The same 90-minute controller budget applies.

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

Publication is a separate analytical stage within the single sequential daily invocation, with its own claim and terminal receipt. Deterministic evaluation is separate: run the private shared evaluator in a SERIALIZABLE transaction only after its release gate is accepted. Existing original calls remain locked; append dated reviews. A WAIT is a valid call, not an instruction to force a position. Weekly/monthly checkpoints never force a sale.

This specification is a release candidate until the shared stage acceptance and deployed source revision are recorded. If the release gate is disabled, report `SHARED_EVALUATOR_ADAPTER_NOT_VERIFIED`; continue the independent upstream stages and do not fall back to personal recommendations or bypass the gate. The single 08:00 Perth invocation governs timing; analytical independence is unchanged.

## Per-invocation behaviour

On every controller invocation:

1. retrieve this file fresh;
2. verify Trading Supabase access;
3. calculate current Perth and New York timezone-aware date/time;
4. inspect persisted states for Opportunity, External Opinion, Market Assessment, Market Convergence, shared Decision Lab and Opportunity-history cleanup;
5. determine the earliest eligible unfinished stage;
6. execute eligible unfinished analytical stages **sequentially**, each at most once in this invocation with its own separately committed claim and terminal receipt; order Opportunity, External Opinion, Market Assessment, its deterministic C.1 convergence continuation using native run receipts, shared publication, then accepted evaluation. Opportunity or convergence failures must not starve independently eligible work; External Opinion and Market prerequisites still apply;
7. after a Market Assessment execution completes, history cleanup may also be started in the same invocation if every prerequisite is now terminal and doing so is safe;
8. if no analytical stage is due, advance or verify history cleanup if applicable;
9. never race a currently running recent stage;
10. never create a duplicate same-date logical run merely because the controller is invoked again.

No hourly follow-up is expected. Recheck persisted prerequisites between stages and skip completed same-date work. Queue missing history and report blocked research if prices are not ready; do not wait for another worker or poll indefinitely.

## Expected morning timing

Start at 08:00 Perth daily. Use the actual New York date and verified exchange calendar for External Opinion and Market Assessment; their 17:00 and 18:15 gates remain unchanged. Run eligible stages in sequence and report once at the end. Stop starting new work after 90 minutes (normally 09:30 Perth), finalize safe committed receipts, and report remaining work as partial or blocked. This is an operating budget, not a guaranteed platform cancellation timer.

## Unattended execution

Use only permissions already available to the scheduled Trading task. Do not request expanded access, enable evaluator gates, fabricate credentials or wait for interactive approval. If a tool needs approval, fails, times out or has an uncertain write outcome, inspect durable receipts when possible and terminate with a specific blocker; never assume an unreturned write failed or blindly replay it. If access prevents terminal receipt writes, report the attempt UUID and unverified state for recovery. No self-created schedules or indefinite sleeps. A healthy scheduled run must end with a completion, partial, blocked or failure report.

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

Each invocation should report only material state changes. Emit one end-of-run report; stay quiet when state is unchanged under the saved notification policy.

The final morning state should summarise:

- current Perth controller time/date;
- applicable New York business date;
- Opportunity status;
- External Opinion status;
- Market Assessment status;
- Market Convergence run IDs, fresh/blocked coverage and lineage reconciliation (separate from Market research completion);
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

Exception for the deterministic C.1 continuation: use its native convergence run receipts, not the unsupported controller claim stage. The watchdog now reports separate current ASX convergence health and processes queued in-app alert checks. Retrieve `documentation/asx-alert-monitoring.md` at the same commit. Report its current, blocked, ready, failed/running and alert queue counts separately from historical morning completion. A returned UUID or a historical successful receipt does not prove current eligibility or notification delivery. Never change alert rules, create retroactive crossings or send external notifications as part of this continuation. Original non-ASX convergence still uses its native receipt reconciliation.

At most two attempts per analytical stage per Perth morning; at most six preflight receipts. Exhausting an independent earlier stage must not starve a later independently eligible stage. Preserve the failed prerequisite and do not bypass actual research dependencies. Supported shares may progress from a truthful terminal partial assessment. Do not race a recent running attempt. After 45 minutes inspect actual task/subsystem activity before recording interruption or attempting safe resume. Never change a frozen cutoff or backdate a missed decision.

At the end of the single 08:00 invocation report saved research, shared publication and accepted scheduled evaluation receipts, unsupported coverage and exact missing evidence. Zero new BUY calls is not a failure if the required reviews are saved. No calls to evaluate, missing fresh research or missing controller receipts cannot count as successful operation. Renew calendar verification from official sources before expiry; never merely extend a timestamp.

## Unconfigured-venue research-only continuation

During source collection, record original issuer documents in immutable private research receipts before freezing the applicable assessment cutoff. Follow the research-only section of `automation/daily-shared-decision-lab.md` at the same exact source SHA. Fresh completed independent ASX, NYSE or Nasdaq equity assessments without measurable configuration may publish via the guarded research publisher in the existing publication stage. Keep research-only saved counts separate from measured calls/evaluation and preserve missing-data blockers. The original WA1/1AI manual study is a bounded historical primary-source review; it does not prove complete current-news coverage or a successful scheduled daily run.

At final verification reconcile all active watched shares against saved AI recommendation coverage, using the guarded owner projection and per-instrument research/publication receipts. Report missing names and exact evidence blockers; never use a placeholder action to claim coverage. A current manually published research-only view can complete recommendation display coverage without completing the scheduled daily pipeline or becoming measurable.
