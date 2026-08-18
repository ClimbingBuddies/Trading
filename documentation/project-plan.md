# Discover Boulders Markets — Project Plan

**Repository:** `ClimbingBuddies/Trading`  
**Supabase:** `glvbqcplgjdfgjyknzsa`  
**Production:** `https://discoverbouldersmarkets.vercel.app`  
**Vercel project:** `boulders-market`  
**Last reviewed:** 18 August 2026

## Purpose

This is the canonical task plan for the Trading platform. It is intended to be retrieved from GitHub whenever work resumes so tasks can be completed one at a time and the plan can be updated as milestones are verified.

Status values: **DONE**, **NEXT**, **PLANNED**, **IN PROGRESS**, **IN REVIEW**, **BLOCKED**, **DEFERRED**.

## Automated delivery governance

The project may be advanced by the paired scheduled workflow defined in:

- `automation/project-plan-builder.md`
- `automation/project-plan-auditor.md`

The **Project Plan Builder** implements exactly one eligible item at a time. It may move `NEXT -> IN PROGRESS -> IN REVIEW`, but it must never approve its own work, mark an item `DONE`, or promote the next item.

The independent **Project Plan Auditor** owns the quality gate. It reviews exactly one `IN REVIEW` item against the item's Definition of Done using primary evidence from the relevant GitHub, Supabase, Vercel/production and browser layers. The Auditor may return the item to `IN PROGRESS` for rework, mark it `BLOCKED`, or mark it `DONE` after `PASS` / `PASS WITH ADVICE` and promote exactly one valid `PLANNED` item to `NEXT`.

Normally only one project-plan item should be in `NEXT`, `IN PROGRESS` or `IN REVIEW` at a time. Neither scheduled workflow may guess through an ambiguous project state.

Audit history is stored in `documentation/project-audits/<TASK-ID>.md`.

## Platform principles

- Supabase is the system of record for persisted data and assessment results.
- GitHub is the system of record for source code and canonical assessment methodology.
- `boulders-market` is the only production Vercel project.
- Production dashboards must not use fabricated rows, metrics, evidence, prices or links.
- Market Assessment and Opportunity Assessment are separate systems.
- Technical Engine and ChatGPT Market Assessment remain independent until Market Convergence.
- Important scoring workflows should store a methodology/version.
- Scheduled workflows should be idempotent and reach a terminal status.
- A dashboard does not make an underlying workflow operational.

## Target assessment architecture

### Short-term Market Assessment

Question: **Is this instrument attractive now?**

```text
market_observations
      |
      v
Technical Engine --------------------+
technical_indicators                  |
market_scores                         v
                         market_convergence_assessments
                                      ^
                                      |
Independent ChatGPT Market Assessment+
gpt_market_runs
gpt_market_assessments
gpt_market_evidence
```

### Long-term Opportunity Assessment

Question: **What could become important next?**

```text
real-world research
      |
      +--> Structural Opportunity Signal -----+
      |                                       |
      +--> Technology Inflection Signal ------+--> Opportunity Assessment
                    |                         |
                    +--> Technology Events    +--> Instrument Exposure
                                              +--> Research & Evidence
```

The two systems may be displayed together after they are independently produced, but one must not be used to form the other.

## Current baseline

### Market data — Operational

- Twelve Data loader is active.
- 30 active instruments are tracked.
- Market data is scheduled every 15 minutes.
- US equity/ETF market-hours logic exists.
- `market_observations` and `sync_runs` support monitoring.

### Opportunity Assessment — Partial / advanced

Current populated data includes 3 themes, 3 Structural Signals, 3 Technology Inflection Signals, 3 Opportunity Assessments, 4 Technology Inflection Events, 3 Research documents and 16 Research embeds.

Canonical specification: `automation/daily-opportunity-assessment.md`.

Successful unattended scheduled runs are persisted for 15–17 August 2026. The 17 August run used canonical specification v1.3, completed 10/10 themes and updated Research & Evidence. The Daily Opportunity Assessment task exists but was disabled at Builder verification time on 18 August 2026, so historical unattended success must not be confused with current schedule activation.

### ChatGPT Market Assessment — Partial

- 30 Market Assessment rows and 30 evidence rows exist from the historical test dataset.
- The historical run remains inconsistent: `running`, `tickers_completed = 0`, `completed_at = null` despite the assessment rows.
- The Daily Trading Market Assessment Scheduled Task exists but is currently disabled.
- Canonical methodology exists at `automation/daily-market-assessment.md`.
- The Scheduled Task prompt has been migrated to a thin runner that retrieves the canonical GitHub specification fresh on every run; activation remains a separate later project-plan item.

### Technical Engine — Scaffolded

- `technical_indicators`: no current rows.
- `market_scores`: no current rows.

### Market Convergence — Scaffolded

- `market_convergence_assessments`: no current rows.

### Security — Requires hardening

RLS remains disabled on the older Market Assessment/control tables, including `gpt_market_runs`, `gpt_market_assessments`, `gpt_market_evidence`, `market_assessment_queue` and `market_assessment_schedule_log`.

## Phase 0 — Documentation baseline

| ID | Status | Task | Definition of done |
|---|---|---|---|
| PLAN-001 | **DONE** | Create this canonical project plan | Project plan exists in GitHub and is linked from documentation navigation. |
| DOC-001 | **DONE** | Create `documentation/assessment-system-overview.md` | Clearly explains Market vs Opportunity Assessment, independence, convergence and UI cross-reference. |
| DOC-002 | **DONE** | Create `documentation/pipelines/opportunity-assessment-pipeline.md` | Documents lifecycle, tables, schedule, retries, evidence and operational definition. |
| DOC-003 | **DONE** | Create `automation/daily-market-assessment.md` | Canonical Market Assessment methodology exists in GitHub with explicit independence rules. |
| DOC-004 | **DONE** | Reconcile root README and documentation index | Both assessment systems and this plan are linked and stale descriptions removed. |
| DOC-005 | **DONE** | Refresh Supabase data model documentation | Opportunity, Research, Market Convergence and current RLS/maturity are represented. |
| DOC-006 | **DONE** | Refresh roadmap and Phase 2 progress | Roadmap reflects the current two-assessment architecture. |
| DOC-007 | **DONE** | Refresh frontend/design documentation | Current Opportunity tabs, routes, palette system and responsive behaviour are documented. |

## Phase 1 — Make both assessment loops operational

| ID | Status | Task | Definition of done |
|---|---|---|---|
| OPS-001 | **DONE** | Verify first unattended Opportunity Assessment run | GitHub spec is retrieved, Supabase is updated idempotently, Research & Evidence is updated and result verified. |
| OPS-002 | **DONE** | Change Market Scheduled Task to use the GitHub Market specification | Scheduled Task becomes a thin runner that retrieves the current GitHub specification. |
| OPS-003 | **IN REVIEW** | Standardise Market AI independence metadata | New rows record a version such as `independent-market-ai-v1` and `technical_engine_input_used = false`. |
| OPS-004 | **PLANNED** | Reactivate Daily Trading Market Assessment | Weekday task is enabled after the canonical specification is ready. |
| OPS-005 | **PLANNED** | Verify first unattended Market Assessment run | Freshness check, full active universe, evidence, finalisation and report complete successfully. |
| OPS-006 | **PLANNED** | Verify Market retry/idempotency | Retry/resume produces no duplicate assessment or evidence records. |
| OPS-007 | **PLANNED** | Resolve historical Market run and backlog | Legacy test/backlog rows are deliberately archived, superseded or finalised without replaying them as current work. |

## Phase 2 — Security and operational hardening

| ID | Status | Task | Definition of done |
|---|---|---|---|
| SEC-001 | **PLANNED** | Define public/private Market Assessment access | Published assessment output and internal queue/run-control access are explicitly classified. |
| SEC-002 | **PLANNED** | Apply deliberate RLS policies | Approved dashboard reads continue; anonymous writes are blocked; internal control tables are protected. |
| SEC-003 | **PLANNED** | Harden helper-function search paths | Relevant functions use explicit safe search paths or fully qualified references. |
| SEC-004 | **PLANNED** | Review `pg_net` warning | Placement/usage is remediated or explicitly accepted with rationale. |
| SEC-005 | **PLANNED** | Remove frontend Supabase fallback configuration | Production uses Vercel environment variables without privileged frontend secrets. |

## Phase 3 — Independent Technical Engine

| ID | Status | Task | Definition of done |
|---|---|---|---|
| TECH-001 | **PLANNED** | Define technical calculation specification | Indicators, intervals, history requirements, formulas, versioning and missing-data behaviour are documented. |
| TECH-002 | **PLANNED** | Implement core technical indicators | Versioned `technical_indicators` are generated from real market observations. |
| TECH-003 | **PLANNED** | Implement technical market scoring | `market_scores` receives reproducible component scores, overall score, confidence and version. |
| TECH-004 | **PLANNED** | Add scheduler and monitoring | Frequency, ownership, errors, retries and Admin visibility are explicit. |
| TECH-005 | **PLANNED** | Verify Technical Engine independence | Engine uses market/indicator inputs only and does not read GPT Market conclusions. |

## Phase 4 — Market Convergence

| ID | Status | Task | Definition of done |
|---|---|---|---|
| CONV-001 | **PLANNED** | Finalise Market Convergence methodology | Score, confidence, disagreement handling, labels and version are documented. |
| CONV-002 | **PLANNED** | Populate `market_convergence_assessments` | Independent Technical and AI Market results combine into persisted convergence rows. |
| CONV-003 | **PLANNED** | Add convergence history and retry rules | Daily/history uniqueness and stale-input behaviour are deterministic. |
| CONV-004 | **PLANNED** | Surface convergence in frontend | Technical, AI and Convergence results are shown distinctly. |

## Phase 5 — Cross-system investment research

| ID | Status | Task | Definition of done |
|---|---|---|---|
| UX-001 | **PLANNED** | Show current Market result beside Opportunity exposure | The UI combines independently completed views without using one as an analytical input to the other. |
| UX-002 | **PLANNED** | Add Opportunity themes to Market instrument pages | Relevant long-term themes and exposure scores are visible for tracked instruments. |
| UX-003 | **PLANNED** | Complete mobile interaction review | Headers, tabs, swipe, touch targets and responsive tables are verified. |
| UX-004 | **PLANNED** | Maintain palette compliance | New components use semantic theme/chart tokens rather than fixed page colours. |

## Phase 6 — Monitoring and research ingestion

| ID | Status | Task | Definition of done |
|---|---|---|---|
| MON-001 | **PLANNED** | Decide watchlist/auth model | Ownership and access rules are defined before enabling writes. |
| MON-002 | **PLANNED** | Activate watchlists | Real user-owned lists can be maintained securely. |
| MON-003 | **PLANNED** | Define alerts | Approved price, freshness, assessment, opportunity, convergence and technical triggers are documented. |
| MON-004 | **PLANNED** | Implement alerts and event history | Trigger lifecycle is persisted and visible. |
| RES-001 | **PLANNED** | Review external opinion model | Its role relative to Market Assessment is explicit and evidence is not double-counted. |
| RES-002 | **PLANNED** | Operationalise approved opinion sources | Collection, provenance, deduplication and consensus are automated and monitored. |

## Phase 7 — Strategy laboratory

| ID | Status | Task | Definition of done |
|---|---|---|---|
| STRAT-001 | **PLANNED** | Define first real strategy | Rules, universe, entry/exit logic, risk and version are persisted. |
| STRAT-002 | **PLANNED** | Define test-run ingestion format | Backtest/paper/live provenance and metrics are documented. |
| STRAT-003 | **PLANNED** | Load first real test run | Real results populate `trading_test_runs`. |
| STRAT-004 | **PLANNED** | Execute Standard Strategy Review | Decision path and outcome are persisted. |
| STRAT-005 | **PLANNED** | Surface real strategy results | Frontend displays real strategy evidence and decision outcomes. |

## Phase 8 — Quality and maintainability

| ID | Status | Task | Definition of done |
|---|---|---|---|
| QUAL-001 | **PLANNED** | Add automated tests for critical calculations/data access | Key calculations, data loaders and empty states have repeatable tests. |
| QUAL-002 | **PLANNED** | Add performance budgets/query monitoring | SQL time and network waterfalls are measured before optimisation. |
| QUAL-003 | **PLANNED** | Create operational runbook | Market-data, assessment, stale-data and deployment failure procedures are documented. |
| QUAL-004 | **PLANNED** | Add documentation checklist to development workflow | Significant architecture/schema changes include documentation updates. |

## Recommended execution order

```text
PLAN-001
   |
DOC-001 Assessment system overview
   |
   +--> DOC-002 Opportunity pipeline documentation
   +--> DOC-003 Canonical Market Assessment specification
                |
                v
        Prove both unattended assessment loops
                |
                v
          Security hardening
                |
                v
          Technical Engine
                |
                v
        Market Convergence
                |
                v
        Cross-system UX
                |
                v
       Monitoring / Strategies
```

**Current work:** `OPS-003 — IN REVIEW — awaiting independent Auditor verification of Market AI independence metadata`.

## Definition of Operational

A workflow is Operational only when its schema and implementation exist, scheduling/trigger ownership is explicit, source data is validated, real results are persisted, lifecycle reaches a terminal state, errors are recorded, retries are idempotent, access policies are deliberate, the frontend does not require privileged secrets, an end-to-end run has been verified, and the actual flow is documented.

## Completion log

| Date | Task | Evidence | Notes |
|---|---|---|---|
| 13-Aug-2026 | PLAN-001 | `documentation/project-plan.md` | Canonical task-by-task project plan created. |
| 17-Aug-2026 | Project automation governance | `automation/project-plan-builder.md`, `automation/project-plan-auditor.md` | Independent Builder/Auditor execution and quality-gate workflow established. |
| 17-Aug-2026 | DOC-001 | `documentation/project-audits/DOC-001.md` | Independent audit PASS; assessment-system overview verified and DOC-002 promoted. |
| 17-Aug-2026 | DOC-002 | `documentation/project-audits/DOC-002.md` | Independent audit PASS WITH ADVICE; Opportunity Assessment pipeline documentation verified and DOC-003 promoted. |
| 17-Aug-2026 | DOC-003 | `documentation/project-audits/DOC-003.md` | Independent audit PASS WITH ADVICE; canonical Market Assessment methodology and independence rules verified and DOC-004 promoted. |
| 17-Aug-2026 | DOC-004 | `documentation/project-audits/DOC-004.md` | Independent audit PASS WITH ADVICE; root README and documentation index reconciled and DOC-005 promoted. |
| 18-Aug-2026 | DOC-005 | `documentation/project-audits/DOC-005.md` | Independent audit PASS WITH ADVICE; Supabase data-model documentation verified against live schema/data/RLS and DOC-006 promoted. |
| 18-Aug-2026 | DOC-006 | `documentation/project-audits/DOC-006.md` | Independent audit PASS; roadmap and Phase 2 progress verified against canonical architecture and live Supabase state; DOC-007 promoted. |
| 18-Aug-2026 | DOC-007 | `documentation/project-audits/DOC-007.md` | Independent audit PASS; current Opportunity tabs, routes, palette system and responsive behaviour verified against source and production; OPS-001 promoted. |
| 18-Aug-2026 | OPS-001 | `documentation/project-audits/OPS-001.md` | Independent audit PASS WITH ADVICE; unattended Opportunity Assessment execution verified from canonical GitHub spec and live Supabase evidence; OPS-002 promoted. |
| 18-Aug-2026 | OPS-002 | `documentation/project-audits/OPS-002.md` | Independent audit PASS; live Scheduled Task verified as a thin runner that retrieves the canonical GitHub Market specification; OPS-003 promoted. |
