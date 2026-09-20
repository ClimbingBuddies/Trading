# Shared evaluator PostgreSQL transport

`lib/shared-paper-db.mjs` owns one SERIALIZABLE transaction on an injected dedicated,
idle pg-compatible client. It reads the call identity, acquires the publisher's
instrument advisory lock, requests a trusted database snapshot, evaluates locally,
then calls the narrow private writer. No credentials, dependencies, browser routes,
schedules, database mutations or outcome-gate changes are installed by this module.
Do not pass a pool-level query method: all queries must use the same connection.

## Required database interfaces

- `private.shared_evaluation_snapshot_v1(call_id uuid)` returns JSONB
  `{snapshotToken, snapshot}`. Token is a UUID. Snapshot follows the adapter contract.
  Database owns the timestamp, complete history, numeric strings, calendar revision,
  verified provider mapping and session attribution. Observation IDs are positive
  PostgreSQL bigint strings, never JavaScript numbers or UUIDs. Event IDs remain UUIDs.
- `private.commit_shared_evaluation_v1(call_id uuid, token uuid, proposal jsonb)`
  returns `{status:'COMMITTED', callId, proposalHash, version, evaluatedThrough}`.
  It must independently validate the proposal against trusted saved inputs and
  calculations, atomically append outcomes, advance state and store a durable receipt.
  Reject stale versions, changed inputs and unsupported arithmetic. The SQL gate must
  remain closed until this validation boundary passes independent tests. The local
  adapter hash alone is not permission to write arbitrary submitted JSON.
- `private.shared_evaluation_receipt_v1(call_id uuid, token uuid)` returns that exact
  durable receipt or JSON null. Restrict all three interfaces to the trusted server
  role; never expose them through an authenticated browser RPC.

`evaluateSharedCallInDatabase(client, callId)` returns proposal and receipt only after
COMMIT is acknowledged. Precommit errors roll back; rollback failure reports both
causes and requires discarding the connection. No automatic retries occur.

A COMMIT error raises `SharedCommitUncertainError` carrying the call, token, proposal
hash, expected version and evaluation time. Discard that connection, then use
`reconcileSharedEvaluation(freshClient, error)`. An exact durable receipt confirms
commit. Missing receipt is **UNRESOLVED**, not proof of rollback: the original backend
may still finish. Operators must establish transaction termination before retrying.

Statement timeout is 30 seconds; advisory-lock timeout is 5 seconds. Transaction
snapshot isolation plus the shared advisory lock prevents mixed history; serializable
failures still require a fresh bounded controller attempt after definite rollback.

## Verification and scope

Six mock-client tests verify sequencing, zero-outcome commits, rollback, missing or
malformed acknowledgement, uncertainty reconciliation and invalid IDs. These are
transport tests, not live database integration acceptance. SQL implementation, role
privileges, concurrency, source revisions, trusted calendar coverage and actual
scheduled behavior require separate database evidence. No live writer is claimed.

20 September integration checkpoint: SQL snapshot/reference/validator/writer and audited runner are installed with release disabled. Rollback tests using real AVGO/QQQ observations and synthetic calls verified Buy/Hold/Sell, costs, stale versions, exact retries, tamper rejection, privileges and authenticated read projection. Fixtures were rolled back. Actual concurrent connections, genuine publication, populated browser acceptance and scheduled invocation remain unverified. See decision-lab-evidence-log.md.
