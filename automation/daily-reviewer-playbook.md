# Daily reviewer: verified completion

Version 2 design, 17 September 2026. This playbook supplements the canonical controller and analytical specifications. It does not authorize bypassing their database validation.

## Purpose

Turn every in-scope share into current evidence-backed research and, for enrolled personal watchlists, a prospective Decision Lab call or an explicit recovery item.

## Daily sequence

1. Retrieve the current controller and relevant stage specifications from GitHub; record their commit identities. Inspect persisted run state before doing work.
2. Reconcile the universe: active instruments, watched instruments, and open Decision Lab positions. Keep inactive history-only Opportunity exposures separate. Unsupported or inactive watched instruments remain visible as blocked rather than silently excluded.
3. Establish the most recent completed trading session per exchange using a verified calendar and timezone. Record session date separately from execution time. If the calendar is unavailable, report unknown readiness; do not infer a holiday from missing prices.
4. Execute `scripts/daily-reviewer-preflight.sql`. Validate symbol, venue, currency and provider identity. Queue missing history using the existing idempotent queue. Respect rate limits and retain rejected-bar evidence. Recheck after workers finish.
5. Check raw share history and the configured same-currency benchmark through the target session. Require at least 20 valid daily observations for each Decision Lab input. Confirm the actual database publication rules too; this minimum alone is not sufficient. Queue readiness work before research, not after it.
6. Freeze a new research cutoff only after its inputs have arrived. Never change an existing run cutoff to admit later data. If a partial run cannot resume safely under its lifecycle, record the blocked items for the next legitimate run. Do not create a second same-date run or backdate recovery.
7. Generate independent research using raw data and dated public sources. Preserve Opportunity and Technical Engine independence. Persist assessment and evidence using the existing prepare/finalize lifecycle. Every expected instrument must be assessed or have a specific blocker.
8. On the next eligible analytical invocation, inspect `private.decision_candidates_v3()`. Publish only unblocked candidates using `private.publish_decision_v3`, the actual model identity and exact input hash. Record immutable original calls; append later changes. WAIT is a researched call, not a substitute for missing inputs.
9. Run the existing outcome evaluator. Verify fills and checkpoints from later observed sessions, matched benchmark and documented costs. Weekly/monthly checkpoints do not automatically close positions.
10. Reconcile all counts and save a completion report. Report partial work honestly and carry recovery items into the next invocation. Notify only meaningful changes.

## Ownership and recovery

The Daily Trading Controller owns analytical work. History workers own ingestion; the trial monitor verifies outcomes and raises exceptions. Neither should race a recent running analytical stage. Preserve the one-analytical-stage-per-invocation rule. A later heartbeat may identify a recovery need but must use the same lifecycle and overlap checks before writing anything.

The current v3 Decision Lab input function is Tiingo/QQQ-specific. Yahoo ASX history alone does not make an ASX decision publishable. Keep ASX publication blocked until a verified AUD benchmark, provider mappings and provider-aware input/evaluation implementation are deployed and tested. Never relabel Yahoo data as Tiingo or compare AUD returns to a USD benchmark without an explicit methodology.

## Evidence-backed definition of done

Each check is PASS, FAIL or UNVERIFIED, with query result/run ID/source link. UNVERIFIED never counts as PASS.

| Check | Required evidence |
| --- | --- |
| Universe reconciled | Exact distinct instrument IDs; expected = assessed + blocked, with disjoint sets. Personal owner/instrument counts reconciled separately. |
| Identity validated | One approved active provider mapping for each required symbol; venue and currency match returned provider metadata. |
| Prices ready | Verified target session; share and benchmark coverage; positive adjusted prices; no duplicate sessions; all selected data loaded before the frozen cutoff. |
| Research saved | Eligible completed run, assessment ID, actual model identity, dated evidence and source URLs for each researched instrument. |
| Decisions accounted for | Each eligible owner/instrument has an AI event ID or exact publication blocker; saved input hash matches the published bundle. |
| Outcomes reproducible | Original calls unchanged; subsequent price observations, benchmark, costs and entry/exit/checkpoint rules reproduce recorded returns. |
| Rerun safe | Repeated processing creates no duplicate original decisions and does not rewrite prior predictions or evidence. |
| Display reconciled | Recommendations and Decision Lab show the saved IDs/counts and explain blocked items. A backend-only test leaves this UNVERIFIED. |

## Completion report contract

Save execution time, target sessions, source specification identities, stage run IDs, universe counts, data-ready counts, assessment IDs, decision event IDs, outcomes evaluated, and one recovery record per blocked instrument. A recovery record contains instrument ID, stage, exact reason, evidence, next action and next eligible retry. Do not include credentials or full private prompts.

Distinguish `complete` (every required check passed), `partial` (some valid results and outstanding blockers), `blocked` (no safe analytical progress), and `failed` (execution error). A job exiting successfully is not evidence that the daily pipeline completed.

## Rollout boundary

The preflight SQL is read-only and executable against the existing schema. This playbook defines the redesigned workflow; it is not itself a deployed scheduler, database lock, session calendar, ASX Decision Lab implementation, or UI status panel. Verify each of those separately before claiming the whole redesign is live.

