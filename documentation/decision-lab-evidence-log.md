# Shared Decision Lab evidence log

Baseline recorded 17 September 2026. This log distinguishes earlier verified foundation work from unimplemented feature work.

| Item | Status | Evidence | Next action |
| --- | --- | --- | --- |
| Shared schema installed | PASS — foundation only | Supabase migration `shared_decision_lab_foundation`; source `scripts/shared-decision-lab.sql`; prior tool response success | Review lifecycle constraints during M0/M2 |
| Shared read access and private-note isolation | PASS — SQL role simulation | `scripts/test-shared-decision-lab.sql` executed against the project; result reported PASS and transaction rolled back | Repeat after permissions change; add actual two-user browser test |
| Retry, immutability and anonymous denial | PASS — foundation tests | Same rollback-only integration test; mismatch rejection and update denial passed | Extend to publisher concurrency and evaluator retries |
| Fixture cleanup | PASS | Post-test database counts were zero for shared calls, reviews, outcomes and notes | Continue using rollback-only fixtures |
| Provider/benchmark readiness | UNVERIFIED for shared workflow | Earlier diagnostic reported 15 missing ASX mappings; no shared benchmark configuration verified | M1 |
| Shared publisher and candidate queue | NOT IMPLEMENTED | Foundation status document | M2 |
| Shared outcome evaluator | NOT IMPLEMENTED | Foundation status document | M3 |
| Shared scheduled controller | NOT IMPLEMENTED | Main controller remained owner-specific; PR #26 is draft | M4 |
| Approved shared UI | NOT IMPLEMENTED | Existing PredictionWorkspace reads personal records | M5 |
| Real end-to-end US/ASX runs | UNVERIFIED | No saved shared calls or outcomes demonstrated | M6 |

Future entries must include date/time, check ID, exact command/query or test path, relevant run/record/commit ID, result, and recovery action. These baseline PASS entries do not imply the ten feature-level completion checks have passed.

## 27 September 2026 — live controller restoration

- PASS: created and activated the Codex `Daily Trading Controller` automation on the saved Trading project. Schedule is 04:30–09:30 Australia/Perth daily at 30 minutes past each hour. The task requires `project/decision-lab-completion`, controller specification v1.5 or later, and records the exact GitHub commit before execution.
- PASS: enabled verified shared publication configuration for AVGO, BEAM, MRVL and NVDA using the active Tiingo mapping and same-currency QQQ benchmark. Live observations for all five symbols were present through the 25 September 2026 Nasdaq session. ASX 1AI/WA1 and NYSE FIG remain explicitly unsupported.
- PASS: imported immutable Nasdaq calendar review revision `nasdaq-2026-reviewed-2026-09-27`, manifest SHA256 `dea5bee7eb1b044e761206f40a97b70a605a902f178f8feaf0ad8b7cf95d340b`, valid through 6 October 2026 UTC after review of the official Nasdaq calendar and system-status sources.
- PASS: 94 shared calendar, adapter, database transport, engine and adversarial tests passed. Command: `node --test tests/shared-market-calendar.test.mjs tests/shared-paper-adapter.test.mjs tests/shared-paper-db.test.mjs tests/shared-paper-engine.test.mjs tests/shared-paper-adversarial.test.mjs`.
- PASS: enabled `private.shared_evaluator_release` at accepted revision `395b740ebfb6a7022dd899acdb055716113e5caa`.
- PASS with expected blocker: committed manual verification receipt `3f742b0f-70b5-4e55-a341-5f263e0713da` returned `NO_SHARED_CALLS_TO_EVALUATE`. This proves the released runner executes and audits truthfully; it is not evidence of a shared call or outcome.
- NEXT: the first legitimate fresh Market Assessment and shared publication can occur only after a completed US weekday session. Verify the Tuesday 29 September Perth morning controller invocations for the Monday US session, persisted assessment, first genuine shared call and populated dashboard drawer.

## 19 September 2026 — paper mechanics checkpoint
PASS: 18 deterministic tests in tests/shared-paper-engine.test.mjs (node --test). Entry 100, exit 110, net return 9.7802197802%, benchmark 2%. Covers loss, hold, missing/duplicate/currency-invalid prices, revisions, future evidence, cancellation, calendar validation, checkpoints and reruns.
PASS: scripts/test-shared-decision-lab.sql rerun against Supabase; privacy, retry and immutable original checks passed, fixtures rolled back.
Remaining: trusted database adapter and publication gates, calendar/provider integration, concurrent persistence, scheduled runs and dashboard wiring. These are not covered by the local mechanics pass. See documentation/shared-paper-engine.md.

19 September 2026 — Development workflow review: independent agent review_playbook reviewed the playbook, controller prompt and project plan. Critical workflow gaps addressed. Review found conflicting task IDs and contract-bootstrap ambiguity; corrected to ENG1/ENG2/DATA1 and an explicit bootstrap exception. This is documentation/workflow review only, not independent review of the mechanics implementation. Files saved locally; not claimed pushed, merged or scheduled.
19 September 2026 — C1/ENG1 checkpoint accepted locally. Independent agents mechanics_test and mechanics_review found backdated Sell/pinned-entry contradiction, time rewind, truncated calendar relocation and missing Sell-calendar blocker. Controller fixed monotonic evaluatedThrough and publication guards, pinned-calendar rejection and Calendar required reporting. Independent retest: 21 repository + 7 adversarial tests PASS; engine SHA256 F41783DD0C84F4240F704EE1F681E5627572149221A27CF949CB49017BF6FCA2. Commands: node --test tests/shared-paper-engine.test.mjs and node --test tests/shared-paper-adversarial.test.mjs. Reviewer verified fixes. Contract v1 reviewed; separate blockedItems/pagination/counts added to resolve finding. Controller accepts contract as implementation target, not deployed API. No database mutations or schedule changes in this checkpoint; persistence, concurrent watermark enforcement, provider readiness and browser integration remain unverified.

## 19 September 2026 — ENG2/D1 integration checkpoint (partial)
- Deployed migrations: shared_decision_publication_boundary_v1, shared_decision_dashboard_projection_v1. Sources: scripts/shared-decision-publication.sql and scripts/shared-decision-read.sql.
- PASS: scripts/test-shared-decision-publication.sql executed via Supabase SQL: caller privileges denied, cross-table assessment registry consistent, outcome gate enabled, missing assessment rejected. Transaction rolled back.
- PASS: scripts/test-shared-decision-read.sql: pagination, count partition, awaiting-entry state, unverified return suppression, explicit projection and anonymous rejection. Transaction rolled back. These are API checks, not a populated browser test.
- PASS: post-test counts calls=0, reviews=0, outcomes=0, notes=0; enabled provider/benchmark configurations=0. Candidate query returns seven FRESH_PUBLISHED_ASSESSMENT_REQUIRED blockers.
- Independent read_api_review found health/measurement coupling and missing evaluation-state authority; corrected before deployment. New reviews invalidate READY state. Currency filtering added to input observations.
- Dashboard builder implemented SharedDecisionWorkspace and local Decision Lab integration; TypeScript and palette checks pass. Independent review identified outcome effective-date and checkpoint-label issues; fixed. Existing personal workspace remains in a legacy disclosure.
- Browser: local server started on 127.0.0.1:3001 with public Supabase configuration in process environment. Existing signed-in session loaded the shared page, zero calls and seven pending shares; no runtime error messages observed. Source public configuration was not saved to repository.
- NOT VERIFIED: populated drawer, actual private-note browser writes, publisher retry/concurrency with valid research, genuine shared publication, trusted exchange calendars, outcome persistence, sanitized evidence projection, scheduled shared runs. Outcome insert gate remains active. No GitHub push, Vercel deployment or schedule change in this checkpoint.
- Final browser check PASS: signed-in All AI calls shows seven pending shares; My watched shares filters to six. Compact Share / Issue / Next step table rendered. Final agent TypeScript and palette checks passed after effective-date, checkpoint, latest-performance and evidence presentation fixes.

20 September 2026 - Created local project/decision-lab-completion branch, retaining existing work. Updated development controller with ordered completion mandate and reconciled project-plan handoff. No new trading schedule, database mutation or deployment performed by this setup.

## 20 September 2026 - resumed ENG2 implementation checkpoint
- PASS: independent reviewer identified missing review version invalidation; installed shared_review_evaluation_version migration from scripts/shared-review-version.sql. scripts/test-shared-review-version.sql passed version initialization/increment, watermark preservation, subtransaction rollback, gate and privilege checks. Post-test live calls/reviews/outcomes all zero.
- PASS: local lib/shared-paper-adapter.mjs implemented. Independent mechanics_test ran 29 adapter +21 engine +7 adversarial tests =57 passing. Command: node --test tests/shared-paper-adapter.test.mjs tests/shared-paper-engine.test.mjs tests/shared-paper-adversarial.test.mjs. Adapter SHA256 BD71025C7F47AAD315FFCDF0E61754137E9D3688E5777180F586229A316E5042. Reviewer mechanics_review accepted the same hash as local-only checkpoint after lifecycle consistency fixes.
- Reviewer restriction: identical verified venues only; cross-venue benchmark/calendar compatibility not accepted. Adapter tests use injected transports, not real database persistence.
- UNVERIFIED / unfinished: trusted snapshot reader, atomic validating writer, verified exchange calendar source, numeric persistence, genuine shared-call UI acceptance and scheduled integration. Gate retained. No schedule or heartbeat changes; no observation trial started.

## 20 September 2026 - DATA1/ENG2/S1 guarded persistence checkpoint

Deployment: Supabase glvbqcplgjdfgjyknzsa. Installed additive migrations shared_market_calendar_snapshot_foundation, shared_paper_reference_calculator, shared_reference_alias_and_snapshot_validation, shared_input_provider_price_provenance, shared_snapshot_null_identity_validation, shared_atomic_writer_disabled, shared_writer_return_shape_validation, shared_evaluation_runner_audit, shared_pinned_required_values, shared_failed_run_dashboard_health and shared_input_trigger_fixed_search_path. Release is disabled; no live outcome publication claimed.

- PASS: 94 local tests via node --test tests/shared-market-calendar.test.mjs tests/shared-paper-adapter.test.mjs tests/shared-paper-db.test.mjs tests/shared-paper-engine.test.mjs tests/shared-paper-adversarial.test.mjs.
- PASS: 13 Node/Postgres parity scenarios generated by scripts/test-shared-sql-parity.mjs and executed in Supabase.
- PASS: scripts/test-shared-market-inputs.sql, test-shared-paper-reference.sql, test-shared-snapshot-validation.sql, test-shared-paper-writer.sql and test-shared-evaluation-runner.sql executed as rollback checks. Validator: two valid inputs and sixteen rejected mutations.
- PASS: real AVGO/QQQ prices with rollback-only synthetic Buy 15 September, Hold 16 September, Sell 17 September yielded entry 16 September, exit 18 September and five outcomes. Writer rejects stale versions, missing/tampered outputs, numeric-string/null returns and direct writes. Exact receipt retries are idempotent; terminal rerun adds no outcomes. Authenticated detail projection returned CLOSED/READY with original BUY and a return. This is SQL role simulation, not a populated browser check.
- PASS: runner gate failure is audited; failed call health invalidated without advancing watermark. Within rollback transaction an enabled run produced one evaluated cycle/five outcomes; identical request replay matched and changed specification revision was rejected. No synthetic run persisted.
- PASS: independent mechanics_test and calendar_inputs review. Findings fixed: bigint observation IDs versus UUID assumption, missing pinned required returns, return JSON shape, stale READY health on failed runs. A SQL alias ambiguity and validator test quotation defect were also fixed before passing.
- PASS: immutable Nasdaq 2026 calendar has 365 days, 251 sessions, ten holidays and two early closes; source https://www.nasdaqtrader.com/Trader.aspx?id=Calendar and https://www.nasdaq.com/market-activity/stock-market-holiday-schedule . Manifest SHA256 dea5bee7eb1b044e761206f40a97b70a605a902f178f8feaf0ad8b7cf95d340b. Review expires 2026-09-21T14:28:15Z; published future schedule is not proof against emergency closures.
- Input conventions: Tiingo UTC session dates for AVGO, BEAM, MRVL, NVDA and QQQ. Recent sixty-record raw close/adjusted-close matches: AVGO60, BEAM60, QQQ60, MRVL51, NVDA55; mismatches withheld. Latest observed date 18 September. Loader fallbacks are not accepted as original adjusted-price evidence. ASX 1AI/WA1 history/mapping and cross-venue FIG benchmark compatibility remain unresolved.
- Local controller specification v1.5 is a RELEASE CANDIDATE; automation/daily-shared-decision-lab.md added. GitHub main inspected at blob 3b6d97297174a8d0586c0c5697a8fb68a7293916 still held v1.3 personal workflow. No schedule adoption, GitHub push or Vercel deployment claimed.
- Latest research audit: completed assessment run 2026-09-16T22:38:01.905852Z; all seven candidates require fresh published assessment. Publisher configurations remain zero.
- UNVERIFIED: two simultaneous PostgreSQL writers, actual scheduled invocation, genuine shared publication, populated browser and two-user browser note isolation. Stage 1 NOT accepted; observation week NOT started.
- Security adviser identified new immutable-input trigger mutable search_path; fixed to pg_catalog. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable . Existing unrelated advisories were not changed.

Recovery: keep private.shared_evaluator_release.enabled false until release acceptance. Apply source migrations in the order above (foundation/reference/validator/source validation/writer/return shape/runner/pinned-value validation/failure health); do not delete original calls, reviews or outcomes. Token receipts reconcile uncertain commits; absent receipt is unresolved, never automatic retry permission.


## 4 October 2026 - independent operational monitoring

Installed additive monitoring tables and functions in live Supabase; no research, decisions, outcomes or private notes changed. Initial verification found and fixed loop-variable, optional-record and retry-expression defects before final acceptance. Rollback-only monitor checks now pass: missing-run deadline, Perth/NY date, weekend skip, unauthenticated/private privilege boundary, overlapping work, two analytical attempts, six preflight receipts, repeat-monitor deduplication and unchanged call/note counts. Fixture rows rolled back.

Five local status tests passed: completed counts, missing/future/stale evidence, unresolved historical incidents, weekend message and malformed/partial states. TypeScript noEmit and palette compliance passed at the initial UI checkpoint; rerun after integration. Official Nasdaq calendar sources checked; independent consistency script passed all 365 dates, ten holidays, two early closes and timezone/DST boundaries. New immutable calendar revision nasdaq-2026-published-schedule-reviewed-2026-10-04 imported, valid until 2026-10-11T03:14:10.367Z.

Supabase cron trading-pipeline-watchdog-v1 installed every 15 minutes. Manual receipt reports SETUP, four supported and three unsupported shares; genuine scheduled watchdog receipts succeeded at 2026-10-04T03:30:00.251721Z and 03:45:00.099344Z (job 17, return 1 row). These are monitoring receipts, not scheduled research/publication acceptance. Supabase advisors identify the intended authenticated SECURITY DEFINER status API and private tables with no public policies; no anonymous execution or public mutation granted. Existing unrelated advisories remain unchanged.

Genuine fresh scheduled research/publication/evaluation, populated production dashboard, two-user browser acceptance and external-channel delivery remain UNVERIFIED. No observation week started.

Final reliability verification, 4 October 2026:
- PASS: 92 selected Node tests in status, calendar, adapter, engine and database transport suites; TypeScript noEmit with incremental disabled; palette compliance across 34 component/style files.
- PASS: rollback SQL creates a real saved CONTROLLER_NOT_SEEN incident, verifies repeated reconciliation preserves its identity, and verifies a temporary same-day invocation resolves it at the diagnostic clock. Additional checks cover deadlines, roles, overlap and retry budgets. After rollback: zero controller attempts, future test mornings and future test incidents.
- PASS: actual React status component rendered with the saved monitor snapshot and network disabled. Headless Edge verified collapsed default, click-to-open, saved evidence, share coverage and no horizontal overflow at 1440px and 375px. This is isolated component verification; production authentication, hydration and populated Decision Lab remain unverified.
- SOURCE: first checkpoint pushed as 22fbcdf on project/decision-lab-completion. Follow-up fixes freeze freshness to the morning deadline and exercise saved incident recovery. Independent reviewer acceptance was not performed for this reliability checkpoint.
- PENDING: Vercel authentication completed and the terminal linked to the existing boulders-market project. Git deployment is disabled; a separate production deployment is required. External notifications remain unconfigured pending the owner's channel and destination.
