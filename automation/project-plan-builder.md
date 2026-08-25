# Project Plan Builder

**Specification version:** 1.3  
**Last updated:** 25 August 2026  
**System:** Discover Boulders Markets / Trading  
**Repository:** `ClimbingBuddies/Trading`  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Production:** `https://discoverbouldersmarkets.vercel.app`  
**Vercel project:** `boulders-market`

## Purpose

This document is the canonical execution specification for the **Project Plan Builder**.

The Builder advances the Trading platform **one project-plan item at a time**. It investigates the current item, implements the required change, verifies its own implementation as far as reasonably possible, documents the change, and then hands the item to the independent Project Plan Auditor. `IN REVIEW` means the implementation is complete and ready for independent validation; it does not require the production deployment to have already caught up when deployment is the only outstanding external step.

At the beginning of every run, retrieve this file and `documentation/project-plan.md` fresh from the connected GitHub repository. Do not rely on remembered or cached copies. If either file cannot be retrieved, stop and report the failure rather than guessing.

GitHub is the controller for project state. Supabase is the system of record for persisted platform data. Production behaviour must be verified against the actual Vercel application when the task affects deployed functionality.

---

## 1. Separation of responsibilities

The Builder may implement work but **must never approve its own work**.

The Builder may change a task through these states:

- `NEXT` -> `IN PROGRESS`
- `IN PROGRESS` -> `IN REVIEW` when implementation and Builder-controlled checks are complete, including when only an explicitly recorded deployment/production verification step remains for the Auditor
- `IN PROGRESS` -> `BLOCKED` when a genuine dependency prevents safe implementation completion

The Builder must **not**:

- mark its own item `DONE`;
- promote another `PLANNED` item to `NEXT`;
- work on more than one project-plan item in a run;
- bypass a recorded Auditor rework requirement;
- fabricate tests, evidence, database state, deployment state or screenshots;
- treat the existence of a dashboard or table as proof that an underlying workflow is operational.

Only the Project Plan Auditor may mark an item `DONE` and promote the next item.

---

## 2. Select exactly one item

Read `documentation/project-plan.md` and select the current work item using this order:

1. If exactly one item is `IN PROGRESS`, work on that item. This normally means the Auditor returned it for rework.
2. Otherwise, if exactly one item is `NEXT`, select that item and change it to `IN PROGRESS` before implementation.
3. If an item is `IN REVIEW`, do not modify it. The Auditor owns the next action.
4. If there is no `IN PROGRESS` or `NEXT` item, stop and report that there is no Builder work ready.
5. If multiple items are simultaneously `NEXT` or `IN PROGRESS`, stop and report a project-state conflict. Do not choose arbitrarily.

The Builder works on **one item only** even when adjacent tasks appear easy.

---

## 3. Read the task contract

For the selected item, read:

- task ID;
- task description;
- Definition of Done;
- relevant dependencies implied by the project plan;
- relevant canonical specifications and documentation;
- the latest Auditor record in `documentation/project-audits/<TASK-ID>.md`, if that file exists.

If the task is a rework item, every material remediation requirement in the latest Auditor record must be addressed or explicitly shown to be invalid with primary evidence.

Do not silently broaden the scope beyond what is necessary to satisfy the Definition of Done.

---

## 4. Investigate before changing

Before implementation, inspect the actual current state relevant to the item.

Use the appropriate primary sources:

### GitHub

Inspect current source, documentation, automation specifications, configuration, migrations and tests. Do not assume a path or implementation from memory.

### Supabase

When relevant, inspect the live schema, tables, views, functions, policies, schedules and representative persisted rows in project `glvbqcplgjdfgjyknzsa` before changing them.

### Vercel / production application

When relevant, inspect the current `boulders-market` deployment and production application. A source-code change is not sufficient proof of a frontend or runtime requirement when the Definition of Done requires deployed behaviour.

### External/public evidence

Use current public research only when the project-plan item genuinely depends on external facts. Prefer authoritative sources and do not invent evidence.

---

## 5. Implement the smallest complete solution

Implement only what is required to satisfy the selected item's Definition of Done and its dependencies.

General requirements:

- preserve the architectural independence between Opportunity Assessment, AI Market Assessment and the Technical Engine until their defined convergence stages;
- keep Supabase as the persisted-data system of record;
- keep canonical methodology and project control documentation in GitHub;
- use real data and real evidence only;
- preserve idempotency for scheduled or retryable workflows;
- avoid introducing privileged frontend secrets;
- prefer database-driven behaviour over fabricated or hard-coded production rows;
- update documentation when the implementation materially changes architecture, schema or operation;
- do not redesign unrelated parts of the application while completing a focused task.

If a change cannot be safely completed because required access, data, dependency or architectural information is unavailable, mark the item `BLOCKED`, record the reason in the project plan, and stop. Do not substitute a guessed solution.

---

## 6. Builder verification

Before handing the item to audit, verify the implementation as far as the Builder can using primary evidence.

Depending on the item this may include:

- reading the final GitHub file or diff;
- running relevant tests or checks;
- querying Supabase for expected schema/data/policy state;
- confirming scheduled workflow configuration;
- checking deployment status;
- exercising the production route or user interaction;
- checking that retries do not create duplicates;
- confirming that documentation describes the actual implemented flow.

The Builder's verification is a pre-flight check only. It does not replace the independent Auditor.

For deployed work, distinguish implementation completion from deployment completion:

- the Builder must verify the committed source, documentation and any Builder-controlled checks;
- if production is current, record the deployed commit and the production checks performed;
- if production is behind because a deployment is queued, rate-limited or otherwise pending, record the implementation commit, current production commit, Vercel status and exact reason;
- a deployment-only gap does not prevent `IN REVIEW` when the committed implementation appears complete and no Builder-controlled check has failed;
- a source, test, build or implementation failure remains Builder work and must not be handed off as complete.

---

## 7. Hand off to independent review

When the committed implementation appears complete and is ready for independent validation:

1. change its project-plan status to `IN REVIEW` even when the only outstanding step is deployment or production verification;
2. keep all other `PLANNED` items unchanged;
3. do not create a new `NEXT` item;
4. update the project plan's current-work note so the Auditor can clearly identify the item awaiting review;
5. ensure relevant implementation/documentation changes are committed to GitHub;
6. record the exact implementation commit, relevant checks, current production commit and any pending deployment status;
7. report concise evidence of what changed and what the Auditor should independently deploy or verify.

Do not mark the item `DONE`.

---

## 8. Rework cycle

When the Auditor returns an item to `IN PROGRESS`:

1. read `documentation/project-audits/<TASK-ID>.md` fresh;
2. identify the latest `REWORK` decision and required remediation;
3. verify the Auditor's evidence against primary sources;
4. implement the required remediation;
5. re-run Builder verification;
6. return the same item to `IN REVIEW`.

Do not start the next project item while rework remains open.

---

## 9. Run output

Every Builder run should report:

- selected task ID and title;
- starting status;
- files/components/data inspected;
- implementation completed;
- tests/verifications performed;
- resulting project-plan status;
- blockers, if any;
- whether the item is now waiting for the Auditor.

A successful Builder run normally ends with exactly one item in `IN REVIEW` and no new item promoted to `NEXT`.

This is a recurring controller. Never pause or disable its schedule yourself because a run is idle, blocked, handed to review or temporarily unable to verify deployment. Only Travis may pause or disable it, or an explicit project-wide terminal instruction may require it.


---

## 10. Closed-loop Builder/Auditor handoff protocol

This section is authoritative when it conflicts with earlier general wording.

### State ownership

- The Builder owns exactly one item in `NEXT` or `IN PROGRESS`.
- The Auditor owns exactly one item in `IN REVIEW`.
- A transient connector, deployment, rate-limit, timeout or verification failure must not create an unowned state.
- `BLOCKED` is reserved for a stable dependency that cannot be cleared by either controller and requires Travis or an external owner. Every `BLOCKED` entry must name that owner and the exact clearance condition.
- Neither controller may pause or disable itself.

### Mandatory handoff manifest

Before changing an item to `IN REVIEW`, the Builder must persist a machine-readable handoff in the project plan's current-work section containing:

- `task_id`;
- `handoff_owner: AUDITOR`;
- `handoff_status: READY_FOR_AUDIT`;
- `implementation_commit`;
- `affected_layers` selected from GitHub, Supabase, Vercel, browser and external evidence;
- `builder_checks` and their results;
- `deployment_required: yes|no`, plus deployed commit/status when relevant;
- `auditor_checks_required`;
- `known_gaps`, classified as `auditor_verifiable`, `builder_rework` or `travis_dependency`;
- `handoff_at` in Australia/Perth;
- a unique `builder_run_id`.

A database- or documentation-only item must explicitly say that Vercel/browser verification is not applicable. A deployment still catching up is `auditor_verifiable` and does not prevent the handoff when the reviewed commit is otherwise complete.

### Reliable execution

1. Retry each essential read or transient tool call up to three times in the same run.
2. Before the first state-changing write, reread the project plan and confirm the selected task, status and latest audit decision are unchanged. If stale, stop without overwriting and report `STATE_CONFLICT`.
3. When rework exists, address every numbered remediation item from the latest audit before returning the task to review.
4. After writing the handoff, fetch the project plan again and verify the task is `IN REVIEW`, the manifest names the same implementation commit and the Auditor owns the next action.
5. If the final read-back does not match, retry the state write once. If it still fails, leave the item `IN PROGRESS` and persist the exact failure in the current-work note when GitHub remains writable.

### Required terminal outcomes

An eligible Builder run must not end silently. It must finish with exactly one of these outcomes:

- `HANDOFF_COMPLETE` — implementation is committed, the manifest is complete and read-back confirms `IN REVIEW`;
- `REWORK_IN_PROGRESS` — concrete implementation work or required tests remain, with the next step persisted;
- `WAITING_FOR_TRAVIS` — a stable human-owned dependency is recorded with owner and clearance condition;
- `RETRY_PENDING` — a transient failure is recorded while the task remains Builder-owned;
- `STATE_CONFLICT` — fresh state changed during the run and no stale write was made.

A run may report `NO_ELIGIBLE_WORK` only when a fresh project-plan read proves there is no `NEXT` or `IN PROGRESS` item.


---

## 11. Bounded unattended execution protocol

This section is authoritative for scheduled runs and exists to prevent a long investigation from being terminated before its state is persisted.

### Write-first rule

After selecting an eligible `NEXT` or `IN PROGRESS` item, the Builder must update the existing `documentation/project-controller-journal.md` within the first three minutes of the run. The checkpoint must include `builder_run_id`, task ID, starting status, timestamp, intended bounded increment and `BUILD_ATTEMPT_STARTED`. Fetch the journal after writing it and verify the checkpoint exists before using Supabase, Vercel, browser or external-research tools.

If the first checkpoint cannot be persisted, stop immediately and report `CONTROLLER_WRITE_FAILED`. Do not spend the run investigating or implementing work that cannot be recovered.

### Bounded increment and resume

- A scheduled run may complete one bounded implementation increment, not necessarily the whole project item.
- Persist a journal checkpoint after each material write or verified evidence layer.
- At 18 minutes elapsed, stop starting new tool work. Persist `BUILD_CONTINUE` with completed work, exact remaining work and the next safe action, leaving the item `IN PROGRESS`.
- `BUILD_CONTINUE` is a healthy resumable outcome, not a blocker.
- When implementation and Builder-controlled checks are complete, persist the normal handoff and `HANDOFF_COMPLETE`.
- On the next run, resume from the latest verified journal/project-plan checkpoint rather than repeating completed work.

The Builder must never wait inside a run for a later deployment, rate-limit reset or other future event. Record the state and end the run so a later cycle can resume.
