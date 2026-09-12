# Supabase Data Model

## Personal prediction ledger (12 September 2026 change)

`scripts/prediction-ledger-v1.sql` is the additive migration source for the new prediction workflow. It is independent of the older, undeployed personal-decision tables. `personal_prediction_tracking` records an authenticated owner's enrolment time. `personal_prediction_plans` preserves every supported watched-equity/ETF AI call, its original source snapshot and publication time, and separate 5/20-session timing rules. `personal_prediction_results` stores append-only evaluation states and frozen entry/exit evidence. All three tables have owner-only SELECT policies; browser writes are restricted to the no-argument enrolment RPC. Plan, result and enrolment updates/deletes are rejected by triggers.

Publication starts with assessments created after enrolment and watchlist addition; it never backfills historical calls. A private publisher and evaluator run every 15 minutes for explicitly enrolled owners. The first methodology is `ai-rating-fixed-horizon-v1`: AI supplies the rating and reasoning, while timing is a disclosed fixed rule, not a model forecast. QQQ is the named USD comparison where available, not a universal market benchmark. Missing or inconsistent session/price evidence withholds returns. See the prediction workflow section of the operational runbook.

**Project:** `glvbqcplgjdfgjyknzsa`  
**Last reconciled against production:** 25 August 2026

This document is the current logical model. Exact columns, constraints and function bodies remain authoritative in Supabase production and the committed migrations. Dynamic row counts are intentionally omitted because they become stale; operational dashboards and audit records provide point-in-time evidence.

## Market-data foundation

| Tables | Purpose |
|---|---|
| `data_providers`, `provider_instruments` | Provider identity and instrument mappings |
| `instruments` | Canonical instrument universe and active/inactive state |
| `market_observations` | Timestamped price/volume observations |
| `sync_runs` | Loader lifecycle, counts, timing and errors |
| `historical_backfill_batches`, `historical_backfill_queue` | Controlled history backfill and retry state |

Thirty instruments are active in the production assessment universe. Additional inactive/history-bearing instruments are retained deliberately.

## Independent short-term Market system

| Tables | Purpose |
|---|---|
| `technical_indicators` | Versioned deterministic indicator snapshots |
| `market_scores` | Versioned Technical component/overall/confidence results |
| `technical_engine_runs` | Scheduled/manual/retry telemetry |
| `gpt_market_runs` | AI Market run lifecycle and methodology metadata |
| `gpt_market_assessments` | Independent per-instrument AI result |
| `gpt_market_evidence` | Evidence linked to the AI result |
| `market_assessment_queue`, `market_assessment_schedule_log` | Trusted orchestration and schedule history |
| `market_convergence_assessments` | Versioned combination of independent Technical and AI results with source lineage |
| `market_convergence_runs` | Cutoff, freshness, skip, retry and terminal telemetry |

The Technical and AI branches are independent until Convergence. Published Market reads are restricted to completed non-test output and approved columns; control state and writes remain internal.

## Long-term Opportunity system

| Tables | Purpose |
|---|---|
| `opportunity_themes` | Long-term research themes |
| `structural_opportunity_signals` | Independent structural/economic signal |
| `technology_inflection_signals` | Independent technology-enablement signal |
| `technology_inflection_events` | Source-level real-world evidence |
| `opportunity_assessments` | Convergence of the two long-term signals |
| `opportunity_theme_instruments` | Exposure mapping to tracked instruments |
| `opportunity_theme_external_instruments` | Exposure mapping outside the active market universe |
| `opportunity_assessment_runs` | Invocation, completion, counts, errors and methodology |
| `assessment_research_documents` | TipTap-compatible explanatory research |
| `assessment_research_embeds` | Structured articles, charts, indicators, images and links |

Daily theme rows are idempotent while each execution receives its own run record. Opportunity outputs do not consume short-term Market conclusions.

## External opinion

| Tables | Purpose |
|---|---|
| `opinion_sources` | Canonical approved source identity |
| `opinion_reviews`, `opinion_source_review_results` | Collection/review lifecycle and per-source outcome |
| `instrument_opinions` | Atomic instrument-level opinion evidence |
| `instrument_opinion_consensus`, `opinion_consensus_members` | Derived consensus with explicit member lineage |
| `market_opinions` | Retained compatibility/scaffold table; not a substitute for the canonical lineage model |

The model prevents atomic evidence and its derived consensus from being double-counted.

## Private user monitoring

| Tables | Purpose |
|---|---|
| `watchlists`, `watchlist_items` | Private permanent-user lists and membership |
| `alerts` | Private owner alert definitions |
| `alert_events` | Owner-visible, evaluator-written event history |
| `alert_evaluation_state` | Internal transition/deduplication state |
| `alert_evaluator_runs` | Evaluator reason, filters, status, counts and errors |
| `user_market_preferences` | Permanent-user base currency, default research horizon and optional presentation preference for My Dashboard |
| `user_market_interests` | Permanent-user instrument or Opportunity-theme research interests; interests are not Buy recommendations |
| `personal_recommendation_snapshots` | Immutable owner-scoped research-relevance results with category, horizon, thesis, principal risks, confidence, quality, cutoff, methodology and source hash; categories cannot encode Buy or Sell and database triggers reject later update/delete |
| `personal_recommendation_sources` | Immutable source-lineage rows separated into Market AI, Technical, Opportunity and External Fact families with source identity, cutoff and methodology; database triggers reject later update/delete |
| `personal_recommendation_events` | Append-only owner watch, dismiss and feedback history; browser callers use a constrained RPC and database triggers reject later update/delete |

My Dashboard preference/interest, recommendation, Watchlist and alert ownership references `auth.users.id`. Anonymous users and other authenticated users cannot access an owner's rows. Recommendation snapshots and sources are browser read-only; events are browser read-only except through `append_personal_recommendation_event_v1`, which derives the permanent owner, verifies parent ownership and accepts only watch, dismiss or feedback. Paper-decision capture remains unavailable until MYDASH-006. Clients cannot forge alert event history. Approved producers and cron trigger evaluation; deterministic event keys prevent duplicates.

Recommendation generation uses a private service-role-only source selector. It accepts an explicit owner, instrument and cutoff; derives relevance from that owner's watchlists, active portfolios and explicit interests; and returns only completed, cutoff-bounded Market AI, Technical and Opportunity evidence with exact record, methodology and dependency identities. Market AI chronology comes from the owning run's required `analysis_cutoff_time`, never assessment-row creation time. Market AI and Technical freshness counts distinct canonical Tiingo `1day` observation session keys after the latest session at or before the source cutoff and through the generation cutoff. The selector reports the calendar unavailable unless exactly one active Tiingo mapping and a source-session anchor exist, causing downstream positive eligibility to fail closed. It is not a browser RPC and does not convert Opportunity evidence into a Buy label.

### Local unapplied MYDASH-006 capture candidate

`20260906120500_my_dashboard_decision_capture_v1.sql` proposes immutable `personal_decisions` and append-only `personal_decision_events`. AI-signal capture derives its instrument, action, complete source snapshot and decision clock from an independent succeeded Market assessment and its required run `analysis_cutoff_time`. User-paper capture derives its decision/source cutoff from one server clock and accepts only the explicit action, instrument, horizon, bounded simulation assumptions and optional note. Both use the approved `NEXT_DAILY_CLOSE` entry rule and `personal-forward-return-v1` calculation identity; neither resolves entry prices or evaluates returns in this phase.

The candidate enables owner-select RLS, rejects anonymous callers, withholds browser table writes, prevents update/delete through immutable triggers, constrains authenticated capture and event appends through security-definer RPCs, permits at most one EXIT/CANCEL terminal event and adds the same-owner decision foreign key for paper portfolio positions. AI capture is eligible only from run completion until the first later canonical Tiingo daily observation; missing/ambiguous mappings and invalid run clocks fail closed. A partial owner/source unique key makes direct and concurrent identical retries idempotent, while divergent immutable assumptions are rejected. The UI obtains eligible assessment IDs from a permanent-user RPC whose query mirrors the authoritative capture predicate. Strategy Laboratory records are not reused because their test-run semantics do not match the personal forward-decision ledger. The migration is local and unapplied; isolated database policy, ACL, cross-user and atomic execution remain required before the gate can pass.

### Local unapplied MYDASH-007 return-evaluator candidate

`20260906143500_my_dashboard_return_evaluator_v1.sql` proposes immutable owner-scoped `personal_return_snapshots` with the approved OPEN/5D/20D/60D/EXIT identities, exact market/FX/benchmark observation references, nullable calculation outputs, ordered quality states, source hash and `personal-forward-return-v1` version. A composite parent-owner foreign key anchors every snapshot to its private decision. Permanent authenticated owners receive SELECT only; anonymous and browser writes are denied; only the service role may write or invoke the internal resolver.

`resolve_personal_decision_entry_v1` requires a persisted non-future evaluation cutoff, the decision's own `NEXT_DAILY_CLOSE` contract and exactly one active Tiingo mapping. It selects the first distinct canonical `1day` session strictly after that decision's clock and at or before the cutoff. Ambiguous/missing mapping returns `MAPPING_REQUIRED`; absent eligible evidence returns `PENDING_ENTRY`; neither path fabricates a price.

The internal INSERT-only `private.evaluate_personal_return_checkpoint_v1` now selects OPEN, exact 5D/20D/60D sessions and event-bounded EXIT evidence without looking past its persisted cutoff. It calculates raw close return and unrounded fee/slippage simulation only for BUY decisions; other actions remain explicitly observational. Same-currency base returns are complete while unavailable FX, benchmark and corporate-action evidence remains null and reasoned. Its SHA-256 source identity binds immutable decision evidence and selected observations; identical retries return the existing snapshot and divergent conflicts raise `CALCULATION_ERROR` without mutation. Exact FX/benchmark resolution, drawdown, scheduling and UI remain later phases. The migration is local and unapplied; isolated database/RLS/function execution is not claimed.

## Strategy laboratory

| Tables | Purpose |
|---|---|
| `trading_strategies` | Private owner strategy identity, version, rules and live-enabled state |
| `trading_test_runs` | Immutable backtest/paper/live provenance and metrics |
| `trading_decision_trees` | Standard or owner decision-tree identity |
| `trading_decision_nodes`, `trading_decision_edges` | Ordered decision rules and transitions |
| `trading_decision_evaluations` | Persisted inputs, path and review outcome |

The first real strategy, backtest and evaluation are persisted. Its review outcome is `VALIDATE_ROBUSTNESS / continue_testing`; live execution remains disabled. Owners can read their evidence through RLS, while trusted database/service logic creates review outcomes.

## Supporting schemas and extensions

- `auth` — Supabase users, identities, sessions and authentication state.
- `cron` — active database schedules and execution ownership.
- `vault` — encrypted provider secrets used by trusted server-side paths.
- `net` — supported `pg_net` extension objects and HTTP queues.
- `storage` and `realtime` are available platform schemas but are not primary Trading data stores.

## Access model

- RLS is enabled on application-owned public tables.
- Public output is deliberately classified rather than opened by default.
- Permanent-user workspaces combine authenticated access with owner predicates.
- `service_role` and trusted database ownership are reserved for loaders, calculation, orchestration and evaluator writes.
- Views and RPCs must preserve the same source-table boundary.
- Frontend code uses the publishable key and never a service-role/provider secret.

## Canonical detail

### Local unapplied MYDASH-004 candidate

`20260903023351_my_dashboard_issuer_identity_v1.sql` proposes trusted `canonical_issuers` and effective-dated `instrument_issuer_mappings` relations for issuer-concentration calculation. The candidate is not deployed or seeded. It keeps browser roles denied, enables and forces RLS on both relations, requires lowercase whitespace/control-free canonical issuer keys and trimmed control-free display names, requires canonical non-empty source and methodology labels plus an already-trimmed, whitespace/control-free public credential-free HTTPS provenance URL when one is supplied, distinguishes required issuer identity from explicitly not-applicable instruments, retains mapping history, keeps canonical-issuer update timestamps current through a dedicated security-invoker trigger function with an empty search path and denied browser execution, prevents overlapping validity windows for one instrument, enforces one current mapping and indexes both foreign-key and validity lookups. The local trusted evaluator applies the same provenance boundary, requires required issuer IDs to use lowercase canonical UUID syntax before hashing to match database UUID output, selects the mapping effective at its UTC cutoff date, excludes evidence dated after that cutoff, rejects ambiguous results, expands the exact row to owner-scoped positions and includes applicability, issuer identity, provenance and the validity window in immutable source hashing. Hosted production continues to have no canonical issuer relation until a separate owner-authorised deployment cycle.

- Migrations: [`supabase/migrations`](../supabase/migrations/)
- Security decisions: [security documentation](security/)
- Calculation and methodology contracts: [specifications](specifications/)
- Operational implementations: [pipelines](pipelines/)
- Independent verification: [project audits](project-audits/)

