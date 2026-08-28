# My Dashboard — Agentic Project Plan

**Repository:** ClimbingBuddies/Trading  
**Production:** https://discoverbouldersmarkets.vercel.app  
**Supabase project:** glvbqcplgjdfgjyknzsa  
**Proposed route:** /my-dashboard  
**Controller specification:** automation/my-dashboard-agentic-controller.md  
**Controller journal:** documentation/my-dashboard-controller-journal.md  
**Audit records:** documentation/my-dashboard-audits/<GATE-ID>.md  
**Plan created:** 27 August 2026  
**Project size:** medium-to-large, eight independently audited gates and three intentional owner-review pauses

## Objective

Create an authenticated personal market workspace where each permanent user can understand and track:

- their current items requiring attention;
- private watchlists;
- Opportunity themes relevant to instruments they follow or hold;
- private portfolios and portfolio health;
- explainable personal research recommendations;
- immutable AI and user market decisions; and
- forward paper returns that provide an honest feedback loop using persisted market observations.

The project must remain a research and simulated-decision system. It must not place trades, connect to a broker, move money, represent simulated results as actual investment performance, or convert an Opportunity score into a Buy recommendation.

## Product principles

1. **Personal, not public:** every portfolio, preference, personal recommendation and user decision is private to its permanent authenticated owner.
2. **Explainable relevance:** the system shows why an instrument or theme appears and identifies stored data, sourced facts and inference separately.
3. **No opaque composite:** Market, Technical, Convergence and Opportunity outputs retain their existing independence and lineage. The personal layer may display them together, but it must not blend them into a new score unless a separately approved methodology defines and validates that score.
4. **Forward evidence first:** the first Decision Lab version evaluates decisions made before returns are known. Historical replay is a later project.
5. **Immutable decisions:** a decision snapshot cannot be edited after its evaluation clock starts. Corrections and exits are new timestamped events.
6. **Honest comparisons:** AI-signal performance begins from the AI assessment cutoff; user paper-decision performance begins from the user's selected entry rule. They must never be presented as the same entry.
7. **Missing data remains visible:** unavailable benchmarks, unresolved symbols, stale observations, FX gaps and corporate-action uncertainty produce an incomplete or unverified state, never a fabricated return.
8. **No live execution:** live_execution_enabled remains false. Nothing in this project is permission to trade.

## User experience

The primary navigation gains **My Dashboard**, available only to permanent authenticated users.

The dashboard is organised as six focused tabs so it does not become one dense page:

| Tab | Purpose |
|---|---|
| Today | New evidence, material changes, stale data, open decisions approaching a horizon and portfolio items needing review |
| Recommendations | Explainable personal research shortlist with supporting signals, evidence date, confidence, risks and provenance |
| Watchlists | Private watched instruments with current data status, assessment changes and related Opportunity themes |
| Opportunities | Long-term themes relevant to watched or held instruments, while preserving the Opportunity system's independence |
| Portfolio Health | Positions, allocation, concentration, asset/theme/currency exposure, data completeness and simulated portfolio returns |
| Decision Lab | AI signal tests, user paper decisions, open/completed outcomes and comparative feedback |

The dashboard shell must retain deep links to the existing Markets, Assessments, Opportunities, Watchlists and Strategies workspaces. Those pages remain the canonical drill-through research areas.

## Existing foundations to reuse

Read-only production inspection on 27 August 2026 confirmed these usable foundations:

- instruments and market_observations provide mapped instrument identity and observed prices;
- gpt_market_assessments provides persisted AI rating, score, confidence, thesis, risks, catalysts, model and methodology lineage;
- market_convergence_assessments preserves independent Technical and AI inputs plus convergence lineage;
- Opportunity themes and opportunity_assessments provide the independent long-term research branch;
- watchlists and watchlist_items already provide permanent-user private lists with owner-scoped RLS;
- trading_strategies, trading_test_runs and trading_decision_evaluations provide an existing private Strategy Laboratory and immutable test provenance.

No portfolio, personal-preference, personal-recommendation or forward personal-decision ledger was found. The Producer must determine whether new Decision Lab records can safely share selected Strategy Laboratory primitives or should remain separate. Reuse is permitted only when semantics, ownership, immutability and lifecycle match exactly; superficial column similarity is not sufficient.

## Proposed private data domains

Exact schema is approved only after MYDASH-001 passes independent audit and Owner Review A. The expected domains are:

| Domain | Proposed responsibility |
|---|---|
| user_market_preferences | Base currency, research horizons, selected interests and optional risk preferences |
| portfolios | Owner-scoped named paper or manually entered portfolios |
| portfolio_positions | Instrument, quantity, cost basis, position currency, acquisition date and source |
| personal_recommendation_snapshots | Immutable personalised relevance result with source IDs, cutoffs, methodology, thesis, risks and confidence |
| personal_decisions | Immutable AI-signal or user paper decision with action, instrument, horizon, entry rule and source snapshot |
| personal_decision_events | Later exit, cancel, note or review events without rewriting the original decision |
| personal_return_snapshots | Deterministic time-series evaluation with price, benchmark, FX, fee assumptions and data-quality state |
| portfolio_health_snapshots | Reproducible concentration, allocation, theme, currency and completeness measures |

The Producer may use different names or fewer tables if the audited design is clearer, but the design must preserve ownership, source lineage, immutability and reproducibility.

## Security contract

All new personal tables in an exposed schema must:

- enable RLS;
- require a permanent authenticated user and reject anonymous sessions;
- restrict SELECT, INSERT, UPDATE and DELETE to rows owned by auth.uid(), with both USING and WITH CHECK where applicable;
- prevent ownership reassignment;
- avoid browser access to internal orchestration or derived-write helpers;
- use publishable browser credentials only;
- never expose the service role, provider credentials or privileged functions to the browser;
- treat recommendation, return and health calculations as trusted server-side or database-side work with explicit ownership checks;
- revoke default PUBLIC function execution where a privileged helper is genuinely required;
- use security-invoker views or protect views from browser roles;
- prove cross-user isolation with at least two permanent test identities and one signed-out/anonymous session.

No RLS or grant weakening on existing tables is authorised to make this project easier.

## Recommendation contract

“My Recommendations” means an explainable personal research shortlist, not personalised financial advice.

Each recommendation must include:

- instrument and reason it is relevant to that user;
- recommendation category and intended horizon;
- latest qualifying source IDs and source cutoffs;
- clearly separated short-term Market, Technical/Convergence and long-term Opportunity evidence;
- supporting facts, confidence and evidence date;
- principal risks and missing-data warnings;
- methodology/model identity where an AI source is used;
- a direct research drill-through;
- a clear option to watch, dismiss or create a paper decision.

An Opportunity score alone cannot produce a Buy label. A recommendation may not be generated from short-term momentum, one technical indicator or unsupported model opinion alone. Dismissal and user feedback must not silently rewrite the underlying assessment.

## Portfolio Health contract

Portfolio Health must expose separate dimensions rather than a single unexplained score:

- position and issuer concentration;
- asset-class allocation;
- Opportunity-theme exposure;
- currency exposure in the user's base currency;
- watchlist and portfolio overlap;
- price/data freshness and coverage;
- cost-basis and FX completeness;
- allocation drift if the user has defined targets;
- unrealised market return where inputs are complete.

A summary state such as Healthy, Needs review or Incomplete data may be displayed only when its contributing measures and thresholds are visible. Missing cost basis, FX or adjusted-price evidence must reduce completeness rather than be treated as zero.

## Decision Lab and returns contract

### Two distinct decision clocks

1. **AI signal evaluation**
   - source is an immutable persisted AI assessment;
   - decision time is the assessment's authoritative input cutoff or completion time defined by the approved methodology;
   - entry is the first eligible tradable observation after that cutoff;
   - this measures the AI signal, independent of when a user later viewed it.

2. **User paper decision**
   - source is the user's explicit timestamped action;
   - entry follows the selected deterministic rule, normally the first eligible observation after the user action;
   - this measures the user's simulated decision.

The UI must never compare the two as though they used the same entry when their clocks differ.

### Required evaluation fields

Every open or completed test must preserve:

- source type: AI_SIGNAL or USER_PAPER;
- immutable decision timestamp and source snapshot/hash;
- instrument and instrument mapping;
- action: BUY, WATCH, HOLD, PASS or AVOID;
- horizon and benchmark methodology;
- entry rule, resolved entry observation and price;
- notional or unit basis;
- base and instrument currencies;
- fee, slippage and FX assumptions;
- current and final price observations;
- price return and, where reliable, adjusted/total return;
- benchmark return and excess return;
- maximum drawdown;
- data-quality/completeness state;
- methodology and calculation-engine version.

### Initial horizons

The methodology gate should assess 5, 20 and 60 trading-day checkpoints, plus the current open return. A later project may add 252-day or user-defined horizons after the first evaluation engine is proven.

### Evaluation rules

- The first release is forward paper testing only.
- Entry and horizon resolution must use trading calendars and eligible market observations, not wall-clock subtraction.
- Adjusted close may be used only after provider semantics and corporate-action treatment are verified.
- “Market return” and “net simulated return” must be labelled separately.
- Base-currency returns require a valid timestamp-aligned FX source.
- Benchmarks require an approved asset/market mapping; no benchmark is better than a misleading benchmark.
- Data gaps produce PENDING_DATA, INCOMPLETE or UNVERIFIED states.
- Daily evaluation must be deterministic, idempotent and safe to rerun.
- ChatGPT does not need to calculate daily returns. A database/server evaluator and scheduled operational job should perform deterministic updates after setup.
- Decision results may inform later reporting and methodology reviews, but they must not automatically retrain, rewrite or promote the recommendation methodology.

## Out of scope

- live trading or order execution;
- broker, bank or exchange credentials;
- automatic portfolio import;
- tax, realised capital-gains or tax-lot accounting;
- options, derivatives, leverage, margin or short selling;
- historical AI backtesting using information that may not have existed at the original timestamp;
- automatically changing a user's portfolio;
- claiming regulatory suitability or providing financial advice;
- public sharing of private holdings, decisions or performance;
- an opaque universal portfolio-health or recommendation score;
- changing the independence rules of existing Market, Technical, Convergence or Opportunity systems.

CSV import, broker integration, historical replay and more advanced risk analytics should be separate future projects after the forward paper ledger is stable.

## Source-of-truth order

1. This approved project plan and the controller specification for process and authority.
2. Supabase production schema, RLS and persisted rows for current application data.
3. GitHub application source, methodologies, migrations, tests and durable audit evidence.
4. Vercel production for deployed UI behaviour.
5. Persisted user and AI decision snapshots for the state known at decision time.

Current production truth must be retrieved fresh at the beginning of every controller run.

## Work gates

Only one implementation or audit gate may be active at a time.

| ID | Initial status | Gate | Definition of done |
|---|---|---|---|
| MYDASH-001 | NEXT | Product, data and calculation contract | Reconcile existing tables and Strategy Laboratory reuse; produce the final route/tab contract, exact data dictionary, ownership model, RLS test matrix, recommendation provenance contract, portfolio-health definitions, decision clocks, return formulae, benchmark/FX/corporate-action assumptions and migration plan. No production schema or UI changes. Independent audit required, then Owner Review A. |
| MYDASH-002 | DONE | Secure personal foundation and dashboard shell | Implement audited private schema/RLS and trusted write boundaries; add authenticated /my-dashboard shell, navigation, loading/signed-out/empty/error states and Today tab using real persisted data. Prove cross-user isolation and no anonymous leakage. |
| MYDASH-003 | NEXT | Watchlists and relevant Opportunities | Build Watchlists and Opportunities tabs from existing private watchlists and independent Opportunity mappings. Show relevance and data gaps without creating Buy labels or blending methodologies. Verify desktop, narrow-screen and keyboard behaviour. |
| MYDASH-004 | PLANNED | Portfolio and health | Add manual paper/portfolio position management and Portfolio Health measures. Validate quantity, cost basis, currencies, data freshness, concentration, allocation, theme exposure and incomplete-data behaviour. Independent audit required, then Owner Review B of the first complete personal workspace. |
| MYDASH-005 | PLANNED | Explainable Recommendations | Implement immutable personal recommendation snapshots and Recommendations UI. Prove source lineage, cutoff dates, methodology separation, risk display, dismissal/feedback behaviour and no unsupported recommendation paths. |
| MYDASH-006 | PLANNED | Decision Lab capture | Implement separate AI-signal and user-paper decision capture, immutable snapshots, entry-resolution states, horizons, decision events and open/completed views. Reuse Strategy Laboratory structures only where the MYDASH-001 contract proved semantic compatibility. |
| MYDASH-007 | PLANNED | Deterministic return evaluator and feedback loop | Implement idempotent forward-return evaluation, benchmark/FX handling, drawdown, data-quality states, scheduled operational execution and AI-versus-user comparison. Independently reproduce calculations from source observations and verify no look-ahead or entry-time conflation. Pause for Owner Review C using real pilot decisions before final completion. |
| MYDASH-008 | PLANNED | Production hardening and completion | Complete accessibility, privacy, mobile, performance, operational telemetry, documentation, user-guide, deployment and end-to-end production verification. Resolve all pilot findings, remove temporary tooling and persist final completion reconciliation. |

## Intentional owner-review pauses

These are review gates, not failures or blockers.

### Owner Review A — after MYDASH-001

Travis reviews:

- proposed dashboard layout and tab sequence;
- exact private data model;
- Portfolio Health measures;
- personal recommendation boundary;
- AI versus user decision clocks;
- return, benchmark, fee, FX and corporate-action assumptions.

No schema or production UI work may begin before this review is accepted.

### Owner Review B — after MYDASH-004

Travis reviews the first complete personal workspace containing Today, Watchlists, Opportunities and Portfolio Health. The workflow pauses before recommendations and decision testing are layered onto it.

### Owner Review C — after MYDASH-007

Travis reviews real forward-paper pilot outcomes, calculation explanations and AI-versus-user comparisons. Final completion may proceed only after this review confirms that the results are understandable and not misleading.

## Gate acceptance requirements

Every gate must include, as applicable:

- exact implementation commit or range;
- files and migrations changed;
- data/schema effects;
- source identities and cutoffs;
- automated test results;
- independent SQL/RLS evidence;
- desktop and 390 × 844 browser evidence;
- keyboard, focus, loading, empty and error-state verification;
- privacy and cross-user isolation evidence;
- calculation reproduction evidence;
- deployment state and production URL;
- canonical documentation impact;
- known limitations;
- complete acceptance-criterion mapping.

A successful build or task execution is not sufficient evidence of gate completion.

## Agentic role selection

The Controller selects exactly one role once from persisted state at the beginning of each run:

1. If project_status is MY_DASHBOARD_PROJECT_COMPLETE, report completion and make no changes.
2. If the active gate is NEXT or returned IN_PROGRESS and handoff_owner is PRODUCER, perform one bounded Producer iteration on that gate only.
3. If the active gate is IN_REVIEW and handoff_owner is AUDITOR, perform one independent Auditor iteration on that gate only.
4. If the active state is OWNER_REVIEW, present the required review material and wait for an explicit owner decision. This is not a failure.
5. If plan, journal, database migration state, deployment or handoff disagree, classify the mismatch as harmless or substantive using primary evidence:
   - reconcile harmless metadata when underlying work and identities are unchanged;
   - regenerate a missing handoff when the verified implementation is unchanged; or
   - return substantive work to the responsible role with one complete correction set.
6. Never switch from Producer to Auditor or Auditor to Producer in the same run.
7. Never audit implementation created during the same run.
8. Never promote more than one gate in a run.

## Producer authority

The Producer may, only within the active gate:

- edit application source, tests and canonical documentation;
- create reviewed migrations, RLS policies and constrained trusted functions;
- add deterministic operational jobs required by MYDASH-007;
- deploy through the existing normal GitHub/Vercel path;
- create bounded test fixtures that cannot expose another user's data;
- address the complete latest Auditor correction set.

The Producer must:

- retrieve the plan, controller, journal, active audit record, relevant source and Supabase truth fresh;
- record source commit/blob and schema identities;
- record BUILD_ATTEMPT_STARTED before material work;
- preserve the existing assessment-independence rules;
- run the complete active-gate checks;
- move work only to IN_REVIEW;
- never mark its own work DONE.

## Auditor authority

The Auditor:

- works only on the sole IN_REVIEW gate;
- retrieves the exact implementation, current production state and Supabase truth independently;
- reproduces security, calculations, tests and UI evidence rather than trusting Producer summaries;
- never implements fixes;
- returns failure as one complete, prioritised correction set;
- may mark the audited gate DONE and promote the authorised successor;
- must route owner-review gates to OWNER_REVIEW and stop;
- may mark MYDASH-008 complete only after every gate, review decision and final reconciliation is persisted.

For financial calculations, schema/security boundaries and final completion, the Auditor must use independent high-quality reasoning and primary evidence.

## Mandatory Producer handoff

    task_id:
    handoff_from: PRODUCER
    handoff_to: AUDITOR
    handoff_status: READY_FOR_AUDIT
    implementation_commit_or_range:
    delivery_control_commits:
    files_changed:
    migrations_and_schema_effects:
    rls_and_permission_evidence:
    source_data_and_cutoffs:
    calculation_or_methodology_version:
    tests_and_checks:
    routes_and_viewports_verified:
    privacy_and_cross_user_evidence:
    documentation_impact:
    known_limitations:
    acceptance_criteria_evidence:
    exact_next_action:

## Mandatory Auditor handback

    task_id:
    handoff_from: AUDITOR
    handoff_to: PRODUCER
    handoff_status: REWORK_REQUIRED
    audit_record:
    implementation_commit_or_range_reviewed:
    deployment_reviewed:
    schema_and_rls_checks:
    calculation_reproduction:
    ui_and_accessibility_checks:
    complete_correction_set:
    known_limitations:
    exact_next_action:

## Evidence and handoff protocol

- Durable evidence belongs in documentation/my-dashboard-audits/<GATE-ID>.md.
- The controller journal is append-only except for its Current state block.
- Functional implementation commits must be separated from control/evidence-only commits.
- Migration identity and deployed schema state must be unambiguous.
- Temporary browser, test-user or audit helpers are permitted only when necessary, must contain no real secrets or private portfolio information, and must be removed after evidence is captured.
- Owner-review decisions are persisted verbatim with date, accepted scope and any constraints.
- A reported success without required persisted output is ATTENTION, not completion.

## Completion criteria

The project is complete only when:

- MYDASH-001 through MYDASH-008 have each passed independent audit;
- Owner Reviews A, B and C are explicitly accepted and persisted;
- /my-dashboard is available to permanent authenticated users in production;
- private rows are isolated across users and unavailable to anonymous sessions;
- Today, Recommendations, Watchlists, Opportunities, Portfolio Health and Decision Lab operate from authoritative persisted data;
- recommendation cards expose reasons, sources, cutoffs, risks and missing evidence;
- AI-signal and user-paper decisions retain distinct clocks and immutable source snapshots;
- forward returns are reproducible from persisted market, benchmark and FX evidence;
- incomplete data cannot masquerade as a zero or verified result;
- no live trading or broker authority exists;
- desktop and 390 × 844 production experiences pass independent audit;
- route, architecture, data-model, methodology, operational and user-guide documentation are reconciled;
- temporary project tooling is absent;
- the controller journal records MY_DASHBOARD_PROJECT_COMPLETE.

## Current project state

    project_status: IN_PROGRESS
    active_gate: MYDASH-003
    active_gate_status: NEXT
    handoff_owner: PRODUCER
    controller_created: true
    controller_journal_created: true
    production_changes_authorised: MYDASH-001 contract and audit only
    owner_approval_recorded: 27 August 2026
    next_action: Controller performs one Producer iteration on MYDASH-001 only.
