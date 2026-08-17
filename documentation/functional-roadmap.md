# Trading Platform Functional Roadmap

**Last reviewed:** 18 August 2026  
**Canonical execution plan:** `documentation/project-plan.md`

This roadmap classifies Discover Boulders Markets by what is working now, what should be finished next, and what remains future capability. It reflects the current architecture in which the platform contains two analytically independent assessment systems:

1. **Short-term Market Assessment** — *Is this instrument attractive now?*
2. **Long-term Opportunity Assessment** — *What could become important next?*

They may be presented together after each system has independently produced its result, but one must not be used to form the other.

The roadmap is based on current GitHub implementation and live Supabase state. A table, dashboard or historical dataset existing is not sufficient evidence that an end-to-end workflow is Operational.

## Roadmap principles

1. Supabase is the source of truth for persisted platform state and assessment results.
2. GitHub is the source of truth for source code, canonical methodology and project control.
3. A table existing does not mean the feature is operational.
4. Complete partially connected operating loops before expanding the UI.
5. Do not fabricate production data, metrics, evidence, prices or links.
6. Keep public dashboard access read-only unless a feature explicitly requires authenticated writes.
7. Make scheduling ownership explicit so two schedulers cannot process the same workflow.
8. Preserve analytical independence between Opportunity Assessment, AI Market Assessment and the Technical Engine until their defined convergence stages.
9. Important scoring workflows should store methodology/version metadata.
10. Scheduled and retryable workflows should be idempotent and reach a terminal state.

---

# Phase 1 — Working Now / Persisted Foundations

## Market-data ingestion — Operational

Current foundation:

- Twelve Data provider integration.
- 30 active instruments.
- provider/instrument mappings.
- `full-twelve-data-load` Edge Function.
- single-symbol loader/test path.
- 15-minute Supabase pg_cron schedule.
- US-market-hours rules for equities/ETFs.
- continuous forex/crypto eligibility.
- `market_observations` history.
- `sync_runs` operational monitoring.

## Admin dashboard — Operational monitoring foundation

Current capability includes:

- loader health and freshness;
- loads/observations today;
- active instruments;
- failed/partial run counts;
- observation history;
- sync history and drill-through.

## Markets dashboard — Operational market-data view

Current capability includes:

- active universe;
- asset-class filters and search;
- latest observations/prices;
- provider and freshness information;
- price-history drill-through;
- links to current assessment context where available.

## Independent AI Market Assessment — Persisted / partial operational maturity

The short-term AI Market branch uses:

- `gpt_market_runs`
- `gpt_market_assessments`
- `gpt_market_evidence`
- `/assessments`
- `/assessments/[symbol]`

Live Supabase on 18 August 2026 contains 60 Market Assessment rows and 90 evidence rows. This proves persisted assessment capability, not the complete unattended daily operating loop.

Canonical methodology now exists at:

- `automation/daily-market-assessment.md`

The current project plan still requires the scheduled task to be converted to a thin GitHub-spec runner, independence metadata to be standardised, the task to be reactivated, a complete unattended run to be verified, retry/idempotency to be proven, and historical backlog state to be resolved before this branch is called fully Operational.

## Long-term Opportunity Assessment — Persisted / advanced partial maturity

The Opportunity system contains two independent components:

```text
Structural Opportunity Signal
              +
Technology Inflection Signal
              |
              v
Opportunity Assessment / Opportunity Convergence
              |
       +------+-------+
       |              |
 Exposure        Research & Evidence
```

Primary persisted structures include:

- `opportunity_themes`
- `structural_opportunity_signals`
- `technology_inflection_signals`
- `technology_inflection_events`
- `opportunity_assessments`
- `opportunity_theme_instruments`
- `opportunity_theme_external_instruments`
- `opportunity_theme_all_exposures`
- `assessment_research_documents`
- `assessment_research_embeds`
- `opportunity_assessment_runs`

Live Supabase on 18 August 2026 contains:

- 10 active/watch Opportunity themes;
- 43 Structural Opportunity Signal rows;
- 43 Technology Inflection Signal rows;
- 43 Opportunity Assessment rows.

The canonical methodology is:

- `automation/daily-opportunity-assessment.md`

This system is substantially populated and has successful run history, but `OPS-001` deliberately remains open until an unattended run is independently verified against the project-wide Definition of Operational.

## Strategy decision framework — Operational as a framework

The active `STANDARD_STRATEGY_REVIEW` system template evaluates defined performance gates and can produce continue/revise/pause/validate/promote outcomes.

The framework exists, but a full real strategy laboratory remains future work until real strategies and test runs populate the currently unused execution tables.

---

# Phase 2 — Finish Both Assessment Loops and Harden Operations

## Priority 1 — Independently verify Opportunity Assessment operation

**Project-plan item:** `OPS-001`

The Opportunity system already has a canonical GitHub specification and populated results. The remaining gate is not another redesign; it is independent proof that the unattended workflow satisfies the full Operational definition.

Verify that a real scheduled run:

- retrieves the current GitHub specification;
- creates a distinct run audit row;
- evaluates every current active/watch theme;
- updates Structural and Technology signals independently;
- creates/updates Technology Events when warranted;
- creates Opportunity Convergence only after both signals exist;
- updates tracked/external exposure mappings without contaminating the score with Market data;
- updates Research & Evidence documents/embeds;
- reaches a terminal run state;
- is idempotent on retry;
- records failures rather than fabricating success.

## Priority 2 — Complete the independent AI Market Assessment operating loop

**Project-plan items:** `OPS-002` through `OPS-007`

Target architecture:

```text
ChatGPT Scheduled Task
      |
      v
retrieve automation/daily-market-assessment.md fresh
      |
      v
check current New York date + market-data freshness
      |
      v
prepare_chatgpt_market_assessment()
      |
      +--> create/resume queue row
      +--> create/resume gpt_market_run
      |
      v
read active instruments + raw market observations + independent research
      |
      v
Independent ChatGPT Market Assessment
      |
      +--> gpt_market_assessments
      +--> gpt_market_evidence
      |
      v
finalize_chatgpt_market_assessment()
      |
      +--> tickers_completed
      +--> completed_at
      +--> succeeded / partial / failed
```

Required completion work:

1. convert the scheduled task into a thin GitHub-spec runner;
2. standardise persisted independence metadata such as `independent-market-ai-v1` and `technical_engine_input_used = false`;
3. reactivate the weekday task only after the canonical specification is wired in;
4. verify a complete unattended current-date run;
5. verify retry/resume behaviour does not duplicate assessments or evidence;
6. deliberately resolve legacy run/backlog state.

The AI Market Assessment must not use `technical_indicators`, `market_scores`, Market Convergence outputs or Opportunity Assessment outputs when forming its conclusions.

## Priority 3 — Security and operational hardening

**Project-plan items:** `SEC-001` through `SEC-005`

The older roadmap incorrectly stated that RLS was disabled across the Market Assessment tables. Current live state has already moved beyond that baseline for the targeted assessment/research tables. The remaining security phase is therefore a deliberate hardening/reconciliation exercise, not a blanket “turn RLS on” task.

Remaining work includes:

- define published versus private/control access explicitly;
- verify and complete deliberate RLS policies without breaking approved dashboard reads;
- keep anonymous writes blocked;
- protect internal queue/run-control tables;
- harden helper-function search paths;
- review the `pg_net` warning;
- remove frontend Supabase fallback configuration so production relies on Vercel environment variables without privileged browser secrets.

## Priority 4 — Build the independent Technical Engine

**Project-plan items:** `TECH-001` through `TECH-005`

Current live state on 18 August 2026:

- `technical_indicators`: 0 rows;
- `market_scores`: 0 rows.

The Technical Engine should be reproducible and versioned. It should derive indicators and scores from market/indicator inputs only and must not read AI Market conclusions.

Work sequence:

1. define formulas, intervals, history requirements, versions and missing-data behaviour;
2. generate core indicators;
3. generate reproducible market scores;
4. add scheduling, retries, error handling and Admin monitoring;
5. independently verify the engine does not use GPT Market conclusions.

## Priority 5 — Implement Market Convergence

**Project-plan items:** `CONV-001` through `CONV-004`

Current live state on 18 August 2026:

- `market_convergence_assessments`: 0 rows.

Only after the independent Technical Engine and independent AI Market Assessment are both operating should they converge.

Required work:

- define score/confidence methodology;
- preserve visible disagreement rather than hiding it;
- populate persisted convergence rows;
- define uniqueness/history/retry/stale-input behaviour;
- surface Technical, AI and Convergence results distinctly in the frontend.

## Priority 6 — Cross-system investment research presentation

**Project-plan items:** `UX-001` through `UX-004`

The long-term Opportunity system and short-term Market system may be displayed together only after they independently produce results.

Allowed:

```text
Long-term Opportunity exposure: High
Current independent Market Assessment: Hold
```

Not allowed:

```text
Opportunity score increased because the current Market rating is Buy.
```

The purpose of this phase is joined research context, not a new combined score.

---

# Phase 3 — Monitoring, Research Ingestion and Strategy Laboratory

## Watchlists and alerts

Future work includes:

- decide watchlist/auth ownership model;
- activate real user-owned watchlists;
- define approved price, freshness, assessment, opportunity, technical and convergence alert triggers;
- persist alert lifecycle and event history.

## External opinion/research pipeline

Existing partial structures include:

- `opinion_sources`
- `opinion_reviews`
- `instrument_opinions`
- `instrument_opinion_consensus`

Future work should explicitly define how external opinion is used without double-counting evidence already consumed by the independent Market Assessment.

## Strategy laboratory

Existing schema supports:

- strategy definitions;
- backtest/paper/live test runs;
- performance metrics;
- decision-tree evaluation;
- persisted outcomes.

Do not build performance dashboards before real strategy test data exists.

---

# Phase 4 — Quality and Maintainability

The project plan includes dedicated work for:

- automated tests for critical calculations and data access;
- performance budgets and query/network monitoring;
- an operational runbook;
- a documentation checklist for architecture/schema changes.

These controls become increasingly important as the Technical Engine and convergence layers start producing decision-support outputs automatically.

---

# Recommended delivery order

```text
1. Keep market-data ingestion stable
        |
        v
2. Independently verify Opportunity Assessment unattended operation
        |
        v
3. Convert + reactivate + verify independent AI Market Assessment
        |
        v
4. Complete security and operational hardening
        |
        v
5. Build and verify independent Technical Engine
        |
        v
6. Implement Market Convergence
        |
        v
7. Add cross-system research presentation
        |
        v
8. Expand monitoring / research ingestion / strategy laboratory
        |
        v
9. Strengthen tests, performance monitoring and runbooks
```

# Working definition of platform maturity

A workflow should only be described as **Operational** when, where applicable:

- schema and implementation exist;
- scheduling/trigger ownership is explicit;
- source data is validated;
- real results are persisted;
- lifecycle reaches a terminal state;
- errors are recorded;
- retries are idempotent;
- access policies are deliberate;
- frontend access does not require privileged secrets;
- an end-to-end run has been independently verified;
- documentation explains the actual flow.

A dashboard, populated table or historical test dataset alone does not satisfy this definition.
