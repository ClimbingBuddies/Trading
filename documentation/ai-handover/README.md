# Trading AI handover — start here

This folder is the GitHub handover for Cody. It contains the task settings, prompts, operational inventory and cutover instructions needed to recreate the Trading cloud jobs. Both contributors retain their existing project access and input. Cody operates the AI jobs.

1. Read the [handover agreement](../ai-execution-handover.md), [project context](../project-context.md) and [development coordination rules](../development-coordination.md).
2. Read the [task inventory](task-inventory.md), then use the [configuration](configuration.json), [controller prompt](controller-prompt.txt) and [tracker prompt](progress-tracker-prompt.txt).
3. Follow the [cutover checklist and receipt](cutover.md). Use the [progress issue](https://github.com/ClimbingBuddies/Trading/issues/34) for the sanitized status.

The [historical prompt archive](historical-prompts.md) preserves previous instructions and the Trading-only part of the mixed project manager task for reference. Use the two copy-ready prompts above for new Trading jobs. The [repository automation specifications](../../automation/) remain the source of truth for stage behavior.

## Paste into your AI

> Read this handover folder in ClimbingBuddies/Trading and the latest AGENTS.md, project context, development coordination rules and AI execution handover on project/decision-lab-completion. Check the live coordination state. Using only my existing Trading access, do the read-only verification in cutover.md. Prepare the hosted 08:00 Australia/Perth Daily Trading Controller and the hosted 10:30 Australia/Perth Trading Progress Tracker from configuration.json and their prompt files. Keep prepared replacements disabled or unsaved until the handover conditions are met. Return the actual saved settings or the precise account action still required. After the coordinated cutover, validate an eligible unattended run and record the sanitized receipt in issue #34. Preserve the other contributor’s access, existing evidence and single-writer protections.

## Source and status

The inventory is a 12 November 2026 Australia/Perth snapshot. The pinned repository source for this export is [58aef86](https://github.com/ClimbingBuddies/Trading/commit/58aef864314e53b569f79c17afd05bde92a09824). The controller resolves the operational branch anew on each invocation. At the snapshot, the replacement controller and tracker were drafts and the production handover still needed an unattended-run receipt.

A GitHub collaborator can read this material directly. Each contributor uses their own authorized runtime connections. Account-bound identifiers, secrets and raw evidence remain in their protected systems.
