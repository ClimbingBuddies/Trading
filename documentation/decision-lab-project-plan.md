# Decision Lab — controller project plan

Updated 20 September 2026. Authoritative build status; development controller owns updates. Source: approved playbook v3. This file does not imply an active background agent.

| ID | Workstream / deliverable | Dependencies | Status | Acceptance evidence / next action |
| --- | --- | --- | --- | --- |
| F0 | Shared database foundation | None | awaiting_review | Installed; rollback privacy and immutable-call checks passed. Independent implementation review remains. |
| C1 | Versioned mechanics/dashboard contract | F0 schema inspection | accepted | v1 saved in documentation/decision-lab-data-contract.md; reviewer found no-call blocker ambiguity, resolved with separate blockedItems, paging and counts. Contract accepted; authenticated read endpoints subsequently installed and rollback-tested. |
| ENG1 | Independent review of local mechanics | Existing engine | accepted | Independent tester: 21 repository + 7 adversarial tests passed. Reviewer verified chronology/calendar fixes at SHA256 F41783DD0C84F4240F704EE1F681E5627572149221A27CF949CB49017BF6FCA2. Local mechanics only; not DB integration. |
| ENG2 | Trusted publisher and persistence adapter | C1, ENG1 fixes | in_progress | Private hash-bound publisher/candidate functions installed; privilege/registry/missing-assessment checks pass. Outcome writes intentionally gated: trusted calendar/evaluator adapter and concurrency acceptance remain. |
| D1 | Approved dashboard table and drawer | C1 | awaiting_review | Shared UI built and signed-in empty state verified on localhost:3001. TypeScript/palette checks pass. Read API rollback tests pass; populated drawer and two-user browser acceptance remain. |
| DATA1 | Data/session/benchmark readiness | C1 | queued | Supported US/ASX inputs validated; unsupported shares explicitly blocked; no guessed benchmark/currency. |
| I1 | Dashboard + mechanics integration | ENG2, DATA1, D1 | in_progress | Authenticated read projections installed and tested; live page reconciles zero calls and seven pending shares. No genuine shared call or persisted outcome yet. |
| S1 | Scheduled trading integration | I1 | queued | Existing controller/evaluator updated without duplicate ownership; run/spec IDs and recovery behavior verified. |
| A1 | Stage 1 acceptance | S1, independent test/review | queued | All required acceptance checks evidenced, at least one genuine shared call displayed, every watched share accounted for. |
| O1 | One-week observation | A1 | queued | Start/end dates recorded only after acceptance; no forced trades or invented results. |

## Milestone update record

For each update record: task ID, date/time, assigned agent, base revision/file hashes, owned paths, status, acceptance check IDs, test command/results, review findings, deployment state, blocker/next action. Append detailed evidence to `documentation/decision-lab-evidence-log.md`.

## Current bounded scope

C1/ENG1 accepted. D1 UI and authenticated read projections now integrated locally; database publication boundary installed. ENG2 remains partial: trusted calendar/outcome adapter, configured providers/benchmarks and publication acceptance required. Seven candidates need fresh published research; zero live shared calls/outcomes. Existing schedules unchanged. No observation week has started. Next bounded milestone: DATA1 plus verified evaluator persistence, then genuine shared call and populated-drawer acceptance before S1.


## Completion branch and controller

- Branch: `project/decision-lab-completion`, created from local main on 20 September 2026; existing modifications retained.
- Controller: `automation/decision-lab-development-controller.md`, executed by the lead in this task with bounded builder/tester/reviewer assignments.
- Immediate milestone: DATA1 / ENG2, validated inputs and trusted database outcome persistence. The daily trading schedule is not the development controller.
- UI follow-up: duplicate title, system-status panel and preview button removed; real legacy AVGO drawer simplified and browser-checked. Shared genuine-call browser acceptance remains outstanding.
- Counts recorded on 19 September are historical verification, not a current live database audit.
- Existing repository modifications include prerequisite personal-workflow and broader dashboard work. Scope and review those dependencies before release; a branch alone does not commit them.
