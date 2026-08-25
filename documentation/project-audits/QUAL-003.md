# QUAL-003 — Create operational runbook

## Audit attempt started — 25 Aug 2026, 17:58 AWST

- protocol_version: 1.3
- auditor_run_id: manual-20260825-1758-qual003
- event: AUDIT_ATTEMPT_STARTED
- project_plan_status_at_start: IN REVIEW
- implementation_commit: d3f4a80557d26503d8e208b8f87c2b7347460cc9
- affected_layers:
  - GitHub
- not_applicable_layers:
  - Supabase mutation/schema checks
  - Vercel deployment checks
  - browser checks
  - external evidence
- definition_of_done: Market-data, assessment, stale-data and deployment failure procedures are documented.
- selected_evidence_group: GitHub/source
- planned_checks:
  - independently inspect the reviewed commit and `documentation/operational-runbook.md`
  - compare all four required procedures with the current canonical pipeline/specification files
  - verify retry/idempotency, timezone, source-of-truth and analytical-independence boundaries
  - verify the runbook does not instruct operators to bypass RLS, expose secrets, fabricate current data or rewrite accepted historical evidence
  - verify `documentation/README.md` links the runbook and determine PASS/PASS WITH ADVICE or REWORK if all GitHub evidence is complete
- current_owner: AUDITOR
- decision: PENDING
