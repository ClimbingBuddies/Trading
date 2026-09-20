# Shared Decision Lab — project plan and build playbook

Version 3 · 19 September 2026 · Status: foundation installed; local mechanics tests passed; independent implementation review pending. Staged delivery below supersedes the earlier all-at-once release sequence.

## Development controller and agent workflow

Use `automation/decision-lab-development-controller.md` as the reusable execution prompt for this build. The development controller is the lead agent in the active development task, not the scheduled production trading controller. A Markdown file cannot spawn agents by itself: the executing lead must use the available delegation tools and update `documentation/decision-lab-project-plan.md` and the evidence log.

The user has requested two coordinated workstreams with independent testing/review. First agree a versioned mechanics-to-dashboard data contract. Delegate bounded mechanics and dashboard work only where file ownership and dependencies allow useful independent progress. After implementation, use separate testing and reviewing agents at checkpoints. The controller alone accepts milestones, integrates changes, controls shared database/scheduler mutations, and updates plan status. Agent self-reported success is not acceptance evidence.

Conserve credits: no recursive delegation, no standing polling agents, no automatic reset redemption, and no broad repeated test runs without a change or unresolved risk. Existing local tests are evidence of mechanics behavior, not independent review or production integration. Do not create a recurring development automation unless separately requested.

## Product goal and staged delivery

The user should be able to answer: What did the AI originally decide? What changed and why? Did the scheduled review run? What happened after the call, compared with the benchmark? Which shares are blocked and why? Personal notes must remain private and separate from AI performance.

The approved midnight-blue screenshot is the Stage 1 visual reference, including the main table AND the share detail drawer. Sample figures and company labels are not verified data and must not be copied into production. A backend-only release or a bare table does not meet this scope.

### Stage 1 — working dashboard and scheduled paper trial

Deliver the essential parts of M0–M6 together, with supported shares progressing and other watched shares explicitly blocked:

- Compact counts with disjoint states: open, closed, watching/no entry, awaiting entry, and blocked where applicable. Counts and filters must agree with saved records; do not double-count a blocked share as a published call.
- All AI calls / My watched shares filters, original dated call, latest view, paper return after costs, named benchmark, status and click-through detail drawer.
- Drawer with locked original thesis, dated call changes, latest unchanged-review timestamp, paper entry/exit dates and prices, evidence and calculation details, and simple owner-only notes.
- Last reviewed and Prices as of timestamps with timezone-aware display. Distinguish the review date from the market session used. Show a compact last scheduled run status; place detailed operational information in an expandable area rather than adding large dashboard panels.
- Needs attention with the share, plain-language blocker, last attempt and next recovery action. Never show fabricated zero returns; use Awaiting entry, No entry or Missing prices as appropriate.
- Scheduled fresh research, one shared call per instrument/cycle, immutable originals, dated reviews and paper Buy/entry/Hold/Sell/exit evaluation. No broker execution or forced Buy to produce test results.
- Verify mechanics with deterministic local price fixtures and rollback-only database tests. No separate test database is assumed. Never run destructive or irreversible fixture setup in production; no fixtures may survive rollback or enter performance totals.
- Verify rendered dashboard states and privacy, plus an actual scheduled invocation. Every watched share must reconcile to a saved result or an explicit blocker. At least one genuine eligible shared call must pass through to the rendered screen before declaring the full flow operational; an all-blocked run verifies failure reporting only.

Do not defer outcome tracking, the approved drawer or private-note separation to achieve a cosmetic launch. Defer extra analytics, holdings/quantity tracking, visual refinements and coverage that cannot yet pass provider/benchmark checks. Preserve existing personal history.

### Stage 2 — one week of observation

Start the observation period after Stage 1 acceptance, not during construction. Keep scheduled research and evaluation running; limit intervention to failures and missing runs. Retain run IDs, decisions, reviews, price evidence and blockers. A week proves operational behavior, not reliable outperformance. WAIT calls are valid; real checkpoints depend on entry and subsequent eligible sessions. Do not create additional schedules or change existing schedules just by adopting this plan.

### Stage 3 — evidence-led improvements

Review saved decisions and outcomes, missing or late runs, blockers, data revisions and dashboard usability. Fix observed defects first, then expand validated coverage and add refinements. Re-estimate remaining work against actual evidence and the user's available quota.

### Budget interpretation

The 21–34 hour estimate below remains the earlier full-build planning estimate, not measured usage or a Codex credit forecast. The earlier 5–9 hour suggestion excluded outcome tracking and the full dashboard, so it does NOT apply to this agreed Stage 1. Stage the work into demonstrable milestones and report completion honestly; do not promise a reduced credit requirement without evidence. This document update does not resume an unlimited implementation run or consume a reset credit.

## Purpose and approved scope

Build one shared, evidence-backed AI decision history per share, available to signed-in users, with measurable paper outcomes. Users filter the shared records through their own watchlists and keep their personal decisions and notes private.

The initial universe is the distinct union of all users' watched shares, plus shared calls still requiring monitoring. Research each share once. Review after each market's daily close; record unchanged reviews without filling the main timeline with repetitive messages. Preserve locked original calls and append changes. Use a verified broad Australian benchmark for ASX and a verified broad US benchmark for US shares. Select the exact instruments during provider validation; never change an existing call's benchmark retrospectively.

Private input initially means dated notes and the user's Buy/Hold/Sell view. It is not a brokerage transaction, holding quantity or executed order. No broker connection, order placement, personalised AI Buy recommendations, backdated predictions or invented performance is in scope. Weekly/monthly checkpoints measure performance; they do not force sales. Preserve the existing 0.1% modelled cost per side unless a prospectively versioned methodology explicitly changes it.

## Systems and starting evidence

- Repository: `C:/Users/ibisx/Engineering/Trading`, GitHub `ClimbingBuddies/Trading`.
- Database: Supabase `glvbqcplgjdfgjyknzsa`.
- Existing UI: `components/PredictionWorkspace.tsx`, `components/WatchlistsClient.tsx` and their styles; shared design reference is the approved Decision Lab mockup in this conversation.
- Installed schema: `scripts/shared-decision-lab.sql`; rollback-only integration checks: `scripts/test-shared-decision-lab.sql`.
- Baseline implementation evidence: `documentation/shared-decision-lab-status.md`.
- Existing controller: `automation/daily-trading-controller.md`; existing personal methodology: `automation/daily-personal-recommendations.md`. These still describe the older owner-specific system.
- Diagnostic: `scripts/daily-reviewer-preflight.sql`. It is read-only, uses the existing personal candidate function and is not yet a shared readiness gate.
- Draft PR #26: https://github.com/ClimbingBuddies/Trading/pull/26 . It is an earlier workflow redesign, not a completed or deployed shared controller. Revise its owner-specific language before adoption.

Historical checks found 59 instruments, 15 ASX mapping gaps and six blocked personal candidates. These are a baseline, not current live assertions: rerun diagnostics before making implementation decisions.

## Milestones and remaining effort

Estimates are focused engineering effort, not a promised wall-clock duration. They include implementation and targeted verification. Provider availability, scheduler access and elapsed market sessions are separate dependencies.

| Milestone | Deliverable and exit condition | Current state | Remaining effort |
| --- | --- | --- | --- |
| M0 — baseline and schema review | Reconcile deployed schema with source and preserve dirty worktree; check new schema supports cycles, unchanged reviews and evidence lineage | Foundation installed; initial privacy/immutability tests passed | 1–2 hours |
| M1 — data readiness | Verified US/ASX mappings and benchmark instruments; session-aware freshness; repeatable recovery and explicit blockers | Not implemented for shared calls | 3–5 hours |
| M2 — shared publication | Deduplicated universe, exact input hashes, validated publication, append-only reviews, database overlap protection | Tables exist; publisher and shared queue absent | 4–6 hours |
| M3 — paper evaluation | Entries, exits, marks and 5/20-session checkpoints reproduce from pinned evidence and costs | Local engine has 18 passing self-run tests; independent review and database integration outstanding | 4–6 hours |
| M4 — controller integration | After-close routing for US and ASX, readiness before cutoff, retries, durable per-ticker completion, unchanged-review handling | Older controller active; redesign draft only | 3–5 hours |
| M5 — approved interface | Shared table, watched filter, detail drawer, private notes, blockers, evidence and legacy access | Existing interface is owner-specific | 3–5 hours |
| M6 — release verification | Privacy, concurrency, paper arithmetic, browser checks, migration/deployment recovery and first live pipeline run | Outstanding | 3–5 hours |
| **Total** | **Implementation and verification** | **Estimate, not completed work** | **21–34 hours** |

Planning allowance: **3–5 focused working days**, with **1–2 additional market sessions** for unattended-run confirmation. A first real 5-session checkpoint needs five eligible sessions after entry; a 20-session checkpoint needs twenty. Deterministic fixtures can verify arithmetic before those real outcomes exist. Do not present fixtures as live trading results. Re-estimate after M1 if source access or scheduler changes create an external dependency.

## Build sequence

### M0: preserve and reconcile

1. Read repository instructions and inspect git status. Do not reset, sweep-commit or overwrite unrelated local work.
2. Inspect deployed shared tables, policies, functions and migration history against the saved SQL. Use additive migrations and record their actual identities.
3. Re-run the transactional privacy test when schema or permissions change. Confirm test rows are rolled back.
4. Review cross-table assessment uniqueness, per-instrument open-cycle rules, terminal-state handling and source-cutoff order. The installed tables alone do not enforce the complete publishing lifecycle.

### M1: establish usable inputs

1. Reconcile watchlists and active/open calls by instrument ID. Keep owner identities private; public data must not reveal who watches a share.
2. Validate venue, provider symbol and currency from actual provider metadata. Select supported broad-market benchmark instruments in the matching currency; save verification provenance. Preserve QQQ on legacy calls.
3. Load missing share and benchmark history through existing supported queues. Quarantine invalid bars and retain errors. Do not replace a failed feed with an unverified ticker match.
4. Define exchange session dates and after-close availability for US and ASX, including daylight saving and holidays. A missing price must not be treated as proof of a non-trading day.
5. Check complete share/benchmark history before freezing research inputs. Distinguish minimum row count, target-session freshness and missing-session coverage. Data arriving after a cutoff requires a legitimate later run, never a changed historical cutoff.
6. Persist a blocker and next recovery action for unsupported or unavailable instruments. One permanent blocker must not prevent supported instruments from progressing.

### M2: publish one shared call

1. Implement a private shared candidate function and a safe public status projection. Deduplicate across all watchlists and retain open positions after a share is removed from a watchlist.
2. Build generation inputs from independent assessments, dated evidence, raw prices and shared AI history only. Exclude personal notes, owner IDs and watchlist names.
3. Freeze and hash the exact input snapshot. Validate current eligible research, source cutoff, mappings, currency, benchmark and evidence on publication.
4. Serialize publication per instrument/cycle using database locking and uniqueness, not a read-then-write UI check. Return the existing record on identical retries; reject mismatched input or stale review order.
5. Create an immutable original call, append changed calls, and store unchanged review events separately from how the timeline is displayed. Enforce assessment uniqueness across original calls and reviews through the publication transaction.
6. Define new-cycle eligibility after verified exit/cancellation. Initial WAIT or AVOID does not create a paper position. Preserve old personal history without copying it into a shared record.

### M3: evaluate outcomes

1. Freeze prospective execution rules before publishing any real shared call. Use the next eligible completed session after publication under the documented exchange-aware rule; never fill at a price already known when the call was made.
2. Pin entry evidence and the selected benchmark. Later SELL can request an exit; HOLD, WAIT, AVOID and advisory REDUCE must not silently execute trades.
3. Calculate net return with the documented costs and matching-date benchmark return. Save price IDs, values and calculation evidence. Keep private notes outside the calculation path.
4. Record 5/20-session checkpoints and marks without forcing closure. Do not count a watching call as a profitable/losing trade. Withhold returns when prices are missing, duplicate, revised or corporate-action handling is unsupported.
5. Test retry safety, missing first entry bar, sell before entry, post-exit checkpoints, price revisions, splits, holidays and benchmark gaps. Existing observations must never be rewritten to improve performance.

### M4: connect the controller

1. Update canonical GitHub methodology for shared publication. Preserve independent Opportunity, External Opinion and Market Assessment reasoning.
2. Inspect actual existing schedules and ownership before changing them. Ensure US and ASX after-close opportunities are both covered; the existing Perth morning cadence alone is not proof of ASX after-close operation.
3. Add readiness before research and ensure delayed ingestion does not make the target session unreachable when the New York calendar date changes. Implement this through an explicit supported lifecycle change, not a duplicate historical run.
4. Add durable run ownership/leases and safe recovery from expired ownership. Ensure the trial heartbeat cannot race the controller or create a second publisher.
5. Run the shared evaluator alongside legacy evaluation without double-counting either system.
6. Save per-instrument stage, result IDs, blocker, source dates, recovery action and next eligible retry. Reconcile expected = completed + blocked; an invocation returning successfully is not a complete pipeline.
7. Refresh the earlier reviewer playbook and PR #26 to match the shared architecture. Confirm deployed scheduler instructions actually retrieve the updated main-branch specifications.

### M5: build the approved screen

1. Implement a compact shared-call table: share, original dated call, latest view/review date, net paper return, named benchmark and state.
2. Provide All AI calls and My watched shares filters. These filter existing shared records; they do not create personalised recommendations.
3. Open a detail drawer on row selection with locked original thesis, changes, review timestamps, evidence and outcome calculations.
4. Clearly separate owner-only notes and personal views. Derive ownership from authentication. Preserve request IDs on uncertain retries to prevent duplicate notes.
5. Show Needs attention for missing research, price or benchmark requirements with plain-language reasons. Empty states must explain what is waiting, not imply zero performance.
6. Keep legacy personal history accessible and clearly labelled. Test loading, error, empty, partial, mobile, keyboard and refresh states with actual database records.

### M6: release and observe

1. Run every completion check below. Fix failures and rerun affected checks. Record unverified dependencies explicitly.
2. Review only this feature's changes, apply migrations before dependent code, and preserve a deployment rollback that restores the older UI/controller without deleting shared history.
3. For Stage 1, verify a genuine shared call end to end for each exchange declared supported. Unsupported exchanges remain explicitly blocked and outside validated coverage; full US/ASX coverage still requires both. Only publish the call justified by evidence; never force BUY to demonstrate entry.
4. Confirm the same shared record is visible from two users and each can see only their own notes using authorized test accounts/sessions. Never obtain or improvise another person's credentials. If a second authorized session is unavailable, retain SQL role tests and mark the browser-specific check UNVERIFIED; do not claim that check passed.
5. Observe one unattended cycle per supported exchange and a safe rerun. Record actual schedule/run IDs and evidence. Leave the feature labelled incomplete until these pass.

## Definition of done

| Check | Pass requires |
| --- | --- |
| 1. Universe | Distinct union of watched instrument IDs plus monitored calls reconciles to saved results or explicit blockers; no owner leakage. |
| 2. Inputs | Verified share/benchmark mapping, currency, session, coverage and pre-cutoff timestamps for each exchange declared supported in Stage 1. Record blocked exchanges separately; full US/ASX coverage requires both. |
| 3. Research | Persisted independent assessment and dated source evidence with actual model identity; no fabricated claims or future evidence. |
| 4. Publication | Same share produces one logical original call; exact snapshot hash; retries/concurrent invocations cannot duplicate it. |
| 5. History | Original calls and measurements resist mutation; reviews append in evidence order; legacy personal records remain intact. |
| 6. Outcomes | Independently calculated fixture returns match evaluator results, including costs and benchmarks; failures withhold results. |
| 7. Privacy | Cross-user reads and writes, anonymous access and retry tests pass; private notes never enter shared inputs or performance. |
| 8. Interface | Browser table/drawer values reconcile to actual saved IDs; watched filters, notes, blockers and keyboard behavior work. |
| 9. Automation | Actual US/ASX scheduled runs complete or truthfully report blockers; no controller/heartbeat overlap or missing target sessions. |
| 10. Release | Deployed versions/migrations are recorded, recovery procedure checked, all required results have evidence and no UNVERIFIED check is claimed as passed. |

## Evidence and reusable files

Use `documentation/decision-lab-evidence-log.md` for milestone status and dated checks. For each result record check ID, PASS/FAIL/UNVERIFIED, actual run/query/test identity, result and next action. Never store keys, credentials or private note contents in GitHub.

Reuse `scripts/test-shared-decision-lab.sql` after permission/schema changes; it is not a price-calculation test. Reuse `scripts/daily-reviewer-preflight.sql` for existing-system diagnosis until the shared diagnostic replaces it; never call it proof of shared readiness. Add new evaluator and publication tests beside these scripts with a descriptive stable filename. Update this playbook's file references when implementation changes them.

## Operating rules during the build

Proceed through approved scope without repeatedly asking what is next. Ask only when a missing decision materially changes scope, spending or publication authority. Keep schema, methodology and UI statuses distinct. Report concrete completed work, failures and remaining dependencies. Completion is supported by saved evidence, not screenshots of sample data or a checklist ticked from memory.
