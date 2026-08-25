# QUAL-002 — Add performance budgets/query monitoring

## Audit attempt started — 25 Aug 2026, 16:40 AWST

- protocol_version: 1.3
- auditor_run_id: manual-20260825-1640-qual002
- event: AUDIT_ATTEMPT_STARTED
- project_plan_status_at_start: IN REVIEW
- implementation_commit: e7a54d452e26e784e41fefb359a532a56d5c7ca8
- affected_layers:
  - GitHub
  - Supabase
  - Vercel
  - browser
- definition_of_done: SQL time and network waterfalls are measured before optimisation.
- selected_evidence_group: Vercel/deployment
- planned_checks:
  - independently verify deployment `dpl_HEwx9WtekyUE13AQiXbkBWvcHs4K` is production READY and tied to deployed code commit `622ed826c65ada0bd326f3afdfc2829f40d8bb6d`
  - inspect build logs for palette, Next.js and TypeScript success and confirm `/api/performance-waterfall` is deployed
  - verify production runtime health for the deployment without performing the separate browser/user-flow evidence group
- current_owner: AUDITOR
- decision: PENDING

## Persisted prior evidence — Supabase/schema-data-security

- auditor_run_id: manual-20260825-1631-qual002
- result: VERIFIED
- `pg_stat_statements_info.stats_reset`: `2026-07-25 02:48:24.972248+00`, predating the QUAL-002 baseline.
- `latest_market_status`: 8 calls, mean 78.036 ms, max 121.355 ms — exact baseline match.
- Markets provider metadata: 93 calls, mean 1.849 ms, max 12.397 ms — exact baseline match.
- owner `trading_test_runs`: 14 calls, mean 1.666 ms, max 6.692 ms — exact baseline match and owner/strategy predicates verified.
- owner `trading_decision_evaluations`: 14 calls, mean 1.510 ms, max 6.617 ms — exact baseline match and owner/test-run predicates verified.
- owner `trading_strategies`: 14 calls, mean 0.786 ms, max 3.826 ms — exact baseline match and owner predicate verified.
- provider mapping reference: 2,983 calls, mean 1.945 ms, max 16.753 ms versus baseline 2,981 / 1.944 / 16.753; expected cumulative traffic drift.
- no Supabase mutation occurred.

## Persisted prior evidence — GitHub/source

- auditor_run_id: manual-20260825-1623-qual002
- result: VERIFIED
- Builder handoff manifest complete; reviewed state is `e7a54d452e26e784e41fefb359a532a56d5c7ca8`.
- Relative to deployed telemetry commit `622ed826c65ada0bd326f3afdfc2829f40d8bb6d`, only the performance baseline documentation and controller journal changed; no application source changed after deployment.
- Telemetry implementation consists of `components/PerformanceWaterfallReporter.tsx`, `app/api/performance-waterfall/route.ts`, and the reporter mount in `app/layout.tsx`; no query/schema/trading optimisation source was introduced.
- Reporter uses browser Navigation Timing / Resource Timing on `/markets`, `/opportunities`, `/strategies`, caps resources at 100, strips query strings/fragments, and posts structured timing data.
- Receiver validates fixed routes/version/numerics, bounds fields, logs no cookies/tokens/user IDs/emails/session identity, and returns HTTP 204 with `no-store` for accepted POSTs.
- Baseline document records SQL timing, three browser waterfall samples, repeatability, privacy/authentication boundary, and conservative regression/investigation budgets explicitly not presented as SLAs.

## Current audit state

- completed_evidence_groups:
  - GitHub/source
  - Supabase/schema-data-security
- current_evidence_group: Vercel/deployment
- remaining_after_this_group:
  - browser/user-flow
- project_plan_status: IN REVIEW
- handoff_owner: AUDITOR
- decision: PENDING
