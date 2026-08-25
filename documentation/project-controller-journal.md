# Project Controller Journal

This file is the persistent write-first checkpoint shared by the Trading Project Plan Builder and Auditor. It is operational controller state, not audit approval.

## QUAL-002 measurement baseline completed — 25 Aug 2026, 16:12 AWST

- protocol_version: 1.3
- builder_run_id: manual-20260825-1607-qual002
- event: BUILD_CHECKPOINT
- task_id: QUAL-002
- current_status: IN PROGRESS
- completed_layer: Supabase SQL/query timing plus genuine production browser Navigation/Resource Timing
- production_deployment: dpl_HEwx9WtekyUE13AQiXbkBWvcHs4K
- deployed_commit: 622ed826c65ada0bd326f3afdfc2829f40d8bb6d
- browser_samples: `/markets` 1448.9 ms / 19 resources; `/opportunities` 1901.0 ms / 16 resources; `/strategies` 412.5 ms / 25 resources
- sql_final_read: `latest_market_status` 8 calls mean 78.036 ms max 121.355 ms; Markets provider metadata 93 calls mean 1.849 ms max 12.397 ms; owner strategy/test/review reads all <=1.666 ms mean and <=6.692 ms max
- baseline_document_commit: 6e70bed2402fefdcd2c838c92bf107ac2b437041
- baseline_document: documentation/performance/qual-002-pre-optimisation-baseline.md
- budgets_persisted: conservative regression/investigation thresholds for the three browser routes and representative SQL surfaces; explicitly not SLAs
- authentication_boundary: telemetry records no identity/session data; `/strategies` sample proves route navigation/resource timing only, while owner-scoped SQL timing is independently measured from PostgREST statements
- optimisation_applied: no
- current_owner: BUILDER
- next_action: run final source/documentation/deployment/state checks; if complete, commit the exact handoff manifest and move QUAL-002 to IN REVIEW without promoting QUAL-003
- safety_boundary: measurement/monitoring and documentation only; no query optimisation, trading-data mutation, trading-decision change or live-trading enablement occurred

## Manual build started — 25 Aug 2026, 16:07 AWST

- protocol_version: 1.3
- builder_run_id: manual-20260825-1607-qual002
- event: BUILD_ATTEMPT_STARTED
- task_id: QUAL-002
- task_title: Add performance budgets/query monitoring
- starting_status: IN PROGRESS
- intended_bounded_increment: consume the newly available genuine production `[performance-waterfall-v1]` samples for `/markets`, `/opportunities` and `/strategies`, persist the measured waterfall baseline and cache/authentication interpretation, define evidence-based pre-optimisation budgets from the browser and preserved SQL evidence, run final Builder checks, and hand off to the Auditor if the Definition of Done is complete
- current_owner: BUILDER
- resume_from: production telemetry deployment dpl_HEwx9WtekyUE13AQiXbkBWvcHs4K at commit 622ed826c65ada0bd326f3afdfc2829f40d8bb6d and SQL baseline documentation/performance/qual-002-pre-optimisation-baseline.md @ bcaaeb99d2b825e9b2da645e823eba02f03c3bbd
- safety_boundary: measurement/monitoring and documentation only; do not optimise queries, mutate trading data, change trading decisions or enable live trading

## QUAL-002 bounded increment continued — 25 Aug 2026, 15:43 AWST

- protocol_version: 1.3
- builder_run_id: manual-20260825-1533-qual002
- event: BUILD_CONTINUE
- task_id: QUAL-002
- current_status: IN PROGRESS
- completed_work: verified the committed browser Performance API instrumentation deployed successfully to production; confirmed palette, TypeScript and Next.js build success; confirmed `/api/performance-waterfall` is deployed; queried Vercel runtime logs for genuine `[performance-waterfall-v1]` telemetry
- deployment_id: dpl_HEwx9WtekyUE13AQiXbkBWvcHs4K
- deployed_commit: 622ed826c65ada0bd326f3afdfc2829f40d8bb6d
- deployment_status: READY
- genuine_browser_samples_found: 0
- exact_remaining_work: collect real production browser waterfall samples for `/markets`, `/opportunities` and `/strategies` once normal browser traffic reaches those routes; persist navigation/resource timings plus cache/auth state; define evidence-based budgets from those samples and the preserved SQL baseline; run final Builder checks; hand off only when the Definition of Done is satisfied
- next_safe_action: on the next Builder run query Vercel runtime logs for `[performance-waterfall-v1]` first; if samples exist, persist them route-by-route before doing any further work; do not optimise queries before measurement is complete
- current_owner: BUILDER
- terminal_outcome: REWORK_IN_PROGRESS
- safety_boundary: measurement/monitoring only; no query optimisation, frontend behaviour change beyond telemetry, trading-data mutation, trading-decision change or live-trading enablement occurred

## QUAL-002 deployment telemetry checkpoint — 25 Aug 2026, 15:42 AWST

- protocol_version: 1.3
- builder_run_id: manual-20260825-1533-qual002
- event: BUILD_CHECKPOINT
- task_id: QUAL-002
- current_status: IN PROGRESS
- completed_layer: Vercel deployment/build verification
- deployment_id: dpl_HEwx9WtekyUE13AQiXbkBWvcHs4K
- deployed_commit: 622ed826c65ada0bd326f3afdfc2829f40d8bb6d
- deployment_status: READY
- build_result: palette compliance passed; Next.js compiled successfully; TypeScript passed; `/api/performance-waterfall` is present as a dynamic route; deployment completed successfully
- telemetry_query: `[performance-waterfall-v1]`
- genuine_browser_samples_found: 0
- interpretation: measurement instrumentation is live and ready, but no real browser waterfall sample has reached Vercel runtime logs yet; no synthetic or HTML-fetch data is accepted as browser evidence
- preserved_sql_baseline: documentation/performance/qual-002-pre-optimisation-baseline.md @ bcaaeb99d2b825e9b2da645e823eba02f03c3bbd
- current_owner: BUILDER
- next_action: on a later Builder run read genuine production `[performance-waterfall-v1]` samples after normal browser traffic visits `/markets`, `/opportunities` and `/strategies`; persist each measured route, define budgets from the SQL/browser evidence, run final Builder checks and hand off only when Definition of Done is met
- safety_boundary: measurement/monitoring only; no query optimisation, trading-data mutation, trading-decision change or live-trading enablement occurred

## Manual build started — 25 Aug 2026, 15:33 AWST

- protocol_version: 1.3
- builder_run_id: manual-20260825-1533-qual002
- event: BUILD_ATTEMPT_STARTED
- task_id: QUAL-002
- task_title: Add performance budgets/query monitoring
- starting_status: IN PROGRESS
- intended_bounded_increment: verify deployment/build of the committed production browser waterfall instrumentation; if live, collect genuine `[performance-waterfall-v1]` samples for the fixed representative routes and persist one complete measured evidence layer; do not optimise production behaviour
- current_owner: BUILDER
- resume_from: telemetry implementation commits eef149d94b83797f7520210ec507f57c6ac9ab18, fe272e36da4f46ae63e7e60447895e61337d442b, 3a60284d36060d604a741c65cdd0d76bec8bdd10 and SQL baseline bcaaeb99d2b825e9b2da645e823eba02f03c3bbd
- safety_boundary: measurement/monitoring only; do not optimise queries, alter trading logic/data, or enable live trading

The next eligible controller is the Trading Project Plan Builder working on QUAL-002.
