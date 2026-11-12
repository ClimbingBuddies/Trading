# Trading task inventory

Observed on 12 November 2026 Australia/Perth. Recheck live state at cutover. These are the Trading entries found in the inspected source account and the legacy local archive.

| Task | Observed state and saved settings | Handover action |
| --- | --- | --- |
| Hosted Daily Trading Controller | Paused. Daily 08:00 Australia/Perth, no end, same chat, model Default with Medium displayed and reasoning control unavailable. | Prepare the hosted replacement using the controller prompt. Keep the source writer paused and verify no work is in flight before enabling the replacement. |
| Hosted Trading Progress Tracker | Active. Daily 10:30 Australia/Perth, no end, same chat, GPT-6.1 Sol / Light. Account-level Tasks Push was enabled with no observed per-task override. | Prepare a read-only replacement with meaningful-change reporting. Coordinate one reporter at a time. |
| Hosted Backfill Completion Watch | Paused. Hourly, GPT-6.1 Sol / High. It watched a specific historical batch that completed. | Archive as historical. |
| Hosted Project Manager | Active. Daily 06:00 Australia/Perth, Default / Medium. Mixed scope. | Leave the existing task in its source account. The Trading excerpt is in the historical archive. |
| Legacy local Daily Trading Controller | Paused. Daily 08:00 Australia/Perth, GPT-6 Sol / High, failed-runs-only notifications. Its connector depended on its host. | Archive as historical. The replacement runs in the cloud. |
| Legacy local Decision Lab three-week trial | Stored active flag, with its daily 10:00 Australia/Perth recurrence expired on 5 October 2026. | Archive as historical. |

Searches did not locate separate saved Trading development, audit, Market Assessment, Opportunity Assessment, External Opinion or general recovery controllers in the inspected account. Repository specifications document workflows and may exist without a saved scheduled task. Review other account-specific inventories through the account owner if new evidence identifies additional jobs.

## Evidence and open work

- The last visible hosted controller attempt on 23 October 2026 ended blocked when the first stage claim was rejected before a durable attempt was observed. See [approval and controller recovery](https://github.com/ClimbingBuddies/Trading/issues/37).
- The 22 October partial research and 10 November manually initiated evaluation are saved operational evidence. Verify a later eligible unattended run separately. The tracker last visibly ran successfully on 11 November and reported material progress to GitHub.
- No running database stage attempt was observed in the snapshot. Recheck immediately before cutover.
- Verify live calendar trust and its expiry. Follow [calendar verification](https://github.com/ClimbingBuddies/Trading/issues/35), [research and evaluation freshness](https://github.com/ClimbingBuddies/Trading/issues/36) and [duplicate Yahoo data](https://github.com/ClimbingBuddies/Trading/issues/38) in the [progress index](https://github.com/ClimbingBuddies/Trading/issues/34).
- Quote refresh cycles, daily history, the technical worker, the evaluator and the database watchdog retain their own schedules. See the [AI execution agreement and quote cadence](../ai-execution-handover.md) and [pipeline reliability](../trading-pipeline-reliability.md).
