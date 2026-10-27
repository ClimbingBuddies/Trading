# REL-004 — private journal status corrections

Date: 27 October 2026. Branch: `reliability/restore-decision-pipeline`.

Implemented and tested locally; not deployed. The reconciled source retains `decisionRow` for the older private `PredictionWorkspace`. The current shared Decision Lab uses a separate implementation. These fixes address E08 in the formal review.

- Legacy `NOT_ENTERED` now reads “Not entered” and closes the plan without counting as a completed trade or scoring a return.
- A same-date data gap now shows “Missing data”, consistent with the withheld provisional return. A later verified mark restores the open status and measured return.
- Recorded exits retain their results, including losses, despite later gaps. Cancelled journals remain terminal without becoming completed trades.

All 408 repository tests passed, with zero failures or skipped tests. Four regression cases were added and the existing equal-date gap assertion strengthened. No browser verification is claimed for this unrouted legacy component. No database records, schedules, authentication settings or production deployment changed.

REL-004 remains in progress: independently reproduce current shared entries, costs, benchmarks, corrections and eligibility denominators against pinned real observations. Revert the helper/test commit to roll back this increment; no database rollback is needed.
