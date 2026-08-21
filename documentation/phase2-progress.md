# Phase 2 Implementation Progress

**Last reviewed:** 18 August 2026  
**Roadmap:** `documentation/functional-roadmap.md`  
**Canonical execution plan:** `documentation/project-plan.md`

This document tracks the current implementation state of the Trading platform’s assessment and operational-hardening work.

The platform now has **two analytically independent assessment systems**:

1. **Short-term Market Assessment** — asks whether a tracked instrument is attractive now.
2. **Long-term Opportunity Assessment** — asks which structural or technological changes could become important over the coming months or years.

The two systems may be displayed together after each has produced an independent result, but one must not be used as an analytical input to the other.

---

# 1. Long-term Opportunity Assessment

## Current status

**Advanced partial implementation — populated and producing run history; independent operational verification remains open as `OPS-001`.**

Canonical methodology:

- `automation/daily-opportunity-assessment.md`

Primary persisted structures:

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

The system also has populated Technology Events, listed-instrument exposure mappings and Research & Evidence content.

## Architecture

```text
Current public research
        |
        +-------------------------------+
        |                               |
        v                               v
Structural Opportunity          Technology Inflection
Signal                          Signal
        |                               |
        |                        Technology Events
        |                               |
        +---------------+---------------+
                        v
            Opportunity Assessment
            / Opportunity Convergence
                        |
             +----------+----------+
             |                     |
             v                     v
       Listed Exposure       Research & Evidence
```

## Independence rule

The Opportunity workflow must not use short-term Market outputs such as:

- `technical_indicators`;
- `market_scores`;
- `gpt_market_assessments`;
- `gpt_market_runs`;
- `market_convergence_assessments`;
- Buy/Hold/Sell ratings;
- short-term technical momentum.

`public.instruments` may be read only to determine whether a researched exposure is already tracked internally. Tracked status must not affect the Opportunity exposure score.

## Remaining controlled verification — `OPS-001`

The next operational gate for this system is independent proof that a real unattended run:

1. retrieves the current GitHub specification;
2. creates a distinct run audit record;
3. processes every current active/watch theme;
4. updates Structural and Technology signals independently;
5. records Technology Events when warranted without duplication;
6. performs Opportunity Convergence only after both signals exist;
7. updates listed exposure mappings without contaminating the methodology with Market outputs;
8. updates Research & Evidence content;
9. reaches a terminal run status;
10. handles retry/resume idempotently;
11. records failures rather than fabricating success.

The presence of successful historical runs is useful evidence, but the project deliberately retains this independent quality gate before labelling the complete workflow Operational.

---

# 2. Independent AI Market Assessment

## Current status

**Partial — canonical methodology exists and persisted assessment data exists; scheduled-operation migration and verification remain open.**

Canonical methodology:

- `automation/daily-market-assessment.md`

Live Supabase on 18 August 2026 contains:

- 60 `gpt_market_assessments` rows;
- 90 `gpt_market_evidence` rows.

This confirms that the AI Market branch can persist results and evidence. It does not, by itself, prove the recurring production workflow is fully Operational.

## Target scheduled architecture

```text
ChatGPT Scheduled Task
        |
        v
retrieve automation/daily-market-assessment.md fresh from GitHub
        |
        v
check current New York date + market-data freshness
        |
        v
prepare_chatgpt_market_assessment()
        |
        +--> create/resume market_assessment_queue row
        +--> create/resume gpt_market_runs row
        |
        v
read active instruments + raw market observations + independent public research
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

## Existing Supabase lifecycle foundation

The assessment queue has explicit lifecycle fields and helper functions supporting prepare/resume/finalise behaviour.

Key helpers include:

### `prepare_chatgpt_market_assessment()`

The helper creates or resumes the current-date queue/run path, records the requested instrument count, avoids duplicate daily runs and supports safe retry behaviour.

### `finalize_chatgpt_market_assessment()`

The helper counts actual persisted assessments, updates `tickers_completed`, sets `completed_at`, derives a terminal run status and finalises the linked queue state.

A unique `(run_id, instrument_id)` constraint protects assessment rows from duplicate insertions for the same run and instrument.

## Independence rule

The independent AI Market Assessment must not use:

- `technical_indicators`;
- `market_scores`;
- `market_convergence_assessments`;
- Structural Opportunity Signals;
- Technology Inflection Signals;
- Opportunity Assessment conclusions or scores.

Its `technical_view` must be derived independently from raw market observations rather than from the separate Technical Engine.

## Remaining work

### `OPS-002` — Convert scheduled task to GitHub-spec runner

The task should become a thin runner that retrieves `automation/daily-market-assessment.md` fresh at the beginning of every run instead of embedding the full methodology in the Scheduled Task prompt.

### `OPS-003` — Standardise independence metadata

New assessment rows should persist clear methodology/independence metadata such as:

- `methodology_version = 'independent-market-ai-v1'`;
- `technical_engine_input_used = false`.

The distinction between prompt/spec version and analytical methodology version should remain explicit.

### `OPS-004` — Reactivate Daily Trading Market Assessment

The weekday task should only be reactivated after the GitHub-spec runner is wired correctly.

### `OPS-005` — Verify first unattended Market run

Verify current-date freshness checks, all active instruments, evidence persistence, finalisation and run reporting end-to-end.

### `OPS-006` — Verify retry/idempotency

Retry/resume must not create duplicate assessment or evidence records.

### `OPS-007` — Resolve historical run/backlog state

Legacy test/backlog records should be deliberately archived, superseded or finalised without replaying them as current work.

---

# 3. Market data foundation

Market data remains the common raw-data foundation for the short-term Market system.

Current foundation includes:

- 30 active instruments;
- Twelve Data provider integration;
- 15-minute market-data loading;
- `market_observations` history;
- `sync_runs` monitoring;
- market-hours handling for equities/ETFs;
- continuous eligibility for forex/crypto.

Market-data scheduling remains separate from assessment scheduling.

---

# 4. Technical Engine

## Current status

**Partial / advanced — core indicator calculation is producing persisted results.**

Live Supabase on 21 August 2026:

- `technical_indicators`: 1,136 versioned daily/weekly rows;
- `market_scores`: 0 rows.

The Technical Engine remains independent from the AI Market Assessment. Technical scoring, recurring refresh ownership and product surfaces remain later project-plan items.

Project-plan work:

- `TECH-001` define formulas, intervals, history requirements, versioning and missing-data behaviour;
- `TECH-002` implement core indicators;
- `TECH-003` implement reproducible market scoring;
- `TECH-004` add scheduling/monitoring/retry/error ownership;
- `TECH-005` independently verify the engine does not read GPT Market conclusions.

---

# 5. Market Convergence

## Current status

**Scaffolded — no persisted convergence results yet.**

Live Supabase on 18 August 2026:

- `market_convergence_assessments`: 0 rows.

Market Convergence must only occur after both branches are independently available:

```text
Independent Technical Engine
            +
Independent AI Market Assessment
            |
            v
     Market Convergence
```

Project-plan work:

- `CONV-001` define score/confidence/disagreement methodology;
- `CONV-002` populate persisted convergence rows;
- `CONV-003` define history, retry and stale-input behaviour;
- `CONV-004` surface Technical, AI and Convergence results distinctly in the frontend.

Disagreement should remain visible rather than being hidden by a mechanical average.

---

# 6. Security and operational hardening

## Current status

The older Phase 2 documentation said RLS was disabled across several Market Assessment/control tables. That statement is no longer a safe description of live state.

The refreshed Supabase data-model documentation records that targeted assessment/output tables now have RLS enabled with deliberate dashboard-read policies, while internal queue/control tables block `anon` and `authenticated` client access.

The remaining project phase therefore focuses on deliberate classification and hardening:

- `SEC-001` define public/private Market Assessment access;
- `SEC-002` complete deliberate RLS policies while preserving approved dashboard reads;
- `SEC-003` harden helper-function search paths;
- `SEC-004` review the `pg_net` warning;
- `SEC-005` remove frontend Supabase fallback configuration so Vercel environment variables are authoritative and no privileged browser secret is required.

Security work must not be treated as a blanket toggle. Policies should match the intended read/write model for each table and control path.

---

# 7. Cross-system presentation

The eventual frontend may show independent long-term and short-term results together.

Allowed:

```text
Opportunity theme exposure: High
Independent current Market Assessment: Hold
```

Not allowed:

```text
Opportunity score increased because Market Assessment is Buy.
```

Project-plan work `UX-001` through `UX-004` covers the joined research presentation, instrument/theme cross-links, responsive interaction and palette consistency.

This layer is presentation only unless a future canonical methodology explicitly defines and validates a new combined analytical score.

---

# 8. Current controlled delivery order

```text
1. Verify Opportunity Assessment unattended operation (`OPS-001`)
        |
        v
2. Convert/reactivate/verify independent AI Market Assessment (`OPS-002`..`OPS-007`)
        |
        v
3. Complete security and operational hardening (`SEC-*`)
        |
        v
4. Build independent Technical Engine (`TECH-*`)
        |
        v
5. Implement Market Convergence (`CONV-*`)
        |
        v
6. Add cross-system research presentation (`UX-*`)
        |
        v
7. Expand monitoring, research ingestion and strategy laboratory
```

---

# Definition of Operational

A workflow is Operational only when, where applicable:

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
- documentation reflects the actual flow.

A visible dashboard, populated table or historical test dataset alone is not sufficient evidence that a workflow is Operational.
