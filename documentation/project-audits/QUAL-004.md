# QUAL-004 — Add documentation checklist to development workflow

## Audit attempt started — 25 Aug 2026, 18:44 AWST

- protocol_version: 1.3
- auditor_run_id: manual-20260825-1844-qual004
- event: AUDIT_ATTEMPT_STARTED
- project_plan_status_at_start: IN REVIEW
- implementation_commit: 08ccdfb26474ba0b69623759e2967dda9f741ada
- affected_layers:
  - GitHub
- not_applicable_layers:
  - Supabase mutation/schema checks
  - Vercel deployment checks
  - browser checks
  - external evidence
- definition_of_done: Significant architecture/schema changes include documentation updates.
- selected_evidence_group: GitHub/source
- planned_checks:
  - independently inspect the reviewed commit and all QUAL-004 workflow files
  - verify significant architecture/schema changes cannot legitimately select the no-documentation option
  - verify the reviewer rework gate is explicit and actionable
  - verify the trigger-to-canonical-document mapping matches the repository documentation structure
  - verify root README and documentation index expose the Development Workflow and the PR template points to the canonical file
  - determine PASS/PASS WITH ADVICE or REWORK if the sole applicable GitHub evidence group is complete
- current_owner: AUDITOR
- decision: PENDING
