# Give this to the other developer's Codex

This is the shared `ClimbingBuddies/Trading` project. Before changing anything, read the live lock at `https://github.com/ClimbingBuddies/Trading/blob/coordination/state.json` and the current `AGENTS.md` plus `documentation/project-context.md` from the operational branch `project/decision-lab-completion`.

Inspect my existing local branch, dirty files, stashes, worktrees and unpublished commits without changing them. If another developer owns the lock, report who and what, and remain read-only. Never reset, discard, auto-stash, force-push, override a stale lock, or merge the divergent `main` and operational histories to get started.

Bring the approved coordination-only changes into this clone safely. If there is existing local work, preserve it and arrange enrollment/reconciliation with the current owner before checkout/merge. Once the protocol files are available, enroll with my own name and unique ID:

```powershell
node scripts/coordination.mjs init --owner "Your name" --id your-id
node scripts/coordination.mjs install-hook
node scripts/coordination.mjs status
```

Follow `documentation/development-coordination.md`: acquire a feature-branch lock before edits; inspect only relevant new journal entries/diffs; acknowledge; run `begin`; heartbeat during active work. Before finishing, test, commit, publish, journal and verify all work is secured before releasing. Mirror the warning in issue #39 through the GitHub plugin. Integration and production deployment need separate authorization.

Confirm enrollment and disclose any existing local-only work to the owner. The protocol cannot inspect another computer or automatically enroll its Codex instance. If Git authentication or hooks are unavailable, stop and use the documented connector fallback; never silently skip the lock.
