# Recommendations controller handoff

Prepared 13 September 2026. This is a proposed next-work handoff, not an instruction to restart the completed dashboard controller or change its accepted gates.

## Owner intent
The dashboard tab is Recommendations. It displays the owner's selected watchlist shares, their latest published AI view, and weekly/monthly buy and sell plans. Keep the compact two-row controls and table. Create watchlist and Add share remain popups. Decision Lab owns performance tracking and its next design phase is deferred.

The owner wants prospective AI recommendations whose original predictions can never be rewritten, backdated or selectively removed, allowing later comparison against an explicit benchmark.

## Existing implementation and table mapping
- components/WatchlistsClient.tsx: shared Recommendations and standalone Watchlists UI.
- components/MyDashboardClient.tsx: Recommendations tab, route key remains recommendations.
- lib/watchlist-recommendations.mjs: rating display and exact assessment/horizon plan matching.
- scripts/prediction-ledger-v1.sql: additive prediction schema, publication, evaluation, ownership and immutability.
- scripts/test-prediction-ledger.mjs: focused ledger verification.
- components/PredictionWorkspace.tsx: existing Decision Lab display.

| Table | Purpose / key fields |
| --- | --- |
| watchlists | Owner's personal lists; id, owner_user_id, name, is_default |
| watchlist_items | Selected shares; watchlist_id, instrument_id, added_at, notes, sort_order |
| instruments | Share identity and eligibility; id, symbol, instrument_name, currency_code, is_active |
| gpt_market_assessments | Published source research; assessment_id, instrument_id, run_id, rating, summary, key_risks, model_version, created_at |
| gpt_market_runs | Server-side source eligibility; scheduled mode, succeeded/partial status, completed_at, analysis_cutoff_time |
| personal_prediction_tracking | Owner enrollment; owner_user_id, started_at |
| personal_prediction_plans | Immutable plan; owner, instrument, assessment, published_at, source_cutoff, action, horizon_sessions, entry/exit rules, thesis, risks, model identity, source snapshot, benchmark, provider, costs, methodology |
| personal_prediction_results | Append-only evaluation evidence; prediction_id, owner, status, entry/exit observations, net return, benchmark return, reason |

UI columns: Share from instruments; AI view from the latest available published assessment; Buy/Sell plan from the SAME assessment and chosen horizon; Details from recorded thesis and risks. Missing research or plans stay explicitly missing. Do not borrow an old plan to make a new assessment appear actionable.

## Existing data and limits
The schema and implementation above are repository evidence. Reinspect live Supabase project glvbqcplgjdfgjyknzsa before claiming current row counts, freshness, scheduler health or coverage. Do not treat a prior screenshot as a live inventory.

The current ledger tests an AI rating using NEXT_COMPLETE_DAILY_CLOSE entry and FIXED_SESSION_HORIZON exit (5 or 20 market sessions), with 0.1% modelled cost per side. It does NOT generate AI-selected entry/exit dates or price targets. The SQL constrains these rule values, so adaptive timing cannot be added by merely changing display text.

Source assessments may be missing or stale. Availability of instruments is not proof of current research, usable prices, benchmark coverage or forecast quality. QQQ is explicitly named where eligible; it is not a universal market benchmark.

The older personal_recommendation_snapshots/sources/events specification belongs to the previous dashboard workflow. Do not assume it is the data contract consumed by this redesigned tab.

## Proposed next controller scope
1. Reconcile current GitHub main, working tree, deployed application and live schema. The old automation/my-dashboard-agentic-controller.md points at a different local checkout and its project is MY_DASHBOARD_PROJECT_COMPLETE; create an explicit new bounded plan/handoff before scheduling new work. Do not reopen accepted gates implicitly.
2. Verify source coverage and freshness for the owner's selected shares, plus usable daily price and benchmark/provider/currency coverage. Report exact missing inputs.
3. Define a versioned AI timing contract: publish time, evidence cutoff, weekly/monthly horizon, buy window or trigger, sell window or trigger, expiry/no-entry behavior, thesis, risks, model identity and source lineage. Specify how conflicts, missing sessions and revisions are handled before implementation.
4. Add an additive migration if the approved timing contract exceeds the fixed-rule schema. Preserve all historical plans/results and owner access controls.
5. Publish each forecast before its eligible entry observation. A new forecast is a new immutable record; no hindsight changes to the original. Retain failed, losing, expired and non-buy calls.
6. Verify idempotency, publication freshness, exact plan/source matching, missing-data behavior and reproducible evaluation with focused tests. Do not claim the model beats a benchmark without adequate forward outcomes.
7. Keep Decision Lab's redesign out of this implementation phase; preserve its existing evidence and provide the data contract for its next phase.

## Handoff status
UI and fixed-rule tracking foundation: implemented.
AI-selected buy/sell timing: not implemented.
Fresh source coverage and current live job/data health: require a fresh controller audit.
New controller schedule/activation: not performed by this handoff.