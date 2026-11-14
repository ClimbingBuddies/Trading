# AI execution handover — 11 November 2026

[Start here for Cody’s GitHub handover](./ai-handover/README.md). It includes the saved task inventory, replacement prompts, schedule settings and cutover checklist.

## Agreed responsibilities

Both contributors retain equal input into priorities, design, reviews and development, with their existing repository and application access. Cody will operate the project's AI accounts, prompts, schedules and runtime connections. This is an AI execution handover, not sole ownership of the project. Either contributor can propose work through the shared repository; all development still follows the exclusive coordination lock and existing review/approval gates.

The account-specific blocker is the existing Daily Trading Controller in the other contributor's ChatGPT account. GitHub access does not grant access to that saved task. This document does not prove that any hosted task has moved. The previous restore-in-the-old-account instruction in the recommendations handover is superseded by the controlled cutover below.

## Prompt for the other contributor's GPT

> Help hand over Trading's AI execution to Cody while preserving equal project input and existing access for both contributors. Read the latest `AGENTS.md`, `documentation/project-context.md`, `documentation/development-coordination.md` and `documentation/ai-execution-handover.md` from `ClimbingBuddies/Trading`, operational branch `project/decision-lab-completion`, plus the live coordination state.
>
> Inventory every Trading AI task or automation in this account, including the Daily Trading Controller and any development, audit, recovery or monitoring tasks. Distinguish active, paused and historical tasks. Export each task's identifier, exact saved prompt/version, schedule/timezone, execution environment, model, required tools/connections, notification settings, latest result and unresolved failures. Do not include credentials or private portfolio data in GitHub.
>
> Prepare a handover for equivalent execution under Cody's account. Keep both contributors' existing access and equal ability to propose and review changes. Do not restart old standalone Market/Opportunity tasks or completed development controllers. Do not enable duplicate writers. Under the coordination procedure, agree a cutover after Cody's replacement is prepared and verified: pause the old task, verify it is paused and no execution is in flight, record that evidence, then let Cody enable exactly one replacement. Preserve all existing data, history, immutable research, lifecycle gates and idempotency rules.
>
> Return the inventory, configuration export, precise account-bound actions and a cutover receipt showing old and new task state and next due time. If an action requires the account owner, give exact clicks. Do not claim completion merely because GitHub instructions were updated. The Daily Trading Controller remains daily at 08:00 Australia/Perth. Current quote refresh cycles are being changed separately to every four hours; this is not a request to run AI research every four hours.

## Inventory and acceptance

Repository files under `automation/` are specifications, not proof of active saved tasks. Inventory at least the daily controller, project-plan builder/auditor, Decision Lab development controller, My Dashboard/user-guide controllers and recovery monitors. Follow each controller's actual completion state; do not recreate completed jobs. Preserve meaningful-change notifications without adding routine noise.

Prepare replacements paused, or use a supported ownership transfer only if the actual service offers it. Verify Cody's connectors reach the exact Trading GitHub/Supabase/Vercel environments. A local scheduler also requires its host to remain available; do not silently substitute it for an unattended cloud task. Check the actual supported environment before selecting the replacement.

The old owner can do their part remotely in their own account. No shared passwords or login to their account on Cody's computer is needed. Read-only inventory may proceed during another developer's lock; scheduler changes require ownership or a verified handoff. Pause/enable order and no-running-execution evidence are mandatory to prevent overlapping production writers.

Completion requires saved-task readback, one genuine eligible unattended run, persisted stage receipts and reconciliation of research/publication/evaluation results. Keep detailed account evidence private; publish a sanitized status and source identities. Existing stale research and unresolved coverage remain visible until real evidence resolves them.

## Stock ticker cadence

Live inspection found quote job 1 running every **15 minutes**, not 30. Its old loader selected up to eight symbols and skipped recently loaded symbols. Merely changing the timer would repeatedly select the same alphabetically early batch.

The replacement uses four-hour cycles at **03:00, 07:00, 11:00, 15:00, 19:00 and 23:00 Australia/Perth**, with up to eight internal batches two minutes apart during the first 15 minutes. Each batch selects at most eight eligible instruments; durable receipts prevent serial retries from selecting the same instruments in a cycle. Capacity is 64 eligible instruments per cycle, above the 30 active mappings observed during preparation. US equity/ETF quotes retain market-hours restrictions; forex/crypto retain existing eligibility. Daily history and daily AI research retain their separate schedules.

Operational quote freshness becomes current through 255 minutes (four hours plus batch allowance), due through 285 minutes, then stale while the market is active. Raw ages remain visible. This does not change analytical cutoffs, missing-price rules or historical eligibility. Database-only alerts/evaluators/watchdog retain their existing cadence.

Batch selection and its initial receipt use a database transaction lock. An unfinished cycle-aware batch blocks further claims, including later cycles, until reviewed recovery; terminal batches impose a 60-second cooldown before the next claim. An unfinished receipt never proves a refresh succeeded. Eight slots give a theoretical capacity of 64 symbols, but slow requests, database delays or missed slots reduce actual completion. The 30 mappings observed during preparation fit four batches; coverage must still be reconciled from receipts and observations.

Implementation order: install reviewed `scripts/market-quotes-cycle-claim.sql`, deploy the cycle-aware worker, then apply `scripts/market-quotes-four-hour.sql` and matching frontend thresholds. Its paired rollback restores schedule/freshness; also restore exact original worker source from `9f56300` and frontend thresholds. The unused service-only claim RPC can remain safely installed during rollback; removing it requires separate review. The legacy cron job name remains unchanged to preserve identity/history; read its schedule field. Record actual deployment and schedule verification separately in the evidence log.
