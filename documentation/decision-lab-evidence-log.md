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
