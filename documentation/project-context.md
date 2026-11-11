# Trading: compact development context

Start with `node scripts/coordination.mjs status`. [The coordination branch](https://github.com/ClimbingBuddies/Trading/tree/coordination) owns the exclusive lock; [issue #39](https://github.com/ClimbingBuddies/Trading/issues/39) mirrors its warning. Neither a stale heartbeat nor a quiet chat makes the lock free.

## Systems and current baseline

- Source: `ClimbingBuddies/Trading`; local paths are developer-specific.
- Hosted database: Supabase `Trading`, ref `glvbqcplgjdfgjyknzsa`.
- Hosting: Vercel `boulders-market`, project `prj_zv4iseh9nZkopOywNBJhQfPFpErZ`, team `team_rXHFty3emwyxvCKz00B0jgUy`.
- Production URL: https://discoverbouldersmarkets.vercel.app.
- On 9 November 2026 discovery, remote `main` was `3a2719519b22b266cdac9b9e54296c11ce2594bb`; production reported `84a40702f4beaa7f11359772682b36d5831d23c1` on `project/decision-lab-completion`. Histories diverged (14 / 28 commits). The coordination rollout does not reconcile application histories.
- Use `project/decision-lab-completion` as the approved operational development baseline until a separately reviewed reconciliation. Check remote heads afresh; these observations are not a timeless stability guarantee.
- There is no verified stable integration baseline yet. Production READY is deployment evidence, not proof that all business workflows or database recovery paths work.

## Read only what the task needs

| Question | Canonical source |
| --- | --- |
| Development lock, checkpoints, handoff, recovery | [Coordination procedure](development-coordination.md) |
| What changed since my checkpoint? | `coordination` branch `journal/`, indexed in `state.json`; then relevant Git diffs |
| Architecture and analytical independence | [Architecture](platform-architecture.md), [assessment overview](assessment-system-overview.md) |
| Database/auth/security | [Data model](supabase-data-model.md), [security notes](security-and-operational-notes.md), live schema when needed |
| UI and public contracts | [Route map](frontend-route-map.md) |
| Incidents and recovery | [Runbook](operational-runbook.md), existing GitHub issues |
| Delivery gates and independent audit | Relevant plan/controller under `automation/` and `documentation/` |
| Required documentation changes | [Development workflow](development-workflow.md) |

## Boundaries

Both contributors retain equal project input and existing access. Cody is the designated AI execution operator (accounts, prompts and schedules); this is not sole project ownership. Follow [the AI execution handover](ai-execution-handover.md) for inventory and controlled scheduler cutover. Repository prompt changes alone do not transfer hosted tasks.

Market, Technical and Opportunity assessments remain analytically independent. Preserve immutable decision evidence and owner access boundaries. Never fabricate data or infer success from an empty UI. Production database history includes SQL from `scripts/` as well as migration files; do not blindly replay or repair migration history.

Local unit tests: `npm test`. Coordination tests: `node --test tests/coordination.test.mjs`. Local build: `npm run build` with the required safe local configuration. Install the locked dependencies with `npm ci --ignore-scripts` where needed. Some isolated SQL tests need PGlite; full Supabase needs its CLI and Docker. Missing tools/evidence must be reported, not replaced with production experiments. Coordination itself needs no npm dependencies or hosted builds.
