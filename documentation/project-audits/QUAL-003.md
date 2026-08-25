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

### Evidence group result — GitHub/source

- result: VERIFIED
- reviewed_commit_identity: VERIFIED — implementation commit `d3f4a80557d26503d8e208b8f87c2b7347460cc9` is the reviewed state and links the completed runbook from `documentation/README.md`.
- documentation_map: VERIFIED — `documentation/README.md` contains an Operational Runbook entry under Product, strategy and operations and describes the four required failure classes.
- market_data_failure_procedure: VERIFIED — the runbook correctly distinguishes Twelve Data live `quote` observations from Tiingo historical `1day` data, uses `sync_runs` plus session-aware quote freshness, preserves provider mapping identity, and directs idempotent historical upsert/retry behaviour consistent with `documentation/pipelines/market-data-pipeline.md`.
- market_ai_failure_procedure: VERIFIED — the runbook uses the current `America/New_York` assessment date, checks source freshness before preparation, reuses the returned queue/run pair, processes only missing instruments, finalises from persisted rows and does not replay historical pending work; this matches `automation/daily-market-assessment.md` and the current Market Assessment pipeline contract.
- opportunity_failure_procedure: VERIFIED — the runbook uses `Australia/Perth`, creates a distinct `opportunity_assessment_runs` record before research/writes, resumes same-date idempotent theme records, preserves Structural/Technology independence and keeps Opportunity independent of short-term Market/Technical conclusions, matching `automation/daily-opportunity-assessment.md` and `documentation/pipelines/opportunity-assessment-pipeline.md`.
- technical_engine_failure_procedure: VERIFIED — the runbook points operators to durable `technical_engine_runs`, preserves 07:15/07:45 AWST ownership, uses the bounded retry function, respects parent/child lineage and the three-attempt limit, and does not grant client orchestration access, matching `documentation/pipelines/technical-engine-operations.md`.
- stale_data_procedure: VERIFIED — the runbook explicitly distinguishes old versus stale by interval/asset/session, requires live `quote` evidence for current dashboards/Market AI, stops Market AI when current source data cannot safely support assessment, diagnoses Technical Engine history separately and does not block Opportunity merely because live quotes are stale.
- deployment_failure_procedure: VERIFIED — the runbook separates source/build failure, deployment lag, READY route failure and rollback; it requires commit/deployment identity, build/runtime evidence, route checks and database compatibility before rollback. This is consistent with the project Builder/Auditor deployment boundary.
- source_of_truth_boundary: VERIFIED — the runbook states Supabase is authoritative for persisted data/workflow state, GitHub for source/methodology and Vercel for deployment/runtime state; it requires conflicting evidence to be reconciled before production writes.
- timezone_boundary: VERIFIED — Market AI is New York-date aligned; Opportunity and Technical Engine use Australia/Perth; market-data eligibility is session-aware and the Technical Engine schedule is expressed consistently with AWST operations.
- retry_idempotency_boundary: VERIFIED — the runbook prefers documented resumable runs, prohibits parallel replacement runs where an idempotent retry exists, and preserves unique daily/current-run identities across Market AI, Opportunity, Technical Engine and historical market-data recovery.
- security_boundary: VERIFIED — the runbook explicitly prohibits exposing service-role/provider secrets, widening browser roles for orchestration, bypassing owner/RLS boundaries, or weakening security as an incident workaround; this is consistent with `documentation/security-and-operational-notes.md`.
- evidence_integrity_boundary: VERIFIED — the runbook prohibits fabricated market data, ratings, evidence, successful statuses and deployment results, and prohibits rewriting accepted historical assessment/backtest evidence to make an incident appear healthy.
- analytical_independence_boundary: VERIFIED — Market AI, Opportunity Assessment and the Technical Engine are kept analytically independent during diagnosis and recovery; convergence is only rerun after valid independent inputs exist.
- definition_of_done: VERIFIED — market-data, assessment, stale-data and deployment failure procedures are all documented with first checks, recovery actions, exit/escalation criteria and recovery evidence.
- remaining_evidence_groups: none — GitHub/source is the sole applicable layer for this documentation-only task.

## Terminal decision — 25 Aug 2026, 18:00 AWST

- auditor_run_id: manual-20260825-1758-qual003
- decision: PASS
- terminal_outcome: AUDIT_PASS_PENDING_PLAN_RECONCILIATION
- definition_of_done_verdict: VERIFIED
- remediation_required: none
- non_blocking_advice: none
- final_project_plan_status: pending project-plan write/read-back
- next_promoted_task: pending project-plan write/read-back
