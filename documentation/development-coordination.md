# Shared development coordination and recovery

Protocol v1. Applies to both developers, both Codex instances, and any controller that changes project source/configuration. The lock is cooperative enforcement backed by atomic Git reference updates, not a security boundary against repository administrators or direct service-console edits.

## Authority and enrollment

`refs/heads/coordination` contains authoritative `state.json`, a human-readable `README.md`, append-only `journal/`, and recovery/stability evidence. Never merge it into application history, delete it, rewind it, or acquire by editing an issue. All transitions create one direct child of the observed state and push without force. Competing children cannot both advance the branch. Never rebase/merge a rejected lock transition.

Use Git and Node 24, with authenticated Git push access to `ClimbingBuddies/Trading`. The GitHub plugin can mirror the issue. No PAT is stored in this repository; use Git Credential Manager/SSH or the existing authenticated connector. Each clone needs a distinct local identity, including when both developers share one GitHub login. Cloning a working directory including `.git` is not enrollment: duplicate identities must be replaced only after any existing lease has been secured.

```powershell
node scripts/coordination.mjs init --owner "Cody" --id cody
node scripts/coordination.mjs install-hook
node scripts/coordination.mjs status
```

The other developer uses their own name/ID. State/cache/lease live under Git metadata, not tracked source. An existing hook or `core.hooksPath` is preserved; manually compose its existing checks with the coordination pre-push guard. The hook permits only the owned feature branch and rejects deletion/integration/rewrite pushes. Hook installation is local and bypassable. Admin integrations through the connector must separately check ownership and explicit integration approval.

## START: bounded inspection, then ownership

1. Run `status` before modifications, including on resume. It checks live lock, local HEAD/dirty files/stashes, remote heads, acknowledged checkpoint and the last 20 journal entries. It prints which checks ran. Lock-free is required for a new task; read-only inspection/discussion is allowed while occupied.
2. If another owner holds it, report their owner/task/heartbeat and stop mutations. If the network, state format or history cannot be established, stop. A missing coordination ref is an error, never an unlocked project.
3. Use the approved integration base, inspect divergence, and preserve unrelated local work. Fetching is allowed; checkout/merge/edit requires ownership. A new task can acquire while still on the inspected base; the script creates its feature branch only after acquisition. Dirty existing work must stay on its existing feature branch or be secured through a reviewed recovery procedure.
4. Acquire with a sanitized task, public-safe identifier and scope:

```powershell
node scripts/coordination.mjs acquire --task ui-filter --description "Improve market filtering" --scope "components,tests" --branch codex/cody-market-filter
node scripts/coordination.mjs status
```

5. Read new journal entries using `journal --path journal/000001-example.json` (exact path returned by status), inspect relevant diffs and dependencies, and read the compact context if session context is absent. A gap in the bounded index requires reading missing journal history. A moved/deleted/new branch without journal coverage requires source inspection; never treat missing summaries as no change. Schema, auth, security, cross-cutting contracts and regressions justify deeper inspection. Existing controllers' fresh-source requirements remain in force; verify blob identities and reuse content only where those requirements permit.
6. After review, acknowledge the observed state, announce task/scope, and mark editing:

```powershell
node scripts/coordination.mjs acknowledge
node scripts/coordination.mjs begin
```

Acknowledgment is an explicit agent/human assertion of review, not an automatic test pass. The script does not read all repository files. Hosted database/deployment state can change without a Git commit; inspect it whenever the task depends on it. Local cached context never substitutes for live operational evidence.

## DURING: checkpoints and activity

- Run `guard` before every new mutation batch and immediately before any push/merge/shared-service change. Loss of ownership or connectivity stops further edits; preserve completed work. A check is not a service-side transaction fence: direct console edits and already-running requests remain outside this tool's control.
- Run `heartbeat` approximately every ten minutes while actively working, before long steps, and at milestones. Run `begin` before a new editing batch so the last shared observation conservatively says `unknown-editing`. Heartbeats are point-in-time observations, not a claim that an offline tree is clean. No recurring AI task is installed. A crash leaves the lock held.
- For changed scope, run `scope --scope "components,tests" --description "Updated bounded task"` and update the warning. Cloud-only agents may use the connector sequence described below, but must not invent weaker locking.
- Make coherent local Git commits on the feature branch. Before substantial refactoring, commit a suitable working state and record exact recovery commit/compatibility. Use descriptive messages. Never blindly `git add .`; inspect staged content for credentials, generated output and private data.
- Local working, locally tested, remotely published, approved stable integration, and production are separate states. Untested commits are never marked tested or stable. Passing a focused suite proves only its recorded scope.
- Prefer local tests/builds, fixtures, mocks and simulations. Do not use production data as a routine test fixture or repeatedly deploy for basic UI checks. Local Supabase is optional and requires a reviewed runnable baseline, CLI and Docker. Do not weaken security checks to save cost.

```powershell
node scripts/coordination.mjs guard
git add -- scripts/example.mjs tests/example.test.mjs
git commit -m "Fix the bounded example behavior"
node scripts/coordination.mjs publish
node scripts/coordination.mjs heartbeat
node scripts/coordination.mjs warning
```

`publish` checks ownership, pushes only the current feature branch without force, verifies the remote SHA, and records publication. `warning` generates title/body for issue #39; update it using the GitHub connector after acquire, milestone, transfer and release, and alongside sensible heartbeat updates. Include its revision, and read it back. A failed or late issue update never changes lock ownership; state branch README is updated atomically with state. If warning publication fails before starting, repair it or keep the existing conservative active warning and report the display failure.

## FINISH: record, secure, release

Run appropriate tests, inspect results and commit final work. Publish the branch. Prepare a small sanitized journal JSON in a temporary local file:

```json
{
  "description": "Bounded outcome and why it matters",
  "databaseAndApi": "No change; otherwise list exact migration/API identifiers",
  "decisions": ["Only material architectural decisions"],
  "risks": [],
  "tests": [{"command": "node --test tests/example.test.mjs", "result": "passed", "scope": "Example behavior"}],
  "outstanding": ["PR review and integration remain pending"],
  "recovery": "Revert the specified code commit; database compatibility unchanged"
}
```

Use `not-run`/`failed` truthfully. The tool adds author/time, task, base/head SHA, changed paths, publication status and checkpoint categories. Entries are immutable files, with only the last 20 indexed for startup. Tests are author attestations; never fabricate evidence. Keep large logs/private evidence in their original protected location.

```powershell
node scripts/coordination.mjs record --file "C:\path\to\journal-entry.json"
node scripts/coordination.mjs release --attest all-work-secured
node scripts/coordination.mjs warning
```

Release refuses a dirty tree, stashes, an unverified remote HEAD, or missing journal for final HEAD. Before attesting, inspect `git worktree list`, `git branch -vv`, ignored working assets and any other relevant local-only work. The tool cannot prove that another computer contains no work. Publish unfinished but safe WIP on a feature branch/draft PR or retain the lock; do not push secrets to satisfy release. Release never means merge approval. Record the journal/PR and explicitly tell the other developer what they may resume.

For transfer, secure and publish the current state, record the journal, then `handoff --to other-id --attest all-work-secured`. The project remains reserved in `handoff` state. The recipient must inspect/fetch that exact commit on its feature branch in a clean clone and run `accept`. Acceptance changes the acquisition ID, fencing the old owner's subsequent commands. Local-only changes must first be transferred through an approved secure channel and verified by the recipient; the v1 automated path intentionally requires Git publication and otherwise retains the lock.

## Stale ownership, crashes and failures

| Failure | Behavior / required recovery |
| --- | --- |
| Simultaneous acquisition | One fast-forward succeeds; the other stops. Never merge/rebase a losing acquisition. |
| Internet loss | Stop mutations; retain work and ownership. Re-establish live state before resuming. |
| Crash/inactivity/forgotten release | Shared lock stays held. No expiry or session-exit release. |
| Stale heartbeat (30-minute display threshold) | Warning only; contact owner. It is not a lease expiry. |
| Push failed or response lost | `pending.json` retains the exact candidate. `resolve` checks ancestry. If still at its parent, diagnose then explicitly `resolve --retry` for that same candidate. If a competing state won, stop. |
| Local command sentinel survives crash | Confirm no process is running, inspect pending transition and shared state, then manually remove only the local sentinel. Never delete the shared branch. |
| Merge conflict | Retain ownership, preserve branches, resolve under review; no destructive reset/force push. |
| Migration conflict or drift | Stop hosted changes; compare migration history, exact SQL and live schema. Do not blindly replay, repair history or infer DB rollback from code rollback. |
| Deployment fails after merge | Record integration SHA and deployment ID/error separately. Production may remain on its prior commit. Diagnose; use an approved compatible rollback or forward fix. |
| Manual edits outside protocol | Remote-head checks detect Git changes at next check; hosted console changes require live inspection. Reconcile and journal before continuing. |
| Warning edit/outage | Display has no authority. Read `state.json`; repair display without changing ownership. |

Takeover is a human decision. First check the owner, published branches/PRs, journal and relevant database/deployment state, and explicitly account for inaccessible local work. Prepare approval JSON with `mode` (`owner-confirmed` or `explicit-takeover`), `authorizedBy`, `authorizationReference`, `reason`, `remoteReview`, `localWorkDisposition`, and `expectedRevision` (exact coordination SHA). Run `takeover --approval path.json` only after real authorization, on a clean recovery feature branch. This records the prior state and approval, changes acquisition ID and preserves history. A new heartbeat invalidates approval tied to an older revision. Never synthesize approval from elapsed time. The old owner must recheck before resuming; their local-only work remains recoverable and must be reconciled.

## Integration, stable checkpoints and protected services

Integration and production need explicit task authorization. Before changing Supabase/Vercel, check exact project/environment, current ownership, pending migrations/PRs, other developer impact, tests, backup/recovery and authorization for material/destructive changes. Prefer reviewed version-controlled migrations. Preserve the existing disabled automatic Vercel Git-deployment setting. No automatic destructive database rollback.

To record a genuinely approved stable integration, use `stable --approval path.json` under the lock. Required fields: `approvedBy`, `approvalReference`, full `commit`, `integrationBranch`, `recovery`, and nonempty passing `tests` with command/results/scope. The commit must match the inspected remote integration head. This records evidence, not a deployment. There is deliberately no stable initial baseline fabricated from the rollout.

Recommended optional server controls: prevent coordination deletion/force pushes, require reviewed integration, preserve security checks. These controls require separate configuration approval; they are not silently enabled by installation. A GitHub-native lock does not prevent an administrator ignoring it or revoke direct Supabase/Vercel credentials.

## Connector fallback and adoption

If local authenticated Git is unavailable, fail safely or use GitHub tools: read branch SHA and `state.json`; validate protocol/status/owner/acquisition; create updated tree and a commit with exactly that SHA as its sole parent; update `coordination` with `force=false` and `expected_sha`; read back and verify. Never retry a rejected transition with a newly chosen parent without revalidating state. Store the local lease and pending outcome; issue edits alone never suffice. Hooks cannot guard connector operations, so the same ownership/approval procedure is mandatory.

Both developers must enroll and read `AGENTS.md` before the rollout is considered adopted by both. Existing clones/branches do not magically acquire new instructions. Apply only the protocol rollout to the default and operational branches; do not merge their divergent application histories. Existing operational ingestion/evaluation jobs retain their current authority; development controllers must check this lock before source/schema/deployment mutations. Live schedules and externally stored prompts require their owners to verify adoption separately. No schedules are created, disabled or changed by this rollout.

Expected overhead: a handful of small Git reads at startup, roughly 500–1,500 context/status tokens for an unchanged session, and up to six small state commits per active hour at a ten-minute heartbeat cadence. No coordination Supabase queries, Vercel builds, Actions runs, or recurring AI wakeups. These are estimates; correctness overrides a token target.
