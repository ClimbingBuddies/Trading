# Daily reviewer: verified completion

Version 5, 18 November 2026. This playbook supplements the shared controller and analytical specifications. It does not authorize bypassing their database validation.

## Purpose

Turn every in-scope share into current evidence-backed research and, for the distinct watched/open shared-call union, a prospective shared call, research-only recommendation or explicit recovery item. Personal decisions and notes are not inputs.

## Daily sequence

1. Retrieve the current controller and relevant stage specifications from GitHub; record their commit identities. Inspect persisted run state before doing work.
2. Reconcile the universe: active instruments, watched instruments, and open Decision Lab positions. Keep inactive history-only Opportunity exposures separate. Unsupported or inactive watched instruments remain visible as blocked rather than silently excluded.
3. Establish the most recent completed trading session per exchange using a verified calendar and timezone. For ASX independent research, fetch and execute `scripts/asx-research-readiness.sql` at the same source commit under `documentation/asx-research-calendar.md`, including fresh official alerts. Record session date separately from execution time. The date-only result is not fill attribution or publication permission. If calendar evidence is unavailable/expired, report unknown readiness; do not infer a holiday from missing prices.
4. Execute `scripts/daily-reviewer-preflight.sql`. It inventories the active universe plus distinct watched/open shared instruments, prioritizes open calls then watched shares, and reads no personal candidates or notes. Inactive watched/open records stay visible as blocked; do not activate them. Validate symbol, venue, currency and provider identity. Queue supported missing history only within verified provider rights. Respect rate limits and retain rejected-bar evidence; recheck in a later invocation after workers finish.
5. Separate independent research readiness from measurable publication readiness. The measurable path requires share and same-currency benchmark history, at least 20 valid daily observations and the actual database input checks. An absent benchmark is not a blanket ban on independent Market research or the supported research-only path. Price row counts alone certify neither sessions nor rights.
6. Before calling `prepare_chatgpt_market_assessment` for a new run, prepare source evidence for watched equities using the research-only path: verify original documents and save immutable source receipts as required by `automation/daily-shared-decision-lab.md`. Use exact URL/summary/hash and actual database verification time. Collect eligible atomic opinions or direct receipts before freezing the cutoff. Then prepare the run, assess against that frozen evidence and link each direct evidence row to its matching receipt. Never change an existing cutoff, backdate receipts or relabel later evidence to repair a partial run. If pre-cutoff proof is absent, preserve the assessment and report the publication blocker for the next legitimate run.
7. Generate independent research using raw data and dated public sources. Preserve Opportunity and Technical Engine independence. Persist assessment and evidence using the existing prepare/finalize lifecycle. Every expected instrument must be assessed or have a specific blocker.
8. In the same eligible sequential controller invocation, inspect `private.shared_decision_candidates_v1()` after research finalizes. Publish measurable candidates only through `private.publish_shared_decision_v1`. Separately inspect the supported unconfigured watched equities through `private.shared_research_input_v1` and publish eligible research-only results through `private.publish_shared_research_v1`. Use the actual model identity and exact database input hash. Preserve immutable originals and append reviews. Never fall back to personal publication. WAIT is a researched call, not a substitute for missing inputs.
9. Independently check the accepted shared evaluator release/provider/session gates and evaluate existing calls through the SERIALIZABLE procedure in `automation/daily-shared-decision-lab.md`. Missing new research/publication does not by itself block eligible existing calls. Verify fills and checkpoints from later observed sessions, matched benchmark and costs; weekly/monthly checkpoints do not automatically close positions.
10. Reconcile all counts and save a completion report. Report partial work honestly and carry recovery items into the next invocation. Notify only meaningful changes.

Use the controller's per-instrument admission ledger before any whole-stage block. The preflight exposes audit identity, rejected-session count and revalidation state alongside job status. Successful ingestion with rejected sessions is not admitted daily coverage. The legacy US-hours quote status is not ASX session evidence. A Tiingo-dependent operation's blocker must not suppress an independently eligible Yahoo/issuer operation.

## Ownership and recovery

The Daily Trading Controller owns analytical work. History workers own ingestion; the trial monitor verifies outcomes and raises exceptions. Do not race a recent running stage. Follow the canonical sequential multi-stage invocation within its 90-minute budget, with separate claims/finishes and native convergence receipts. A retry must preserve lifecycle and overlap checks; do not schedule extra invocations.

The installed shared measured-outcome path remains Tiingo-specific. Yahoo ASX history alone does not enable measurable ASX calls; verified sessions, an AUD benchmark and provider-aware evaluation are still required. Supported research-only publication is separate and excluded from performance. Never relabel Yahoo as Tiingo or compare AUD returns to a USD benchmark without an explicit methodology.

## Evidence-backed definition of done

Each check is PASS, FAIL or UNVERIFIED, with query result/run ID/source link. UNVERIFIED never counts as PASS.

| Check | Required evidence |
| --- | --- |
| Universe reconciled | Exact distinct instrument IDs; expected = assessed + blocked, with disjoint sets. Reconcile active Market scope separately from watched/open shared publication scope. |
| Identity validated | One approved active provider mapping for each required symbol; venue and currency match returned provider metadata. |
| Prices ready | Verified target session; share and benchmark coverage; positive adjusted prices; no duplicate sessions; all selected data loaded before the frozen cutoff. |
| Research saved | Eligible completed run, assessment ID, actual model identity, dated evidence and source URLs for each researched instrument. |
| Decisions accounted for | Each watched/open instrument has a shared call/review, eligible research-only recommendation or exact blocker; saved input hash matches the bundle. No private owner data enters research. |
| Outcomes reproducible | Original calls unchanged; subsequent price observations, benchmark, costs and entry/exit/checkpoint rules reproduce recorded returns. |
| Rerun safe | Repeated processing creates no duplicate original decisions and does not rewrite prior predictions or evidence. |
| Display reconciled | Recommendations and Decision Lab show the saved IDs/counts and explain blocked items. A backend-only test leaves this UNVERIFIED. |

## Completion report contract

Save execution time, target sessions, source specification identities, stage run IDs, universe counts, data-ready counts, assessment IDs, decision event IDs, outcomes evaluated, and one recovery record per blocked instrument. A recovery record contains instrument ID, stage, exact reason, evidence, next action and next eligible retry. Do not include credentials or full private prompts.

Distinguish `complete` (every required check passed), `partial` (some valid results and outstanding blockers), `blocked` (no safe analytical progress), and `failed` (execution error). A job exiting successfully is not evidence that the daily pipeline completed.

## Rollout boundary

The preflight SQL is read-only and executable against the existing shared schema. Its publication_path is routing guidance, not permission or a substitute for the trusted candidate/input functions. Repository changes are adopted only when a real hosted invocation fetches that commit; verify its receipts separately. This playbook does not install calendars, change database gates, or establish unattended completion.
