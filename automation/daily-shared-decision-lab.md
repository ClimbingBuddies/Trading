# Daily shared Decision Lab — release candidate v1

20 September 2026. This file is not evidence that the existing scheduled task has adopted it. Record its GitHub commit SHA on each actual invocation. The live evaluator release gate remains disabled pending acceptance. Do not change the existing timetable or create another controller.

## Inputs and ownership

Research the distinct union of all watched instruments and nonterminal shared calls. Shared AI records are visible to signed-in users; personal notes and owner-specific decisions are not research inputs. Preserve legacy personal history. The independent Market Assessment methodology remains authoritative; do not manufacture weekend assessments or reinterpret stale research as fresh.

Read the fresh `automation/daily-trading-controller.md`, independent Market Assessment specification, `documentation/decision-lab-data-contract.md`, and this specification. Use Supabase project `glvbqcplgjdfgjyknzsa`. Database state is authoritative for completion; a ChatGPT response or successful page load is not a run receipt.

## Preflight and source readiness

1. Read `private.shared_evaluator_release`, enabled provider/benchmark configuration, latest completed assessment times and `private.shared_decision_candidates_v1()`. Account for every watched/open instrument. No-call candidates and existing calls are separate counts.
2. Verify the exchange's official trading calendar and alerts. An imported published schedule needs an unexpired review; refresh through `scripts/prepare-shared-calendar-import.mjs` using an independently reviewed manifest hash. Import a new immutable revision for changes or a renewed review; never edit previous sessions to move a recorded fill. Expired or absent coverage blocks evaluation. The Nasdaq manifest is not an ASX/NYSE calendar.
3. Price inputs require a verified provider mapping, currency and session-date convention. The current snapshot transport supports reviewed Tiingo daily UTC date labels and matches saved close/adjusted-close values against original provider payloads. Missing adjusted prices are not replaced by close. An unsupported provider, venue or benchmark stays blocked.
4. Check the latest completed exchange session separately from current wall time. Queue supported missing history through the existing maintenance queue, then recheck later. Do not freeze research cutoffs before required evidence is available, move frozen cutoffs or invent prices. Calendar review does not authorize new API spending.

## Publish genuine shared research

Publication is one analytical stage under the controller's existing limit. For each eligible candidate, use its current independent assessment plus the exact database-returned input bundle and hash. Generate a concise action, thesis and material risks using the actual model identity. BUY, WAIT, HOLD, SELL, REDUCE and AVOID are possible; do not force a BUY to populate the screen.

Call `private.publish_shared_decision_v1(assessment_id, action, thesis, risks, model_identity, input_hash)`. The database owns publication time, locks the instrument, enforces assessment reuse and appends reviews to an open cycle. Reuse an identical payload for a known retry; changed content for the same assessment is rejected. Do not insert calls/reviews directly, backdate them, copy sample calls or copy an old personal call into shared history.

Record per-instrument published/reviewed/skipped/blocked results with exact saved identifiers. A fresh scheduled assessment is still required when a candidate reports `FRESH_PUBLISHED_ASSESSMENT_REQUIRED`. Do not bypass that requirement because price history exists.

## Evaluate outcomes

Run only when `private.shared_evaluator_release.enabled` is accepted and true. A disabled gate is a deployment blocker, not an invitation to enable it from a routine trading invocation.

Use one `BEGIN ISOLATION LEVEL SERIALIZABLE` transaction, call `private.run_shared_evaluation_v1(request_uuid, actual_spec_commit_sha, 'scheduled')`, then call private.run_shared_action_evaluation_v1() in that same transaction before COMMIT. Record both legacy receipt and action-trial counts; all calls/reviews, including WAIT/AVOID/REDUCE, have separate 5/20-session action trials. A manual check must use `manual_verification` and must never be reported as a scheduled run. Keep the same request UUID and spec identity for a known retry. On an uncertain commit, inspect the durable run and item receipts before retrying; absence while the original transaction may still be running is not proof of rollback. Serialization/deadlock failures roll back and may be retried in a later bounded invocation.

The runner uses database-owned snapshots, validates input chronology and pinned outcomes, reproduces the tested mechanics in SQL, and writes through the guarded atomic writer. Original calls and existing outcomes are immutable. Entry and exit use the close of the first verified session opening after the relevant publication; missing intended-session evidence never shifts the fill to a later session. Costs are 0.1% each side. Checkpoints at 5/20 subsequent sessions do not trigger sales. Preserve losing outcomes. Corporate-action or revised-price conflicts withhold new returns for review.

An evaluation receipt confirms a committed calculation, not a new AI recommendation or successful upstream research. `NO_SHARED_CALLS_TO_EVALUATE` is not a successful paper trial. Preserve blocked item reasons; do not replay successful calls merely to hide partial completion.

## Definition of done for an invocation

- Actual source SHA and invocation origin recorded.
- All watched/open instruments reconciled to saved shared records or explicit blockers.
- Calls/reviews refer to genuine current assessments with immutable publication times.
- Evaluated calls have durable run-item receipts; retry adds no duplicate outcomes.
- Prices, session, provider, currency and benchmark identities are inspectable.
- Missing results remain null/blocked, not zero or fabricated performance.
- Shared dashboard IDs and values reconcile with saved calls/outcomes; private notes remain outside this process.
- Report partial/blocked/unverified checks explicitly. Stay quiet when state is unchanged; report material failure, first genuine results or required action.

## Current release blockers

As of the 20 September implementation checkpoint: writer/controller entry-point rollback tests pass, but no genuine shared calls exist; the latest completed research is stale; publisher benchmark configuration is not enabled; actual scheduled invocation and populated dashboard acceptance remain unverified. ASX 1AI/WA1 lack provider mappings/history. FIG needs verified NYSE/benchmark session compatibility. The observation week has not started.
