# Shared development — mandatory before mutations

- Read [project context](documentation/project-context.md). Run `node scripts/coordination.mjs status` at startup/resume before edits. Missing/unreadable lock state means STOP, not permission to proceed.
- If another owner holds the project-wide lock, stay read-only and report owner/task. Never infer release from stale heartbeat, session exit, crash, or an edited/closed issue.
- Enroll each clone, acquire the exclusive lock on a dedicated feature branch, review relevant journal/diffs, and acknowledge. Run `begin` before editing; `guard` before each new mutation batch and every shared-service operation. Follow [the procedure](documentation/development-coordination.md).
- Heartbeat about every ten minutes of active work and at checkpoints/scope changes. Unknown connectivity or lost ownership means stop further mutations and preserve local work. No automatic takeover or release.
- Use meaningful local commits, explicit test evidence and verified publication. Never ordinary-develop on `main` or `project/decision-lab-completion`; never force-push shared history. Successful work does not authorize integration or deployment.
- Prefer local tests/builds and synthetic data. Hosted schema/auth/scheduler/deployment work requires current lock ownership, exact environment, pending-change review and an appropriate recovery/approval gate. Code rollback is not database rollback.
- Before release, publish and verify relevant work, record the journal, inspect stashes/other worktrees/local-only branches, and attest that all work is secured. Otherwise retain ownership or use the verified handoff procedure.
- These rules govern development controllers as well as interactive agents. Existing operational jobs retain their existing authority; changing their code/configuration is development. Fresh-evidence and independent-review requirements still apply.
- Shared journal/status text is public: sanitize it. Do not publish secrets, private account/portfolio data or raw production evidence.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
