# QUAL-002 — Add performance budgets/query monitoring

## Audit attempt started — 25 Aug 2026, 16:31 AWST

- protocol_version: 1.3
- auditor_run_id: manual-20260825-1631-qual002
- event: AUDIT_ATTEMPT_STARTED
- project_plan_status_at_start: IN REVIEW
- implementation_commit: e7a54d452e26e784e41fefb359a532a56d5c7ca8
- affected_layers:
  - GitHub
  - Supabase
  - Vercel
  - browser
- definition_of_done: SQL time and network waterfalls are measured before optimisation.
- selected_evidence_group: Supabase/schema-data-security
- planned_checks:
  - independently query live `pg_stat_statements` for the representative PostgREST query surfaces named in the baseline
  - confirm the live statements correspond to `latest_market_status`, Markets provider metadata and owner strategy/test/review reads
  - compare live calls/mean/max timing with the persisted pre-optimisation baseline without requiring exact equality after subsequent traffic
  - verify no Supabase schema/data mutation is required for this measurement-only audit group
- current_owner: AUDITOR
- decision: PENDING

### Evidence group result — Supabase/schema-data-security

- result: VERIFIED
- statistics_window: VERIFIED — `pg_stat_statements_info.stats_reset` is `2026-07-25 02:48:24.972248+00`, which predates the QUAL-002 Builder measurements. The Auditor therefore reproduced the same cumulative statistics window rather than a reset/recreated sample.
- latest_market_status: VERIFIED — the live PostgREST statement selecting the documented market status columns remains at 8 calls, mean 78.036 ms, max 121.355 ms, exactly matching the persisted final Builder baseline.
- markets_provider_metadata: VERIFIED — the live `provider_instruments` + `data_providers` PostgREST statement remains at 93 calls, mean 1.849 ms, max 12.397 ms, exactly matching the persisted final Builder baseline.
- trading_test_runs_owner_read: VERIFIED — the live owner-scoped PostgREST statement is present with `owner_user_id` and `strategy_id` references at 14 calls, mean 1.666 ms, max 6.692 ms, exactly matching the persisted final Builder baseline.
- trading_decision_evaluations_owner_read: VERIFIED — the live owner-scoped PostgREST statement is present with `owner_user_id` and `test_run_id` references at 14 calls, mean 1.510 ms, max 6.617 ms, exactly matching the persisted final Builder baseline.
- trading_strategies_owner_read: VERIFIED — the live owner-scoped PostgREST statement is present with `owner_user_id` at 14 calls, mean 0.786 ms, max 3.826 ms, exactly matching the persisted final Builder baseline.
- provider_mapping_reference: VERIFIED WITH EXPECTED CUMULATIVE DRIFT — the live `provider_instruments` + `instruments` PostgREST statement is now 2,983 calls, mean 1.945 ms, max 16.753 ms versus the persisted baseline of 2,981 calls, mean 1.944 ms, max 16.753 ms. The two additional calls and 0.001 ms mean change are consistent with normal traffic after the baseline and the unchanged statistics-reset window.
- query_surface_identity: VERIFIED — the inspected statements are generated PostgREST `pgrst_source` reads against the exact public tables/views documented by QUAL-002; the strategy statements independently show the owner-scoping predicates expected by the production owner view.
- mutation_boundary: VERIFIED — all Auditor Supabase operations in this evidence group were read-only `SELECT` statements against statistics metadata; no schema, data, policy, function or trading-state mutation was performed or required.
- pre_optimisation_measurement_claim: VERIFIED FOR SUPABASE EVIDENCE — live cumulative statistics remain consistent with the persisted pre-optimisation baseline, and no optimisation was introduced by this audit group.

### AUDIT_CONTINUE — 25 Aug 2026, 16:35 AWST

- auditor_run_id: manual-20260825-1631-qual002
- event: AUDIT_CONTINUE
- completed_evidence_groups:
  - GitHub/source
  - Supabase/schema-data-security
- verified_checks:
  - reviewed implementation/baseline identity and no optimisation source drift
  - repeatable live SQL/PostgREST timing evidence for Markets and owner strategy surfaces
  - cumulative statistics continuity through an unchanged `pg_stat_statements` reset window
  - owner-scoped strategy/test/review query identities
  - no Supabase mutation required for the measurement-only audit
- remaining_evidence_groups:
  - Vercel/deployment — independently verify deployment `dpl_HEwx9WtekyUE13AQiXbkBWvcHs4K`, build/commit identity, `/api/performance-waterfall` deployment and production runtime health
  - browser/user-flow — independently verify persisted `performance-waterfall-v1` samples for `/markets`, `/opportunities` and `/strategies` match the documented timings/resource counts and represent real browser Navigation/Resource Timing evidence
- next_evidence_group: Vercel/deployment
- project_plan_status: IN REVIEW
- handoff_owner: AUDITOR
- decision: PENDING

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

### Evidence group result — GitHub/source

- result: VERIFIED
- handoff_manifest: VERIFIED — `documentation/project-plan.md` identifies QUAL-002 as the sole `IN REVIEW` item, names implementation commit `e7a54d452e26e784e41fefb359a532a56d5c7ca8`, lists affected layers GitHub/Supabase/Vercel/browser, records Builder checks, deployed code commit/status, Auditor checks and two explicitly classified auditor-verifiable gaps.
- reviewed_commit_identity: VERIFIED — commit `e7a54d452e26e784e41fefb359a532a56d5c7ca8` is the reviewed repository state. Relative to deployed telemetry commit `622ed826c65ada0bd326f3afdfc2829f40d8bb6d`, only `documentation/performance/qual-002-pre-optimisation-baseline.md` and `documentation/project-controller-journal.md` changed; no application source changed after the deployed telemetry code.
- telemetry_change_scope: VERIFIED — comparing the pre-telemetry production commit `dce9a26e8a5a9f3a5a616174294d19c0156fc03f` to deployed commit `622ed826c65ada0bd326f3afdfc2829f40d8bb6d` shows only the new performance receiver, the new browser reporter, mounting the reporter in `app/layout.tsx`, and controller-journal changes. No query, schema, trading or optimisation source was modified in that telemetry implementation range.
- baseline_document: VERIFIED — the reviewed baseline clearly records production query surfaces, measured SQL/PostgREST timing, all three browser navigation/resource waterfall samples, repeatability instructions, privacy/authentication boundary, and conservative pre-optimisation regression budgets.
- browser_reporter_source: VERIFIED — `PerformanceWaterfallReporter.tsx` is restricted to `/markets`, `/opportunities` and `/strategies`; uses `PerformanceNavigationTiming` and `PerformanceResourceTiming`; captures after page load; caps resources at 100; strips resource query strings/fragments by retaining origin + pathname; and sends the structured payload by beacon or keepalive POST.
- telemetry_receiver_source: VERIFIED — `app/api/performance-waterfall/route.ts` accepts POST only, validates version and fixed routes, bounds resources and names, converts numeric fields through finite-number validation, records only route/timing/resource metadata plus a coarse mobile/desktop classification, and returns no-store HTTP 204 on accepted payloads.
- reporter_mount: VERIFIED — `app/layout.tsx` mounts `PerformanceWaterfallReporter` globally; the reporter itself restricts collection to the fixed three routes.
- privacy_boundary: VERIFIED FROM SOURCE — no cookie, access token, user ID, email, query string, fragment or session identity is added to the telemetry payload. The documented limitation that authentication state is not asserted is consistent with the source.
- budget_framing: VERIFIED — browser and SQL thresholds are explicitly described as conservative regression/investigation budgets, not SLAs; the document says a breach triggers investigation/additional sampling rather than asserting a guaranteed user-facing target.
- optimisation_boundary: VERIFIED FROM GIT HISTORY — repository changes establishing telemetry and completing the baseline do not contain a query/schema/trading optimisation; optimisation is explicitly deferred to separately authorised work.

### AUDIT_CONTINUE — 25 Aug 2026, 16:27 AWST

- auditor_run_id: manual-20260825-1623-qual002
- event: AUDIT_CONTINUE
- completed_evidence_groups:
  - GitHub/source
- verified_checks:
  - complete Builder handoff manifest and reviewed commit identity
  - final performance baseline documentation and budget framing
  - genuine browser Performance API measurement implementation in source
  - bounded/privacy-preserving telemetry receiver and reporter mount
  - no optimisation source change while establishing the baseline
- remaining_evidence_groups:
  - Supabase/schema-data-security — independently reproduce the representative production `pg_stat_statements` timing evidence and confirm the recorded query surfaces correspond to live PostgREST activity
  - Vercel/deployment — independently verify deployment `dpl_HEwx9WtekyUE13AQiXbkBWvcHs4K`, build/commit identity, `/api/performance-waterfall` deployment and production runtime health
  - browser/user-flow — independently verify persisted `performance-waterfall-v1` samples for `/markets`, `/opportunities` and `/strategies` match the documented timings/resource counts and represent real browser Navigation/Resource Timing evidence
- next_evidence_group: Supabase/schema-data-security
- project_plan_status: IN REVIEW
- handoff_owner: AUDITOR
- decision: PENDING
