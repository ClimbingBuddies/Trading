# STRAT-005 — Surface real strategy results

## Audit attempt started — 25 Aug 2026, 13:07 AWST

- auditor_run_id: manual-20260825-1307-strat005
- event: AUDIT_ATTEMPT_STARTED
- project_plan_status_at_start: IN REVIEW
- implementation_commit: 614d16764411b3b9ab479f16138c1402087206ec
- affected_layers: GitHub, Supabase, Vercel, browser
- definition_of_done: Frontend displays real strategy evidence and decision outcomes.
- current_owner: AUDITOR

## Independent evidence

### GitHub and frontend contract — VERIFIED

- The reviewed production deployment points exactly to commit `614d16764411b3b9ab479f16138c1402087206ec`.
- `StrategyResultsClient` uses the browser Supabase publishable client, obtains the current authenticated user, and applies explicit `owner_user_id` filters.
- The component reads the real strategy, succeeded test run and persisted decision evaluation; it performs no privileged writes and contains no service-role credential.
- The display includes strategy identity/version/status, the live-execution state, core backtest metrics, provenance, the persisted review outcome and the decision path.
- Responsive layout and colour usage are implemented with the repository's semantic CSS variables.

### Supabase truth and isolation — VERIFIED

- Trading project `glvbqcplgjdfgjyknzsa` is `ACTIVE_HEALTHY`.
- Strategy `DAILY_TREND_PULLBACK` version 1 remains `testing`; `live_execution_enabled = false`.
- Succeeded run `49a0686b-0039-42d2-97b9-83ff19edb1bd` contains 249 trades, 28.2199% total return, -8.2656% out-of-sample return, 30.9237% win rate, 1.3231 profit factor, 100.9984 expectancy, 16.2900% maximum drawdown and 0.5845 Sharpe ratio, with persisted engine, ingestion, metric-definition and snapshot-hash provenance.
- Evaluation `688f448f-05aa-4a69-aed9-4f1d5949f956` persists `VALIDATE_ROBUSTNESS / continue_testing` and the exact seven-step path: `START -> MIN_TRADES -> EXPECTANCY -> PROFIT_FACTOR -> DRAWDOWN -> OUT_OF_SAMPLE -> VALIDATE_ROBUSTNESS`.
- An authenticated owner-role read returned 1 strategy, 1 run and 1 evaluation. A different authenticated user returned 0, 0 and 0.

### Vercel and public route — VERIFIED

- Deployment `dpl_9YJXYYdU9TkhZsszS4VfZUrSFe8f` is production `READY`, aliased to `discoverbouldersmarkets.vercel.app`, at the reviewed commit.
- `/strategies` returns HTTP 200 with the authenticated Strategy Results client and secure-session loading state.
- Vercel reports no runtime errors for `/strategies` in the checked two-hour window.

### Owner-authenticated production rendering — VERIFIED

- Owner-supplied production screenshot captured on 25 Aug 2026 shows a signed-in owner session at the deployed Strategies route on a mobile viewport.
- The page visibly renders 1 strategy, 1 successful test and 1 completed review, matching the owner-scoped Supabase result.
- The real strategy identity is shown as `DAILY_TREND_PULLBACK · V1` / `Daily Trend Pullback — US Equities & ETFs`.
- The safety state visibly shows both `Testing` and `Live trading disabled`.
- The rendered backtest is `Succeeded` and displays `Continue Testing`.
- Visible figures match Supabase after presentation rounding: 249 trades, 28.22% total return, -8.27% out-of-sample return, 30.92% win rate, 1.323 profit factor and 101 expectancy.
- The two-column mobile card layout is readable without horizontal clipping, and the Midnight Blue palette uses the expected semantic visual treatment.
- The remaining lower-page provenance and seven-step path are independently supported by the verified component data flow and the exact persisted Supabase evaluation.

## Decision — PASS

STRAT-005 satisfies its Definition of Done: the production frontend displays real, owner-scoped strategy evidence and the persisted decision outcome while live trading remains disabled.

- terminal_event: AUDIT_PASS
- completed_status: DONE
- current_owner_after_promotion: BUILDER
- implementation_commit_rechecked: 614d16764411b3b9ab479f16138c1402087206ec
- deployment_rechecked: dpl_9YJXYYdU9TkhZsszS4VfZUrSFe8f / READY
- project_state_conflict: none
- data_modified: none
- trading_enabled: no
- next_task_to_promote: QUAL-001
