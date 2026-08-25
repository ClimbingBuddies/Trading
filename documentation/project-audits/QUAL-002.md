# QUAL-002 — Add performance budgets/query monitoring

## Audit attempt started — 25 Aug 2026, 16:23 AWST

- protocol_version: 1.3
- auditor_run_id: manual-20260825-1623-qual002
- event: AUDIT_ATTEMPT_STARTED
- project_plan_status_at_start: IN REVIEW
- implementation_commit: e7a54d452e26e784e41fefb359a532a56d5c7ca8
- affected_layers:
  - GitHub
  - Supabase
  - Vercel
  - browser
- definition_of_done: SQL time and network waterfalls are measured before optimisation.
- selected_evidence_group: GitHub/source
- planned_checks:
  - validate the Builder handoff manifest and reviewed implementation identity
  - inspect the reviewed commit/diff and final performance baseline document
  - inspect the production telemetry reporter/receiver source and privacy boundary
  - verify the documented measurement method and budgets are evidence-based pre-optimisation regression/investigation thresholds rather than claimed SLAs
  - identify the remaining required evidence groups without performing them in this run
- current_owner: AUDITOR
- decision: PENDING
