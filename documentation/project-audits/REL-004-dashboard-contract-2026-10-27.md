# REL-004 — shared dashboard response checks

Date: 27 October 2026. Branch: `reliability/restore-decision-pipeline`.

Implemented and verified locally; not deployed.

The shared Decision Lab previously checked only the response envelope. An items array containing null, missing instrument/original records, malformed reviews or blocker objects could pass the check and fail during rendering. Invalid counts could also enter the summary.

The view now validates its consumed dashboard fields before storing a response: instrument identity/display strings, original and latest-review identity/action/timestamps, state/data-status strings, blocker display fields, pagination cursors and nonnegative safe-integer summary counts. Duplicate call IDs and scoped call totals below the loaded page size are rejected. This is a display-safety check, not a validation of all financial evidence or backend semantics; details and action-trial results retain their separate read contracts.

Rejected responses clear the dashboard records and show the existing unavailable/unverified message. They do not become empty successful scopes, zero returns or substituted paper-cycle performance. Cancelled requests cannot replace current records.

Verification:

- All 411 repository tests passed, zero failed/skipped/cancelled.
- The affected 23-test component suite passed again after strengthening the duplicate-record fixture independently of the count check.
- Production build, TypeScript, guide asset sync and palette checks passed.
- Authenticated read-only real `shared_decision_dashboard_v1` responses passed: all scope had 4 calls / 24 blockers; watched scope had 4 calls / 22 blockers. The local saved credential file failed authentication; the previously user-supplied test account succeeded. No credentials or sessions were saved by this check; the local auth session was signed out.
- No browser interaction check is claimed for this increment. Component response/error/cancellation paths are exercised with isolated fixtures, and service compatibility was checked against the actual read interface.

No database records, jobs, authentication configuration or production deployment changed. REL-004 remains in progress for independent shared outcome calculations and eligibility evidence. Revert the component/test commit to roll back these checks; no database rollback is required.
