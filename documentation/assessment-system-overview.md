# Assessment System Overview

**System:** Discover Boulders Markets / Trading  
**Repository:** `ClimbingBuddies/Trading`  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Production:** `https://discoverbouldersmarkets.vercel.app`  
**Last verified:** 17 August 2026

## Purpose

Discover Boulders Markets contains two different assessment systems that answer different questions and must remain analytically independent:

1. **Short-term Market Assessment** — *Is this instrument attractive now?*
2. **Long-term Opportunity Assessment** — *What could become important next?*

They may be shown together in the user interface after each system has independently produced its result, but a result from one system must not be used as an analytical input to the other.

This distinction is fundamental. A strong long-term Opportunity score is not a Buy recommendation, and a strong short-term Market rating does not prove that a structural or technological opportunity exists.

---

## System at a glance

| System | Primary question | Unit of analysis | Main inputs | Convergence output | Primary UI |
|---|---|---|---|---|---|
| Market Assessment | Is this instrument attractive now? | Tracked instrument | Market observations, independent Technical Engine inputs, independent ChatGPT market research | Market Convergence | `/assessments`, `/assessments/[symbol]`, `/markets/[symbol]` |
| Opportunity Assessment | What could become important next? | Opportunity Theme | Real-world structural evidence and technology-inflection evidence | Opportunity Assessment / Opportunity Convergence | `/opportunities`, `/opportunities/[theme]` |

The word **convergence** is used in two separate contexts and must not be confused:

- **Market Convergence** combines the independent Technical Engine result with the independent ChatGPT Market Assessment.
- **Opportunity Convergence** combines the independent Structural Opportunity Signal with the independent Technology Inflection Signal.

There is no direct convergence calculation between the Market system and the Opportunity system. Cross-system presentation is a later user-experience layer, not an analytical dependency.

---

# 1. Short-term Market Assessment

## Governing question

> **Is this instrument attractive now?**

The Market Assessment system evaluates instruments already tracked by the Trading platform. Its intended architecture contains two independent analytical branches.

```text
market_observations
      |
      +--------------------------+
      |                          |
      v                          v
Technical Engine        Independent ChatGPT
technical_indicators    Market Assessment
market_scores            gpt_market_runs
      |                  gpt_market_assessments
      |                  gpt_market_evidence
      |                          |
      +------------+-------------+
                   v
        market_convergence_assessments
```

## A. Independent ChatGPT Market Assessment

The AI Market Assessment produces instrument-level research such as:

- rating;
- score;
- confidence;
- summary;
- bull case;
- bear case;
- technical view;
- macro view;
- valuation view;
- key catalysts;
- key risks;
- supporting evidence.

Primary persisted tables include:

- `public.gpt_market_runs`
- `public.gpt_market_assessments`
- `public.gpt_market_evidence`

The current frontend reads these results on `/assessments` and `/assessments/[symbol]`.

## B. Independent Technical Engine

The Technical Engine is intended to derive reproducible indicators and scores from real market observations without reading the ChatGPT Market conclusion.

Primary tables:

- `public.market_observations`
- `public.technical_indicators`
- `public.market_scores`

The Technical Engine must not use ChatGPT Market ratings, conclusions or confidence as inputs.

## C. Market Convergence

Only after both independent branches exist should Market Convergence combine them into:

- `public.market_convergence_assessments`

The convergence methodology must define score, confidence, labels and disagreement handling. A disagreement is useful information and should remain visible rather than being hidden by an average.

For example, the eventual system may show a technically strong instrument alongside a cautious AI assessment and label the final state as mixed or divergent.

## Current Market maturity

As verified against live Supabase on 17 August 2026:

- Market observations are populated and operational as the price-data foundation.
- `gpt_market_runs`, `gpt_market_assessments` and `gpt_market_evidence` contain real persisted assessment/test data.
- The most recent Market test run in Supabase completed successfully for 30/30 requested instruments.
- An older historical test run remains incorrectly `running` with `tickers_completed = 0`; that legacy state is still scheduled for deliberate cleanup.
- `technical_indicators` currently has no rows.
- `market_scores` currently has no rows.
- `market_convergence_assessments` currently has no rows.
- The Daily Trading Market Assessment Scheduled Task is not yet considered fully operational under the project plan; the canonical GitHub methodology and unattended-run verification remain planned work.

Therefore the **AI Market Assessment has persisted results, but the full two-branch Market Convergence architecture is not yet operational**.

---

# 2. Long-term Opportunity Assessment

## Governing question

> **What important real-world structural or technological changes could create major economic and investment opportunities over the coming months or years?**

The Opportunity Assessment is a long-term discovery system. It is not a technical trading model and does not issue an automatic Buy/Sell instruction.

Its canonical methodology is:

- `automation/daily-opportunity-assessment.md`

The assessment contains two independent components.

```text
real-world research
      |
      +-------------------------------+
      |                               |
      v                               v
Structural Opportunity         Technology Inflection
Signal                         Signal
      |                               |
      |                         Technology Events
      |                               |
      +---------------+---------------+
                      v
          Opportunity Assessment
          / Opportunity Convergence
                      |
          +-----------+------------+
          |                        |
          v                        v
 Instrument Exposure       Research & Evidence
```

## A. Structural Opportunity Signal

The Structural Opportunity Signal asks whether the real-world economic structure is becoming more favourable.

It independently scores:

- demand;
- adoption;
- capital investment;
- capacity constraints;
- economics.

Primary table:

- `public.structural_opportunity_signals`

This signal should be based on real-world evidence such as adoption, investment, bottlenecks, cost improvements and commercial activity.

## B. Technology Inflection Signal

The Technology Inflection Signal asks:

> **Is an important technological bottleneck becoming materially easier to solve?**

It independently scores:

- bottleneck unlock;
- evidence quality;
- commercialisation;
- impact.

Primary tables:

- `public.technology_inflection_signals`
- `public.technology_inflection_events`

The methodology distinguishes scientific claims, replication, engineering demonstrations, manufacturing feasibility, commercial validation and scaled deployment.

## C. Opportunity Convergence

Only after the Structural and Technology signals have been independently completed are they combined into the final long-term Opportunity Assessment.

Primary table:

- `public.opportunity_assessments`

Canonical methodology version:

- `opportunity-convergence-v1`

The current methodology uses the two component scores to calculate the Opportunity score and separately considers confidence, disagreement, evidence freshness and evidence independence.

A high Opportunity score means that a long-term structural/technology theme deserves attention. It does **not** mean an exposed security should automatically be bought.

## D. Instrument exposure

After the theme has been assessed, the system identifies publicly listed companies and ETFs with material exposure to the opportunity.

Tracked Trading-universe exposures are stored in:

- `public.opportunity_theme_instruments`

Credible listed exposures that are not currently tracked by the Trading market-data universe are stored separately in:

- `public.opportunity_theme_external_instruments`

The unified exposure read model is:

- `public.opportunity_theme_all_exposures`

An exposure score measures **theme relevance/materiality**, not expected short-term return and not Buy/Sell conviction.

External Opportunity exposures must not automatically be added to `public.instruments`.

## E. Research & Evidence

The explanatory research layer is stored in:

- `public.assessment_research_documents`
- `public.assessment_research_embeds`

The structured Opportunity tables remain the system of record for scores. Research documents and embeds explain the evidence, risks, events, links and context behind those scores.

## Current Opportunity maturity

As verified against live Supabase on 17 August 2026:

- 10 active/watch Opportunity Themes are currently monitored.
- Structural, Technology and final Opportunity Assessment rows are populated.
- Technology Inflection Events are populated.
- Opportunity Research & Evidence documents are populated.
- The latest scheduled Opportunity run for 17 August 2026 is recorded as `succeeded`, with 10/10 themes completed using GitHub specification version `1.3`.

The project plan still retains a formal operational-verification item (`OPS-001`) so that the unattended workflow is independently checked against the full Definition of Operational before the project labels the pipeline fully Operational.

---

# 3. Independence rules

## Opportunity Assessment must not use Market outputs

When forming Structural, Technology, Opportunity or exposure scores, the Opportunity workflow must not use:

- `public.market_scores`;
- `public.technical_indicators`;
- `public.gpt_market_assessments`;
- `public.gpt_market_runs`;
- `public.market_convergence_assessments`;
- current Buy/Hold/Sell ratings;
- short-term price momentum or technical signals.

It may use `public.instruments` only to determine whether a researched listed exposure is already tracked internally. Tracked/untracked status must not influence the exposure score.

## Technical Engine must not use AI Market conclusions

The independent Technical Engine should derive its indicators and market scores from market/indicator inputs only. It must not read the ChatGPT Market rating or conclusion when creating its own score.

## Market AI must remain independently identifiable

The independent ChatGPT Market workflow should record methodology/version metadata and whether Technical Engine input was used. The project target is to make the independence explicit in persisted metadata before Market Convergence is operationalised.

## Cross-system display is allowed

After independent results have been produced, the frontend may show them beside one another to help research.

Allowed example:

```text
Long-term Opportunity exposure: High
Current independent Market Assessment: Hold
```

Not allowed:

```text
Opportunity score increased because the current Market rating is Buy.
```

The first is presentation. The second contaminates the long-term methodology with short-term output.

---

# 4. Convergence boundaries

There are three distinct layers to keep separate.

## Layer 1 — independent inputs

```text
Market system:
Technical Engine        ChatGPT Market Assessment

Opportunity system:
Structural Signal       Technology Inflection Signal
```

## Layer 2 — within-system convergence

```text
Technical + ChatGPT Market
        -> Market Convergence

Structural + Technology
        -> Opportunity Convergence
```

## Layer 3 — cross-system research presentation

```text
Market result + Opportunity exposure/theme context
        -> displayed together for the user
```

Layer 3 does not create a new score unless a future project-plan item explicitly defines and validates such a methodology. The current plan calls for combined presentation while preserving analytical independence.

---

# 5. User-interface cross-reference

The production application exposes the systems as separate primary navigation destinations.

## Primary navigation

`components/AppNav.tsx` currently provides:

- `/admin` — operational monitoring;
- `/markets` — market data;
- `/assessments` — short-term AI Market Assessments;
- `/opportunities` — long-term Opportunity Assessments;
- `/strategies` — strategy laboratory.

## `/assessments`

Purpose: latest independent ChatGPT Market Assessment overview.

Current UI includes:

- latest assessment date;
- instruments assessed;
- rating distribution;
- average confidence;
- highest-conviction instruments;
- lowest-conviction instruments;
- latest run status;
- recent assessment table.

Primary sources:

- `gpt_market_assessments`
- `gpt_market_runs`
- `instruments`

## `/assessments/[symbol]`

Purpose: instrument-level ChatGPT Market Assessment.

Current UI includes:

- rating;
- score;
- confidence;
- summary;
- bull/bear cases;
- technical, macro and valuation views;
- catalysts and risks;
- linked supporting evidence;
- link to the corresponding Market page.

Primary sources:

- `instruments`
- `gpt_market_assessments`
- `gpt_market_evidence`

This route currently represents the **AI branch**, not a completed Market Convergence view.

## `/opportunities`

Purpose: long-term Opportunity Assessment overview.

The current page explicitly labels itself:

> **Long-term discovery, not a Buy/Sell signal.**

Current UI includes the Opportunity score summary, daily run status and theme cards.

## `/opportunities/[theme]`

Purpose: detailed long-term theme analysis.

Current tabs are:

- Overview;
- Investment Case;
- Synergies;
- Exposure;
- Events;
- AI Recommendation.

The Overview visibly separates:

- Structural Opportunity;
- Technology Inflection;
- Opportunity Convergence.

The Exposure view maps theme relevance to listed instruments and links tracked instruments to `/markets/[symbol]`.

The AI Recommendation tab is a summary of the long-term Opportunity Assessment only and explicitly directs the user to review the independent current Market Assessment before taking trading action.

## Opportunity exposure market context

`components/OpportunityExposurePanel.tsx` adds a contextual market inspector to the Opportunity Exposure view. For tracked exposures it can display internal price history and currently defaults the trend period to `1Y` when an exposure is selected.

This is a **display/cross-reference feature**. Price trend is fetched after the Opportunity exposure exists and must not be treated as an input to the Opportunity score.

---

# 6. Source-of-truth responsibilities

## Supabase

Supabase is the system of record for persisted platform data and assessment results.

It owns, among other things:

- market observations;
- assessment runs/results/evidence;
- technical indicators/scores when implemented;
- convergence rows when implemented;
- Opportunity Themes/signals/assessments;
- exposure mappings;
- Research & Evidence documents and embeds.

## GitHub

GitHub is the system of record for:

- source code;
- canonical assessment methodology;
- architecture and operational documentation;
- project-plan state.

Scheduled assessment tasks should increasingly behave as thin runners that retrieve their current canonical GitHub specification before execution.

## Vercel

`boulders-market` is the production application. The frontend displays persisted results but does not by itself prove that an underlying workflow is Operational.

---

# 7. Operational maturity rule

A visible dashboard, populated table or deployed route is not sufficient evidence that a workflow is Operational.

Under `documentation/project-plan.md`, a workflow is Operational only when, where applicable:

- schema and implementation exist;
- scheduling/trigger ownership is explicit;
- source data is validated;
- real results are persisted;
- lifecycle reaches a terminal state;
- errors are recorded;
- retries are idempotent;
- access policies are deliberate;
- the frontend does not require privileged secrets;
- an end-to-end run has been verified;
- documentation reflects the real flow.

This is why parts of both assessment architectures may be visible or populated while still being classified as partial, scaffolded or awaiting verification.

---

# 8. Related canonical documentation

- Project execution plan: `documentation/project-plan.md`
- Frontend routes: `documentation/frontend-route-map.md`
- Platform architecture: `documentation/platform-architecture.md`
- Supabase model: `documentation/supabase-data-model.md`
- Opportunity methodology: `automation/daily-opportunity-assessment.md`
- Project Builder: `automation/project-plan-builder.md`
- Project Auditor: `automation/project-plan-auditor.md`

Planned follow-on documentation includes:

- `documentation/pipelines/opportunity-assessment-pipeline.md` (`DOC-002`)
- `automation/daily-market-assessment.md` (`DOC-003`)

Those documents should deepen lifecycle and execution detail without changing the independence boundaries defined here.
