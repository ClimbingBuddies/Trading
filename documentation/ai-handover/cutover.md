# Hosted task cutover

## Prepare and verify access

1. Read [AGENTS.md](../../AGENTS.md) and [development coordination](../development-coordination.md). Verify the live coordination state. Read-only inventory can proceed during another contributor’s lock. Obtain the appropriate ownership or verified handoff before changing schedules.
2. In Cody’s ChatGPT account, open **Settings → Plugins** and check GitHub and the existing Trading-only Supabase connection. Compare the database identity with the [project context](../project-context.md). Use an authorized read-only check to verify that Cody’s connections reach the right repo and project. Confirm that the hosted runtime can use these connections and that any separately supported write path is authorized for unattended operation. An interactive success or an “Allow all” screen alone does not establish this. If permission is missing or a guard rejects execution, log the blocker in [issue #37](https://github.com/ClimbingBuddies/Trading/issues/37).
3. In the ChatGPT web account’s scheduled tasks manager, locate the existing source controller and tracker. Open each task, read its schedule, state and recent run history, and check whether it has an execution in progress. The account owner performs account-bound actions from their own account.
4. In Cody’s hosted Trading chat, paste the appropriate prompt and use the task’s schedule or edit controls to enter the values in [configuration.json](configuration.json). Read back the model, time zone, recurrence, context, available tools and notifications. Save disabled if supported. If saving activates the task immediately, keep it unsaved until the checks below pass.

## Switch operators

1. Confirm with the source owner that the old hosted controller is paused. Reopen the task to verify the saved state. Confirm no hosted execution is in flight and inspect the live Trading database attempts and subsystem receipts. Resolve any interrupted or uncertain write through the canonical controller procedure before continuing.
2. Once the transfer is authorized and one-writer checks pass, enable exactly one hosted **Daily Trading Controller** in Cody’s account. Reopen it and record the saved configuration and next due time. Continue to use [the canonical controller](../../automation/daily-trading-controller.md) for ordering and [the watchdog procedure](../trading-pipeline-reliability.md) for evidence.
3. Verify Cody’s prepared tracker against the authorized read-only connections and GitHub issue history. Coordinate pausing the source tracker, verify no tracker run is in flight, then enable one Cody tracker. Reopen it and verify the next due time and meaningful-change behavior.
4. If a blocker appears, keep a single authorized writer, inspect durable evidence and record the exact recovery action. To roll back an enabled replacement, pause it, verify no hosted execution or database attempt remains in flight, then use the authorized coordination process before restoring a previous hosted writer. Preserve every receipt and historical result.

## Accept the cutover

Wait for a genuine eligible 08:00 Perth run started by the hosted scheduler. Verify its recorded source commit, committed stage claims and terminal receipts, applicable assessor and publisher evidence, evaluator revision and gates, and final watchdog per-share research, publication and evaluation coverage. A manual invocation, a scheduler success banner, stale assessments or `NO_SHARED_CALLS_TO_EVALUATE` cannot establish completion. Record any ineligible or unsupported coverage and any open blocker truthfully. Confirm the tracker’s 10:30 Perth run observed the durable evidence and avoided duplicate GitHub reports.

Use the following fields in [issue #34](https://github.com/ClimbingBuddies/Trading/issues/34). Keep detailed run evidence in the appropriate protected systems.

| Receipt field | State at export |
| --- | --- |
| Source hosted controller paused and no execution in flight | Paused observed in the snapshot. Fresh no-overlap check pending. |
| Replacement hosted controller saved/enabled and next due | Draft only. Next due pending. |
| Source tracker and replacement tracker state, next due | Source active in the snapshot. Replacement draft only. |
| Exact controller source commit and separate accepted evaluator revision for the first run | Pending eligible unattended run. |
| Committed stage receipts, watchdog coverage and unresolved recovery action | Pending eligible unattended run. |
| Operator and authorization for schedule changes | Cody operates the replacement after the coordinated handover. |
