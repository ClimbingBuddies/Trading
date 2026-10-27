# Trading — Reliable Research and Decision Lab

**Updated:** 27 October 2026, Australia/Perth  
**Owner:** ClimbingBuddies  
**Repository:** `ClimbingBuddies/Trading`  
**Production:** https://discoverbouldersmarkets.vercel.app  
**Existing Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Status:** Formal review complete; first implementation increment verified locally. Production source is recovered and frozen install/build passes; backend management verification and deployment remain outstanding.

**Formal review:** [Findings, evidence and limitations](project-audits/PRODUCT-REVIEW-2026-10-26.md)  
**Acceptance contract:** [User journeys and AT-01–AT-18 scenarios](specifications/trading-product-acceptance.md)

**27 October progress:** [Source recovery, frozen build, tests and first freshness fix](project-audits/REL-001-2026-10-27.md). The live deployment is linked to commit `84a4070` on `project/decision-lab-completion`, and development now uses a separate branch based on that source. The 26 October baseline below is retained as dated history. Do not interpret its earlier missing-source observation as an unresolved source-location problem.

**Second increment:** [Assessment source/age labels and read-only recovery diagnostics](project-audits/REL-003-2026-10-27.md) verified locally with 386 tests, a production build and a real-data browser check. No production deployment or management changes have occurred.

**Third increment:** [Monitor evidence display safeguards](project-audits/REL-002-monitor-2026-10-27.md) verified with 404 tests, a production build and signed-in local browser fault injection. Contradictory completion claims and malformed responses no longer read as healthy. The real monitor response remains ATTENTION; backend repair is not complete.

**Fourth increment:** [Private journal status corrections](project-audits/REL-004-journal-status-2026-10-27.md) verified with 408 passing tests. This fixes two reproduced legacy helper defects; the shared outcome audit remains outstanding.

**Fifth increment:** [Shared dashboard response checks](project-audits/REL-004-dashboard-contract-2026-10-27.md) passed 411 tests and the production build; real all/watched read responses also passed. Invalid nested records now fail visibly before entering the dashboard. Shared outcome calculation verification remains outstanding.

## Product intent

Build a trustworthy investment-research and paper-testing workspace that answers:

1. What has changed, which instruments or long-term themes deserve attention, and why?
2. What does the AI currently think should be done, over which horizon, with what evidence and risks?
3. What happened after that call, and did the decision add value over holding the instrument, a suitable benchmark or cash?
4. What is missing, stale or unsupported, and what will make it usable?

The goal is useful, measurable decisions, not more pages, more scores or a permanently green project status. Predictive skill is something to demonstrate with forward evidence; it is not assumed because a model is confident, an asset is diversified, or a screen looks complete.

This programme supersedes the **future-work and completion assumptions** of the older platform and My Dashboard plans. Preserve their implementation/audit records as history. Do not erase completed calls, losses, old methodologies or unresolved gaps to make this programme appear successful.

## Authority and scope

The owner authorised strengthening the plan and recommendations on 26 October 2026. The previously authorised test-account watchlist expansion remains separate from this planning change. This document does not assert that implementation, deployment, privileged database changes, notification sending, provider spending or scheduler changes have occurred or received new approval merely by being listed here. Apply the owner's actual session instructions to each later action; do not manufacture repeated approval gates for ordinary authorised work.

No broker connection, order placement, money movement or live trading is in scope. Do not create a duplicate Vercel project or Supabase database to work around missing access. Keep `live_execution_enabled` false.

Routine work should be autonomous within its authorised scope. Ask the owner only for access, a material product decision or a consequential action that genuinely remains unauthorised. Historical agent role loops and repeated owner-review ceremonies are not acceptance evidence and need not be recreated for this programme.

## Evidence baseline: observed 26 October, not a permanent current state

| Area | Observed evidence | Meaning |
|---|---|---|
| Deployment/source | Production serves `/decision-lab` with shared calls. Fetched GitHub `main` and the cloud checkout are `3a2719519b22b266cdac9b9e54296c11ce2594bb`, without that route. | Production behaviour and this source baseline differ. Identify the deployed revision/artifact before editing or replacing it. Do not assume which version is newer or reset one to match the other. |
| Research | Live Assessments: 39 AI results dated 21 October; 30 Technical/Convergence snapshots dated 20 August. Opportunity run: 22 October, 10 themes. | Source dates are not aligned; stale material must not appear to be a current combined signal. |
| Shared Decision Lab | 7 saved decisions, including 3 research-only. Review panel reports 24 overlapping attention items, missing controller receipts and many instruments not configured. | Watchlist membership is not publisher readiness. Attention-item counts are not distinct-instrument counts. Missing receipts establish missing evidence, not proof that a process never ran. |
| Forward outcomes | Shared performance service: 4 matured five-session event trials; no matured twenty-session trials. | Too little evidence to claim predictive skill. Event trials, latest calls, cycles and portfolio performance are different units. |
| Current method | `shared-action-trial-v1`: fixed equity/cash allocations, modelled costs, dividends excluded. | Not yet a universal long-term ETF or FX return methodology. Preserve its historical interpretation when adding new versions. |
| Test universe | Private test watchlist has 26 USD shares; 19 had older published research, 7 none. All passed preliminary canonical daily-price/mapping coverage checks. | Preliminary coverage does not establish fresh research, shared configuration or publication eligibility. |
| Product surfaces | Alerts is an in-app rule/event log without delivery. Test account has no private strategies. | Low immediate value is not proof that other users have no rules or backtests. Preserve useful capabilities and privacy. |

The baseline comes from authenticated live browser checks, published page dates, read-only service responses and Git identity checks. A durable sanitised evidence inventory E01–E11 is in the [formal review](project-audits/PRODUCT-REVIEW-2026-10-26.md). Detailed local captures under `/workspace/trading-tools/` remain supporting evidence, not portable repository dependencies. Recheck dated evidence at implementation start, and attach sanitised durable evidence to each handoff. Never include passwords, tokens or private holdings.

## Minimum useful product and delivery slices

The first release target is a dependable small loop, not simultaneous completion of every asset class and dashboard. The [acceptance contract](specifications/trading-product-acceptance.md) defines the five user journeys and concrete tests for each slice.

| Slice | Deliverable | Dependencies / release boundary |
|---|---|---|
| A — Recover the real baseline | Reconciled deployed source/API/schema inventory, frozen reproducible build and controlled preview. | REL-001. Do not replace production from an unreconciled checkout. Preserve existing production data/work; capture deployment compatibility and recovery evidence. |
| B — Prove a small reliable loop | Three configured shares plus one validated unleveraged ETF, fresh evidence, one shared publication per event, correct evaluation and clear freshness/blockers. | A; REL-002/003/004 and applicable REL-010/011 controls. Choose assets by actual readiness; do not backdate old research or claim the full universe is operational. Receipt/availability measurements start here. |
| C — Expand useful supported coverage | Configure eligible members of the existing 26-share watchlist and validated ETF set, make asset/horizon coverage explicit, and improve core journeys. | B; capacity/cost checks in REL-012; REL-005/008. Every selected instrument is either usable or visibly blocked. Do not count blocked instruments as successful coverage. Price-only ETF trials may precede total-return support when labelled honestly. |
| D — Add genuinely new methods | Distribution-aware longer-horizon ETF returns and independently specified FX trials. | Stable relevant core; REL-006/007 and method-specific tests. These can progress independently after shared prerequisites; FX need not wait for a year of matured ETF results. Keep old method history intact. |
| E — Learn whether it adds value | Bounded product-usefulness reviews and predeclared forward-performance analysis, including inconclusive/no-edge outcomes. | Usefulness feedback starts in B; performance observation starts with the first real pilot call. REL-009 conclusions require enough appropriate outcomes and uncertainty analysis, not arbitrary sample counts or a profitable result. |

Ship independent low-risk clarity improvements once their source is reconciled. Do not hold all useful fixes until every slice is complete. Conversely, adding instrument names or a new page is not acceptance of that asset/method.

## Product and data contract

### One shared AI record; private personal context

- Publish one immutable shared AI call/review per eligible instrument, evidence version and decision event. Adding watchers must not multiply research or global calls.
- Shared outputs are visible to the intended authenticated audience through a constrained read interface. Shared does not mean anonymous public access to personal data.
- Watchlists, holdings, notes, preferences and personal paper actions remain owner-private and protected by RLS. A user's note must never change the AI's historical action or score.
- If a separately scored personal decision/portfolio engine is wanted, give it distinct clocks, records and metrics; do not quietly reinterpret notes as trades.
- Correct earlier calls by appending dated events. Preserve original evidence, model identity, methodology, publication time and loss history.

### Research, recommendations and outcomes are distinct

- Preserve independent Market AI, Technical and long-term Opportunity methodologies. Convergence may combine only the approved, compatible source versions; displaying an old convergence result next to a newer AI call must not imply it includes that call.
- A long-term theme/exposure score measures its documented construct, not expected price return, calibrated probability or permission to Buy.
- Every actionable call needs a dated thesis, principal risks, intended horizon, invalidation/review conditions, evidence provenance, model/method version and an explicit eligible/blocked state.
- A valid fresh WAIT or AVOID is useful. Missing research is not a WAIT, and a research-only instrument is not a scored recommendation.
- Never backdate calls to old prices. Historical baselines, historical replay and prospective AI calls must remain separately labelled; do not run today's model over known history and call it an out-of-sample forecast.

### Asset and horizon support must be explicit

Maintain a configuration/coverage record per instrument, not just a watchlist item: identity and asset classification; supported calendar and timezone; price/adjustment provider and mapping; research coverage; benchmark/comparator policy; cost and currency model; compatible method versions; and the exact reason publication or scoring is blocked.

Use independent states such as `research missing/stale`, `instrument not configured`, `research only`, `call published`, `awaiting entry`, `open/pending`, `matured`, `not entered`, and `evaluation blocked`. Do not collapse all of them into a blank return or success indicator.

Keep the current 5/20-session trials interpretable as that method defines them. Design 60/252-session evaluation as a **new, versioned extension** for medium/longer horizons after the method is specified; it does not require fabricating matured results or delaying every short-horizon improvement for a year. Theme research may still describe a 1–3 year thesis. Intraday prediction is not implied by this daily-data programme.

## Prioritised work and acceptance criteria

Statuses: `PLANNED`, `IN PROGRESS`, `BLOCKED`, `VERIFIED`. A task can be implemented but unverified; record that plainly rather than mark it complete. The table below is a plan, not a claim that fixes were executed.

| Priority / ID | Status | Work | Evidence required to mark VERIFIED |
|---|---|---|---|
| P0 / REL-001 | IN PROGRESS: source/deployment matched; frozen build verified locally; privileged schema/release checks outstanding | Reconcile production, repository and backend versions and make the build reproducible. | Identify the actual Vercel deployment/project/branch/commit or recoverable artifact and relevant database/API versions. Preserve existing changes/deployed work. Locate shared-page/API source; reproduce representative signed-in routes. Repair the lockfile in a reviewed implementation change and pass frozen installation/build checks without disabling integrity verification. No guessed reset or blind legacy migration. AT-01/02. |
| P0 / REL-002 | BLOCKED for management changes; read-only status verified and client-side evidence safeguards implemented/tested | Restore the daily research → shared publication → evaluation loop. | Verify installed schedules, controller receipts, due calendars, stage dependencies, bounded retries, concurrency and logs. Prove the four-instrument pilot through real publication and independent evaluation; repeat and interrupted processing cannot duplicate events or hide other eligible work. Measure receipt completeness separately from successful usable coverage. AT-04/05/06. |
| P0 / REL-003 | IN PROGRESS: Opportunity wording and assessment source/age labels verified locally; full due-calendar freshness and source refresh outstanding | Make freshness and gaps impossible to mistake for current signals. | Calendar-aware due dates and source-specific freshness rules are defined. Stale AI/Technical/Convergence inputs are labelled and excluded from current actionable aggregates until compatible. Show last completion, next due time, coverage denominator and exact failure. An old Opportunity run says “change in last run”, not “today”. Exercise holiday/weekend, failed-run and stale-source cases. |
| P0 / REL-004 | IN PROGRESS: legacy status defects corrected; shared calculation audit outstanding | Establish a trustworthy outcome and evidence contract. | Independently reproduce current entry/exit dates, costs, cash assumptions, benchmark/excess returns and drawdown from pinned observations. Separate latest calls, original calls, reviews, cycles, matured trials and portfolios. Publish eligibility/pending/blocked/research-only denominators. Verify loss preservation, idempotency, correction behaviour, ownership and same-date data gaps. Fix the reproduced legacy NOT_ENTERED and data-quality status inconsistencies in the reconciled implementation where applicable. |
| P1 / REL-005 | PLANNED; follows safe publication/evaluation contracts | Activate a bounded share and ETF cohort. | Audit classification and configure the 26 watched shares individually. Add validated unleveraged ETF candidates QQQ, SMH, XLV, GLD and COPX where coverage permits; each either produces a fresh eligible call or a precise visible blocker. Correct SQQQ's equity misclassification through a reviewed data change; do not silently include leveraged/inverse ETFs. Define a valid benchmark for each instrument, including an ETF that would otherwise be its own comparator. |
| P1 / REL-006 | PLANNED; ETF price trials can precede total-return readiness if explicitly labelled | Add credible medium/long-horizon ETF evaluation. | Verify provider split/distribution semantics, avoid double-counting adjusted prices, and model cash/dividend reinvestment and costs explicitly. Mark price-only results as price-only; never present them as total returns. Define 60/252-session methodology and comparator before publishing new-horizon calls. Preserve old price-only evidence unchanged and separate event/asset-class cohorts. |
| P1 / REL-007 | PLANNED; separate asset method required | Implement a small FX research/paper-testing cohort. | Specify base/quote direction, valuation currency, calendar/session close, exposure/position sizing, spread/slippage, rollover/carry assumptions and asset-appropriate comparator. Validate EUR/USD, GBP/USD, AUD/USD, USD/JPY and USD/CAD individually; GBP/AUD additionally needs published research. Reproduce both favourable and adverse moves and cost effects. Unknown funding/cost evidence blocks net-performance claims; do not reuse an equity/QQQ model or infer a short FX position from an equity SELL. No live or leveraged execution. |
| P1 / REL-008 | PLANNED; design can proceed in parallel | Simplify the product around decisions. | Research retains separate Market and Long-term views with deep links. Watchlists explains why each instrument is/isn't eligible. Decision Lab separates asset classes and horizons and exposes meaningful outcomes. Integrate Alerts into watched instruments; an event-log-only feature is labelled as such. Put Strategies under Advanced while preserving private strategy evidence and existing links. Verify useful signed-out/empty/error states, keyboard flows, readable controls and document containment at desktop and 390 × 844. |
| P2 / REL-009 | PLANNED; instrumentation starts with pilot, conclusions require genuine outcomes | Evaluate usefulness and whether AI adds value. | Predeclare a forward cohort against underlying buy-and-hold, suitable asset benchmark and stated cash alternative. Show costs, sample sizes, correlation, exclusions and regimes. Keep tuning separate from holdout evidence. Do not equate model confidence, zero-cash WAIT or four trials with skill. Inconclusive/no-edge findings are valid. Operational measurement belongs to P0 REL-002/003, not this later conclusion. AT-17/18. |
| P1 / REL-010 | PLANNED; access and recovery tests required before affected promotion | Verify shared/private security and recoverable releases. | Two permanent users plus signed-out access exercise shared reads, private context and privileged write denial. Preserve RLS and credential boundaries. Demonstrate migration compatibility and isolated restoration/rollback or fix-forward, with sanitised evidence and no destruction of historical records. AT-11/12/16. |
| P1 / REL-011 | PLANNED; research-validation prerequisites apply to pilot | Enforce research quality and AI output validation. | Typed actions, horizons, identity, evidence/cutoff/source references and method versions are validated. Reject malformed or fabricated citations, unsupported certainty, duplicate-source inflation and retrieved-source instructions. Distinguish fact, opinion and inference; fail to an explicit held/blocked state rather than inventing a call. AT-13. |
| P1 / REL-012 | PLANNED; required before broad expansion | Bound provider/model cost, capacity and method changes. | Establish measured pilot usage, provider/model limits and queue/concurrency policy. Deduplicate shared work; reuse evidence under freshness/licensing rules. Handle quota denial without retry storms or hidden stale results. Record model/prompt/method changes and keep affected performance cohorts separate. AT-14. |

REL-001 blocks production code replacement, not useful read-only diagnosis, specification work or documentation. Backend access can be prepared while source reconciliation proceeds. Cosmetic navigation work is lower priority than repairing the loop, but an independently verified stale-data warning should not wait for a broad redesign.

### Accountability and traceability

- Product owner: ClimbingBuddies, for intended workflow, material scope choices and genuinely required consequential authorisation.
- Engineering/release owner: the developer carrying the work, responsible for exact source/schema/API identity, implementation and evidence. No fixed person or unavailable tool access is assumed.
- Backend/operations owner: the operator with supported project/scheduler access; currently unassigned for privileged inspection, and therefore a concrete implementation blocker.
- Research/calculation reviewer: the collaborator checking source quality, method definitions and numerical results. State when a review is author-led; do not label it independent certification merely because a role name exists.

Roles describe responsibilities and may be combined where practical. They do not require new agents, standing meetings or repeated approval rituals. Findings F01–F13 map to work items and AT scenarios in the [formal review](project-audits/PRODUCT-REVIEW-2026-10-26.md); that mapping is the correction checklist. Each implementation handoff records its actual responsible collaborator and checks performed.

## Outcome methodology requirements

Keep three user questions separate:

1. **Was the asset direction predicted correctly?** Define the price/total-return target, horizon and flat/no-call policy before evaluation.
2. **Did the recommended action add value?** Compare its explicitly simulated exposure against holding the instrument, the declared benchmark and cash. SELL/WAIT at zero exposure is not a profitable short trade. A REDUCE assumption is a simulation allocation, not the user's actual holding.
3. **Would an investable portfolio have benefited?** This needs capital limits, sizing, overlapping positions, cash, turnover and portfolio-level accounting. A mean of action-trial returns is not such a portfolio.

Display the appropriate costs and source assumptions. For share/ETF total-return comparisons, resolve distributions and corporate actions. For FX, a pair's percentage change is not automatically the user's return in their base currency. A generic QQQ comparison is not suitable for all sectors, commodities, currencies or international assets.

Use out-of-sample baselines and preserve a clear model/method version boundary when changing prompts or rules. Do not use later outcomes to rewrite earlier evidence or tune and score on the same holdout. Correlated reviews on one instrument must not inflate an apparent independent sample size. There is no universal magic minimum number of trials that proves skill; define a fit-for-purpose uncertainty and regime-coverage assessment before making a success claim.

## Operating model

- Keep deterministic data collection, calendar checks, queues, evaluation and telemetry in the supported backend. AI performs bounded research and reasoned calls; it must not be required to keep a browser open or manually calculate each daily return.
- Use the existing single morning orchestrator and backend evaluators where fit for purpose. Verify their actual deployed state before replacing them. Separate analytical independence from unnecessary operational coupling: preserve truly required prerequisites and record why a stage is blocked; an unrelated theme failure must not silently starve all usable asset research.
- Every due stage has an idempotency key, evidence cutoff, start/heartbeat, terminal outcome, persisted outputs and failure reason. Recover stale runs deliberately; do not create a duplicate same-date logical run.
- A monitor receipt and a controller receipt describe different things. Capture both the checked state and the actual work output, plus the next expected completion and a bounded recovery path.
- Define source/calendar-specific freshness budgets. Distinguish no market session due, incomplete work, source unavailable and actual verified completion. Do not use a weekday-only assumption for exchange holidays or a US-equity calendar for all FX.
- Initial acceptance window: five consecutive **eligible trading sessions** for the declared pilot and seven consecutive Perth dates for daily Opportunity monitoring. Define the expected stage/instrument denominator and supported calendar before observing results. These are proposed observation windows, not achieved facts or statistical proof of profitability. Diagnose failures immediately; do not wait for the window to finish.
- Measure **receipt completeness** separately: every expected stage has a visible succeeded/failed/blocked/not-due state and reason. Complete telemetry can pass while availability fails. A failed or source-blocked due stage must never become a successful morning merely because it reached a terminal state.
- Measure **usable pilot coverage**: eligible pilot instruments with fresh validated research and the required persisted call/review divided by all due pilot instruments. The initial small-cohort acceptance target is 100% within the agreed due window; missing configuration or source failures stay in the denominator and are failures to meet that target. Only genuinely not-due calendar events are excluded. Broader-universe targets follow measured capacity rather than inventing successful coverage.
- Measure **daily Opportunity availability** separately from its monitor: required themes with valid current-date research divided by the declared due-theme set. The initial acceptance target for that set is 100% within its defined daily deadline; a documented source failure is transparent but still fails availability. Partial useful research remains visible with explicit missing themes. Do not conceal a failed research day by counting its successful monitor check.
- Measure **evaluation timeliness** from verified availability of the eligible canonical input, not from calendar time alone. Pin the deadline after inspecting the installed cadence; an initial proposed budget is two normal evaluator cycles after input availability. Distinguish future immature checkpoints from overdue processing and record input-lag separately from evaluator-lag.
- Measure **product usefulness** through the bounded J1–J4 tasks in AT-17. Passing service targets does not prove a user can understand the calls; passing usability tasks does not establish forecasting skill. Explicitly version any changed deadlines, denominators or targets before a new window.
- Surface owner-actionable summaries instead of repeated technical notifications. If delivery is introduced, choose the channel with the owner, store its credentials securely, test consent/routing and deduplication, and verify actual delivery. Do not promise email/push notifications from an event log.

## Completion and handoff

A working build, passing unit tests, a running process, an installed schedule, or a signed-out HTTP 200 is not sufficient on its own. Verify the affected workflow with persisted real output and representative functional checks. Use isolated fixtures for edge cases; never seed fake public calls or performance to make production look active.

For each task record: exact scope; source/deployment/schema identities; before/after behaviour; tests actually run and outcomes; relevant sanitised receipts/record identifiers; user-visible effect; remaining limitations; and recovery/rollback procedure for any production change. Preserve previous evidence when superseded and identify the newer result rather than silently changing history.

Mark capability levels separately: **implemented**, **deployed**, **operationally verified**, and **performance evaluated**. Historical tasks can remain complete while current operation needs repair. No plan can mark predictive success complete in advance.

Before promoting an affected release slice, satisfy AT-16: close or explicitly exclude non-applicable P0s with a reason; verify relevant source/build, method, access and recovery evidence; record bounded rollout and rollback/fix-forward instructions. Use a preview or controlled isolated fixture environment before production changes; do not let preview jobs publish real calls, send notifications or trigger production orchestration. Do not create a second production project as a shortcut.

Provide an operator control to pause **new generation/publication** on invalid evidence, model/schema mismatch or exceeded budgets. Preserve historical reads and safe ongoing evaluation; a generation pause must not erase losses or imply pending checkpoints are complete. Resume only after the diagnosed prerequisite is restored and duplicate-free recovery is verified.

Update route, data-model, methodology, operations and user documentation when the corresponding implemented contract changes. This plan describes intended improvements, not a declaration that production already supports them. No automated task is activated or reconfigured by this documentation change.

## Immediate next action

Production source identification is complete: continue from `84a4070` / `project/decision-lab-completion`, not old main. Use the [27 October checkpoint](project-audits/REL-001-2026-10-27.md) for exact deployment evidence, validation and current blockers. Next obtain a supported management read path to the existing controller, shared decision configuration and evaluator/cron receipts, then execute REL-002/003/004 in small verifiable increments before expanding scored coverage. Preserve the single 08:00 Perth controller; do not recreate the obsolete hourly schedule.

Already available: the project intent and priorities, authorised test account, 26-share private watchlist, public/private read interfaces, live shared-page behaviour, method limitations and reproducible test tooling. Do not ask the owner to repeat these decisions or re-enter working publishable credentials. Never request passwords or privileged credentials in chat; use secure environment bindings or supported connectors for any remaining access.
