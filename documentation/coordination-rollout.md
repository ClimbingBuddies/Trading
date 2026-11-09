# Coordination rollout verification — 9 November 2026

Scope: shared development coordination only. No application runtime, database schema/data, hosted schedule, deployment or branch-protection settings changed. Application histories on `main` and `project/decision-lab-completion` remain separate. The coordination branch is never merged into application history.

## Evidence

- Fifteen coordination safety cases passed against isolated local bare Git repositories. The final full-suite run included fourteen cases; a targeted additional case verified nested-directory identity resolution and rejection of different fetch/push destinations after that final small correction.
- Covered competing acquisition, stale/crashed owner persistence, dirty/stashed/unpublished-work release refusal, lost responses, explicit same-candidate retry, competing-transition rejection, verified handoff, revision-bound takeover, old-owner fencing, bounded journal/change awareness, missing/malformed/offline state, warning independence, preserved hooks, protected/deletion push rejection, stable-evidence gates and scope ownership.
- `node --check scripts/coordination.mjs` and `git diff --check` passed.
- Broader `node --test --test-reporter=tap tests/*.test.mjs`: 378 tests, 376 passed, two failed. Both failures refer to the old embedded Decision Lab tab: `dashboard Decision Lab branch renders only shared compact workspace` and `MYDASH-002 shell exposes combined watchlist and accessible private tabs`. Their test files and `components/MyDashboardClient.tsx` are unchanged from the operational baseline `84a40702f4beaa7f11359772682b36d5831d23c1`. They are recorded as existing baseline failures, not silently waived or repaired here.
- Fresh-checkout `npm ci --ignore-scripts` failed because the existing lockfile lacks optional Sharp-related entries. Only the lockfile's existing TypeScript version, 5.9.3, was installed into ignored local `node_modules` to run existing test imports. No manifest/lockfile changes were made.
- Real GitHub verification uses the approved bootstrap lock, fresh read-back, owner heartbeat, feature publication, journal and safe release. Final remote commit/PR identities live in the coordination journal to avoid self-referential commit metadata in this document.

## Operational limits

- No full-application stable integration checkpoint is asserted. Focused coordination evidence does not establish production business health or database recovery compatibility.
- Local pre-push guard is installed for Cody's clone. The other developer must enroll, preserve any pre-existing local work and confirm adoption. External development-controller prompts/schedules require owner-side adoption; no live schedule was edited.
- Issue #39 mirrors the authoritative branch state. Issue edits can lag and never grant ownership.
- No server-side rulesets were enabled. The lock and hook are cooperative controls, not protection against an administrator or direct Supabase/Vercel console edits. Such controls require separate configuration approval.
- No application build or deployment was necessary for this scripts/documentation change. Local Supabase/Docker setup and application lockfile repair remain separate work.

Recovery: preserve the coordination history and any held lease. If a script defect is found, stop mutations and inspect `state.json`/pending transitions before repair. Do not delete the branch or bypass the lock to roll back instructions. Revert protocol code only through an owned, reviewed feature change after securing both developers' work; no database rollback is involved.
