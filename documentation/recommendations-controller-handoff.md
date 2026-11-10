# Current handover — shared daily-loop recovery, 10 November 2026

This section supersedes the historical personal-controller handovers below. Cody has resumed responsibility for completing the project under the owner's broad authorization. The other contributor is needed only for the existing hosted **Daily Trading Controller**, which belongs to their ChatGPT account. They can perform that account-bound work remotely; sharing credentials or being physically present is unnecessary. This browser reaches ChatGPT sign-in and cannot inspect their saved task. Do not create a replacement task or assume that a GitHub prompt change updates the hosted task.

## Account owner's immediate action

In your own ChatGPT account, open **Scheduled/Tasks** and select the existing **Daily Trading Controller**. Ask your GPT to read the latest version of this handover on `project/decision-lab-completion`, inspect the saved task and its failure history, and follow the account-bound recovery steps below. Do not share a password or activate the three historical separate tasks. Inspecting is read-only; before changing the hosted controller, follow the live coordination lock requirements. If Cody still holds the lock, return the task diagnosis and leave the change pending until a verified release/handoff. GitHub/Vercel/Supabase sign-in does not grant access to this ChatGPT task.

## Message for the receiving GPT

Latest completion checkpoint: PR #44 merged at `f4f63d3c940296eed6cacba92b85adbe8c2eb86d`; the existing Vercel production app is READY on that exact source. Mobile overflow and drawer focus are fixed and verified in the signed-in production UI. Manual evaluator recovery succeeded for four supported calls, and exact-request replay added no duplicate outcomes or marks; this was explicitly manual, not proof of scheduled operation. Controller **v1.10** now includes reviewed convergence wiring with 26 passing PostgreSQL scenarios. Current independent inputs remain stale/missing, so no convergence execution was manufactured. The scope now needing your account is steps 1–3 below, followed by actual scheduled evidence and remaining acceptance checks; do not repeat completed repairs from the historical checklist.

Continue the existing Trading daily-loop recovery. First read `AGENTS.md`, `documentation/project-context.md`, `documentation/development-coordination.md`, and live `coordination/state.json`. Check the lock rather than inferring availability from this handover. Enroll your own clone/identity, preserve local work and acquire the exclusive lock on a dedicated feature branch before changing code, scheduler configuration or shared services. If another owner holds it, remain read-only and report the owner/task. A message handover is not a lock transfer.

The approved operational branch is `project/decision-lab-completion`. PR #42 merged at `4426da44e45c0f416c8c06b16330bdc6b49f1c0f`. Do not merge divergent `main` or enable automatic Vercel Git deployment. Read the latest recovery-branch evidence and coordination journal as well as the integration branch; release documentation can be newer than executable code.

Already completed:

- Reproducible dependency lock repair and current dedicated-route tests. Clean install, full baseline suite, production build, independent review and testing passed.
- Existing Supabase history worker deployed as version 7, with exact reviewed source and JWT verification retained. Its existing cron successfully invoked it; response was idle because no eligible jobs were pending. Failed queue history remains intact. Deployed code is not evidence of recovered price coverage.
- New immutable Nasdaq revision `nasdaq-2026-published-schedule-reviewed-2026-11-10` imported. Canonical hash `d6cf6a33e87e425a30c90c9c470d4d730e67005fd20cfb99715b5b167e22016c`; expiry 17 November 2026, 12:20:42 Australia/Perth. All previous calendar rows unchanged. Supported snapshot reads select it and the scheduled watchdog has cleared the calendar-expired blocker. Recheck official alerts daily and renew through a fresh reviewed revision before expiry.
- One actual signed-in app session verified populated results, original/review distinction, review explanation, watched filtering and horizon switching. PR #44 subsequently fixed mobile overflow and drawer focus; production checks pass. No private notes changed. Two-user browser isolation remains unverified.

Next, in order:

1. Locate the **existing Daily Trading Controller** in your owner's ChatGPT task account. Read its saved task ID, enabled state, timezone, recurrence, prompt/source branch and available terminal history. GitHub issues #34 and #37 record an earlier disabled state and a first-stage claim rejected by a tool safety control; distinguish the rejection from the unknown cause of disablement. Historical separate Market/Opportunity task IDs in old audits are not the replacement controller. Do not reactivate those old tasks.
2. Reconcile the saved prompt with `automation/daily-trading-controller.md` and `automation/daily-shared-decision-lab.md` at a verified current operational SHA. Preserve one 08:00 Australia/Perth invocation, sequential stages, existing notification preference, real lifecycle/idempotency and the 90-minute budget. Reconcile the repo's older local/cloud wording against actual saved task state. Require the owner's authority for scheduler changes; do not bypass a denied tool call, expand access or fabricate credentials. Report the precise rejection and legitimate remediation when access remains blocked.
3. After authorized correction, verify a genuine eligible unattended run from separately committed stage claims, terminal subsystem receipts and the watchdog. Record actual source SHA and attempt/run identities in protected evidence. Enabled status alone is not completion. No backdating, moved frozen cutoffs, placeholder WAITs, forced trades or invented research. Supported instruments progress independently while unsupported coverage remains explicit.
4. Reconcile fresh independent research, shared publication and both accepted paper evaluators. Keep the database-owned evaluator release gate/revision unchanged unless separately reviewed/authorized. Calendar renewal alone did not run evaluators. Missing or revised prices remain blockers.
5. Verify the deployed history repair on real eligible existing queue work. Identical duplicate value tuples collapse with audit; conflicting dates are excluded entirely and other valid dates load. Do not bulk-reset exhausted jobs or delete previous observations. Review any already-stored conflicting session before relying on it; request a bounded approved retry if the existing daily enqueue has not produced the needed work.
6. Adopt the reviewed v1.10 convergence continuation in the existing task through its fresh operational-branch specification. Use `scripts/market-convergence-readiness.sql` and native run receipts; no new cron or trigger. Its guarded read-only production check reports only stale/missing inputs. Technical and Market inputs remain independent; missing current research must not create new combined conclusions.
7. Complete authorized two-user verification, notification delivery and Stage 1 acceptance before starting the observation week. Mobile/focus repair is already verified in production. No observation week has begun; real market-session outcomes cannot be accelerated.

Keep issues #34–#38 open until their full acceptance evidence exists; append only sanitized technical updates. Do not publish account/watchlist details, raw database evidence, task credentials or private notes. Detailed evidence and recovery boundaries are in `documentation/decision-lab-evidence-log.md` under 10 November. Worker code recovery is version 6 at baseline 3688c16; code rollback does not reverse ingested observations. Calendar correction requires a reviewed forward revision, not editing immutable history.

Return: exact saved task configuration and authority, root cause/remaining blocker, actual unattended receipts, independently reconciled research/publication/evaluation counts, price recovery evidence and convergence status. Do not claim end-to-end recovery from schedule enablement or an idle worker response.

---

# Historical implementation — Decision Journal v3 (superseded)

Updated 13 September 2026. Decision Lab is implemented. This section supersedes the historical v2 handoff below. The canonical controller instructions are `automation/daily-personal-recommendations.md`; the existing Daily Trading Controller includes that stage. Apply `scripts/decision-journal-v3.sql` for the database contract.

Original calls are immutable. AI updates and owner notes append with server timestamps; personal notes do not change AI performance. BUY enters at a subsequent eligible session close. A later AI SELL initiates exit at a subsequent eligible close. Weekly and monthly checkpoints measure progress and never force a sale. Missing or corrected evidence is recorded explicitly and cannot rewrite an earlier outcome.

Decision Lab displays the compact journal table, status filters, selectable checkpoints and a share detail drawer containing the original call, dated updates, permanent personal-note form, paper position and expandable evidence. Recommendations reads the latest AI events through the owner-filtered v3 view.

Validation: 165 repository tests passed; TypeScript, production build and palette checks passed. The isolated PGlite suite covers immutable publication/outcomes, owner and anonymous permissions, note retry integrity, entry/exit timing, UTC session dates, checkpoint behavior, missing/corrected data, idempotency and separation of personal notes from AI performance. The populated UI was checked with isolated example records, with no production test decisions inserted.

Live database migrations `decision_journal_v3` and `decision_note_idempotency_guard_v3` applied successfully. The existing 15-minute evaluation job is active and runs both legacy and v3 evaluators. Live inventory at verification: zero plans, events and outcomes; all six queued shares blocked by fresh-assessment/eligibility requirements. The interface must show this honestly until upstream data is refreshed. The external ChatGPT Daily Trading Controller schedule was not independently observable; its existing schedule is preserved in GitHub instructions, not replaced by a duplicate automation.

Security review: authenticated execution of `append_personal_decision_note_v3` is intentional. The SECURITY DEFINER function checks permanent authenticated identity, parent ownership, allowed fields and idempotent request content; direct event writes and anonymous execution remain denied. This explains the database linter's authenticated-function notice.

---

## Historical v2 handoff (superseded)
> Update, 13 September 2026: AI-selected session timing is now implemented by scripts/ai-timing-v2.sql and automation/daily-personal-recommendations.md. The Daily Trading Controller integrates this production stage. The historical handoff below describes the previous baseline; the new stage specification governs v2. The completed dashboard build controller remains closed.

# Recommendations controller handoff

Prepared 13 September 2026. This is a proposed next-work handoff, not an instruction to restart the completed dashboard controller or change its accepted gates.

## Owner intent
The dashboard tab is Recommendations. It displays the owner's selected watchlist shares, their latest published AI view, and weekly/monthly buy and sell plans. Keep the compact two-row controls and table. Create watchlist and Add share remain popups. Decision Lab owns performance tracking and its next design phase is deferred.

The owner wants prospective AI recommendations whose original predictions can never be rewritten, backdated or selectively removed, allowing later comparison against an explicit benchmark.

## Existing implementation and table mapping
- components/WatchlistsClient.tsx: shared Recommendations and standalone Watchlists UI.
- components/MyDashboardClient.tsx: Recommendations tab, route key remains recommendations.
- lib/watchlist-recommendations.mjs: rating display and exact assessment/horizon plan matching.
- scripts/prediction-ledger-v1.sql: additive prediction schema, publication, evaluation, ownership and immutability.
- scripts/test-prediction-ledger.mjs: focused ledger verification.
- components/PredictionWorkspace.tsx: existing Decision Lab display.

| Table | Purpose / key fields |
| --- | --- |
| watchlists | Owner's personal lists; id, owner_user_id, name, is_default |
| watchlist_items | Selected shares; watchlist_id, instrument_id, added_at, notes, sort_order |
| instruments | Share identity and eligibility; id, symbol, instrument_name, currency_code, is_active |
| gpt_market_assessments | Published source research; assessment_id, instrument_id, run_id, rating, summary, key_risks, model_version, created_at |
| gpt_market_runs | Server-side source eligibility; scheduled mode, succeeded/partial status, completed_at, analysis_cutoff_time |
| personal_prediction_tracking | Owner enrollment; owner_user_id, started_at |
| personal_prediction_plans | Immutable plan; owner, instrument, assessment, published_at, source_cutoff, action, horizon_sessions, entry/exit rules, thesis, risks, model identity, source snapshot, benchmark, provider, costs, methodology |
| personal_prediction_results | Append-only evaluation evidence; prediction_id, owner, status, entry/exit observations, net return, benchmark return, reason |

UI columns: Share from instruments; AI view from the latest available published assessment; Buy/Sell plan from the SAME assessment and chosen horizon; Details from recorded thesis and risks. Missing research or plans stay explicitly missing. Do not borrow an old plan to make a new assessment appear actionable.

## Existing data and limits
The schema and implementation above are repository evidence. Reinspect live Supabase project glvbqcplgjdfgjyknzsa before claiming current row counts, freshness, scheduler health or coverage. Do not treat a prior screenshot as a live inventory.

The current ledger tests an AI rating using NEXT_COMPLETE_DAILY_CLOSE entry and FIXED_SESSION_HORIZON exit (5 or 20 market sessions), with 0.1% modelled cost per side. It does NOT generate AI-selected entry/exit dates or price targets. The SQL constrains these rule values, so adaptive timing cannot be added by merely changing display text.

Source assessments may be missing or stale. Availability of instruments is not proof of current research, usable prices, benchmark coverage or forecast quality. QQQ is explicitly named where eligible; it is not a universal market benchmark.

The older personal_recommendation_snapshots/sources/events specification belongs to the previous dashboard workflow. Do not assume it is the data contract consumed by this redesigned tab.

## Proposed next controller scope
1. Reconcile current GitHub main, working tree, deployed application and live schema. The old automation/my-dashboard-agentic-controller.md points at a different local checkout and its project is MY_DASHBOARD_PROJECT_COMPLETE; create an explicit new bounded plan/handoff before scheduling new work. Do not reopen accepted gates implicitly.
2. Verify source coverage and freshness for the owner's selected shares, plus usable daily price and benchmark/provider/currency coverage. Report exact missing inputs.
3. Define a versioned AI timing contract: publish time, evidence cutoff, weekly/monthly horizon, buy window or trigger, sell window or trigger, expiry/no-entry behavior, thesis, risks, model identity and source lineage. Specify how conflicts, missing sessions and revisions are handled before implementation.
4. Add an additive migration if the approved timing contract exceeds the fixed-rule schema. Preserve all historical plans/results and owner access controls.
5. Publish each forecast before its eligible entry observation. A new forecast is a new immutable record; no hindsight changes to the original. Retain failed, losing, expired and non-buy calls.
6. Verify idempotency, publication freshness, exact plan/source matching, missing-data behavior and reproducible evaluation with focused tests. Do not claim the model beats a benchmark without adequate forward outcomes.
7. Keep Decision Lab's redesign out of this implementation phase; preserve its existing evidence and provide the data contract for its next phase.

## Handoff status
UI and fixed-rule tracking foundation: implemented.
AI-selected buy/sell timing: not implemented.
Fresh source coverage and current live job/data health: require a fresh controller audit.
New controller schedule/activation: not performed by this handoff.

## AI timing v2 validation — 13 September 2026
- Additive production migration ai_selected_prediction_timing_v2 applied successfully.
- Focused PGlite migration/publication/evaluation tests pass: evidence-hash validation, bounded timing, idempotency, owner/anonymous isolation, immutability, variable entry and exit, missing-session refusal, stale input and modelled returns.
- Existing ledger tests and all 160 repository tests pass. Production build and palette checks pass.
- Production owner SELECT remains enabled; anonymous/authenticated publication and authenticated INSERT remain disabled; service-role direct ledger INSERT disabled.
- Existing 15-minute ledger cron is active. Empty production evaluator completes successfully. No test predictions were written to production.
- Live coverage audit: all 12 owner/share/horizon candidates currently blocked by missing or stale published assessments. US daily history last observed 3 September; WA1/1AI daily history absent. No unsupported live forecasts published.
- Security advisors identify unrelated existing notices (including public pg_net, existing market helper functions and the intentional enrollment RPC); none names a newly added timing function. See https://supabase.com/docs/guides/database/database-linter for advisor explanations.
- React review: existing aborted owner-scoped parallel reads and pagination preserved, pure display helper shared by both surfaces, no new browser credentials or model calls.
- Daily Trading Controller GitHub sequencing updated; scheduled ChatGPT task-card status is not observable through the available tools and was not changed.
