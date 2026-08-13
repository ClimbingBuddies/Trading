# Daily Opportunity Assessment

**Specification version:** 1.0  
**Last updated:** 13 August 2026  
**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

This document is the canonical execution specification for the **Daily Opportunity Assessment**.

A ChatGPT Scheduled Task should retrieve the latest version of this file from GitHub at the beginning of every run, then use the connected Supabase app to perform the database reads and writes described here.

Do not rely on a remembered or cached version of this specification. If this file cannot be retrieved, do not guess, do not fall back to an older remembered methodology, and do not write assessment results to Supabase.

The Opportunity Assessment is a **long-term opportunity discovery system**, not the short-term Market Assessment and not an automatic trading signal.

The governing question is:

> **What important real-world structural or technological changes could create major economic and investment opportunities over the coming months or years?**

The assessment has two independent components:

1. **Structural Opportunity Signal**
2. **Technology Inflection Signal**

Only after those two independent assessments have been completed should they be combined into the **Opportunity Assessment / Opportunity Convergence**.

---

## 1. Independence rule

Do **not** read or use the following when forming the Opportunity Assessment:

- `public.market_scores`
- `public.technical_indicators`
- `public.gpt_market_assessments`
- `public.gpt_market_runs`
- `public.market_convergence_assessments`
- current Buy/Hold/Sell ratings
- short-term price momentum or technical signals

The Opportunity Assessment must remain independent of the short-term Market Assessment.

You may read `public.instruments` when determining which existing tracked instruments have exposure to an opportunity theme.

---

## 2. Determine the assessment date

Use the current date in `Australia/Perth` as the daily Opportunity Assessment date.

The process must be idempotent. If today's assessment already exists, update/resume today's records rather than creating duplicate rows.

---

## 3. Review existing Opportunity Themes

Read:

- `public.opportunity_themes`
- `public.opportunity_theme_instruments`
- recent `public.structural_opportunity_signals`
- recent `public.technology_inflection_signals`
- recent `public.technology_inflection_events`
- recent `public.opportunity_assessments`

Review all themes with `status = 'active'` or `status = 'watch'`.

Compare today's evidence with previous assessments so that changes in direction, maturity, score and confidence are identifiable.

---

## 4. Discover new potential themes

Search current public information for meaningful **multi-year structural or technological changes**.

Relevant areas may include, but are not limited to:

- artificial intelligence infrastructure
- semiconductors
- advanced computing
- robotics and automation
- energy generation
- grid infrastructure
- energy storage and batteries
- fusion
- advanced materials
- cooling and power systems
- quantum technologies
- biotechnology
- healthcare technology
- defence technology
- space infrastructure
- communications
- industrial automation
- critical minerals
- manufacturing technology

Do not automatically create a theme merely because it appears in this list.

Create a new `public.opportunity_themes` row only where credible evidence suggests a potentially important structural change or technological bottleneck/unlock.

Normally create **no more than 3 new themes per daily run**.

If the theme already exists, reuse/update it rather than creating a similar duplicate theme.

Use a stable `theme_code` and do not casually rename an existing code.

---

# Assessment A — Structural Opportunity Signal

For every active/watch opportunity theme, independently assess the real-world structural environment.

Score each component from **0–100**.

## `demand_score`

Is underlying demand genuinely expanding?

Consider evidence such as:

- customer demand
- consumption
- orders
- market growth
- backlog
- infrastructure requirements

## `adoption_score`

Is adoption moving from experimental/niche toward mainstream use?

Consider:

- deployment numbers
- enterprise adoption
- customer penetration
- geographic expansion
- industry standardisation

## `capital_investment_score`

Is meaningful capital being committed?

Consider:

- corporate capex
- government investment
- infrastructure projects
- venture/private investment
- manufacturing capacity

## `capacity_constraint_score`

Are shortages, bottlenecks or limited capacity creating economic value for new suppliers/technology?

Consider:

- supply shortages
- power constraints
- manufacturing bottlenecks
- labour constraints
- scarce materials
- network/grid constraints

Higher scores mean the constraint creates a stronger opportunity.

## `economics_score`

Are the economics improving enough to support widespread deployment?

Consider:

- falling cost curves
- improving margins
- lower unit costs
- improving efficiency
- payback periods
- total cost of ownership

## Structural calculation

Calculate:

`overall_score = average(demand_score, adoption_score, capital_investment_score, capacity_constraint_score, economics_score)`

Store the result in:

`public.structural_opportunity_signals`

Use:

- `signal_date = <today Australia/Perth>`
- `methodology_version = 'structural-signal-v1'`

Because `(theme_id, signal_date, methodology_version)` is unique, **update today's row if the task is retried rather than creating a duplicate**.

Assign `signal_label`:

- 0–29 = `weak`
- 30–49 = `developing`
- 50–69 = `moderate`
- 70–84 = `strong`
- 85–100 = `very_strong`

`confidence` must reflect evidence quality, breadth, freshness and agreement — not simply repeat `overall_score`.

Store a concise explanation in `summary`.

Store the main evidence used in `evidence_summary` as structured JSON.

Prefer:

- official company announcements
- regulatory/government information
- reputable industry data
- credible research institutions
- reputable financial/technical reporting

Do not invent evidence.

---

# Assessment B — Technology Inflection Signal

Perform this independently from the Structural Opportunity Signal.

The central question is:

> **Is an important technological bottleneck becoming materially easier to solve?**

Identify the theme's principal:

- `bottleneck`
- `unlock_description`

Examples of the type of reasoning required:

- a heat-resistant material improving fusion reactor practicality
- a battery chemistry materially improving energy density, cycle life or cost
- new cooling technology allowing much denser AI infrastructure
- improved actuators changing humanoid robotics economics
- improved error correction changing quantum computing feasibility

Score each component from **0–100**.

## `bottleneck_unlock_score`

How substantially could the development remove a genuine limiting constraint?

## `evidence_quality_score`

How strong is the underlying evidence?

Distinguish carefully between:

- claim
- scientific result
- independent replication
- engineering demonstration
- manufacturing feasibility
- commercial validation
- scaled deployment

## `commercialisation_score`

How close is the technology to practical, economically viable deployment?

## `impact_score`

If successful, how large could the economic or industrial impact be?

## Technology Inflection calculation

Calculate:

`overall_score = average(bottleneck_unlock_score, evidence_quality_score, commercialisation_score, impact_score)`

Store the assessment in:

`public.technology_inflection_signals`

Use:

- `signal_date = <today Australia/Perth>`
- `methodology_version = 'technology-inflection-v1'`

Update today's existing row on retry rather than inserting duplicates.

Assign `signal_label`:

- 0–24 = `weak`
- 25–44 = `emerging`
- 45–64 = `developing`
- 65–84 = `strong`
- 85–100 = `major`

Assign `maturity_stage` using only:

- `scientific_result`
- `replicated`
- `engineering_demo`
- `manufacturing_feasible`
- `commercial_validation`
- `scaled_deployment`

Confidence must reflect the reliability and independence of the evidence.

---

## 5. Technology Inflection Events

When material supporting evidence is found, record it in:

`public.technology_inflection_events`

Include where available:

- `technology_signal_id`
- `event_date`
- `event_type`
- `title`
- `description`
- `source_name`
- `source_url`
- `evidence_strength`

Examples include:

- major scientific result
- independent replication
- engineering prototype
- manufacturing breakthrough
- cost reduction
- regulatory approval
- commercial contract
- first deployment
- scaled deployment

Before inserting an event, check existing recent events for the same theme, title, source URL and event date.

**Do not create duplicate evidence events.**

Do not treat a press release claiming a breakthrough as equivalent to independent validation.

---

# Opportunity Convergence

Only calculate the final Opportunity Assessment **after the Structural Signal and Technology Inflection Signal have been independently completed**.

Write the result into:

`public.opportunity_assessments`

Use:

- `methodology_version = 'opportunity-convergence-v1'`
- `assessment_date = <today Australia/Perth>`

Link:

- `structural_signal_id`
- `technology_inflection_signal_id`

Store:

- `structural_score`
- `structural_confidence`
- `technology_inflection_score`
- `technology_inflection_confidence`

When both independent signals are available:

`opportunity_score = (structural_score + technology_inflection_score) / 2`

Assign `opportunity_level`:

- 0–34 = `emerging`
- 35–54 = `watch`
- 55–69 = `high`
- 70–84 = `major`
- 85–100 = `transformational`

Opportunity confidence must consider:

- Structural Signal confidence
- Technology Inflection confidence
- agreement/disagreement between the two scores
- evidence freshness
- evidence independence

Do not simply average the two confidence values when the underlying signals strongly disagree.

Explicitly mention divergence in `summary`.

Examples:

- strong technology breakthrough + weak structural adoption = promising but early
- strong structural demand + weak technology progress = established demand without major new inflection
- strong structural + strong technology = high convergence

Set `commercial_readiness` using only:

- `early`
- `watch`
- `developing`
- `actionable`
- `mature`

`commercial_readiness` is **not a Buy/Sell recommendation**.

Set `time_horizon` to a concise range such as:

- `1–3 years`
- `3–5 years`
- `5–10 years`

based on evidence and the theme's stored horizon.

Because `(theme_id, assessment_date, methodology_version)` is unique, update today's row on retries.

---

## 6. Existing instrument exposure

For each theme, review the existing active `public.instruments` universe.

Where an existing tracked instrument has credible exposure to the theme, upsert into:

`public.opportunity_theme_instruments`

Allowed `exposure_type` values are:

- `direct`
- `enabler`
- `beneficiary`
- `supplier`
- `infrastructure`
- `substitute`
- `risk`

Assign:

- `exposure_score` from 0–100
- concise `rationale`
- `is_active`

Do not force every theme to map to an existing instrument.

Do **not** automatically create new rows in `public.instruments`.

If an important publicly listed beneficiary is identified but is not currently in the Trading universe, include it in the final report under **Potential instruments to review**, but do not add it to the database without explicit approval.

---

# Research & Evidence document

After completing each `public.opportunity_assessments` record, create or update its associated Research & Evidence document using:

`public.assessment_research_documents`

Use:

- `document_scope = 'opportunity'`
- `opportunity_assessment_id = <current opportunity assessment id>`
- `title = 'Research & Evidence'`
- `content_schema_version = 'tiptap-v1'`
- `generated_by = 'daily-opportunity-assessment'`

Store the research narrative in `tiptap_json` as valid TipTap/ProseMirror JSON with root:

```json
{"type":"doc","content":[]}
```

Populate `plain_text` with a searchable text representation of the research.

On retries or subsequent updates to the same assessment, update the existing document rather than creating a duplicate.

The Research & Evidence document should present the evidence behind the Opportunity Assessment in a readable research-note format, including where relevant:

- key structural developments
- technology bottleneck and potential unlock
- important scientific or engineering developments
- commercialisation progress
- capital investment or adoption evidence
- important beneficiaries/enablers
- risks or contradictory evidence
- links to useful source material

## Rich embedded evidence

For meaningful supporting items, create/update records in:

`public.assessment_research_embeds`

Supported `embed_type` values are:

- `article`
- `external_link`
- `chart`
- `indicator`
- `image`
- `internal_link`
- `evidence`
- `callout`

Use stable `node_id` values so retries update existing embeds rather than creating duplicates.

For articles or reports, populate where available:

- `title`
- `description`
- `source_name`
- `source_url`
- `source_published_at`
- `relevance_score`
- `confidence`

For Opportunity Assessment indicators, link directly to the relevant Supabase record where possible using:

- `structural_signal_id`
- `technology_inflection_signal_id`
- `technology_inflection_event_id`
- `opportunity_assessment_id`

This allows the frontend to render a live indicator block rather than copying a value into prose.

For charts:

- store display configuration in `chart_config`
- use `data_reference` when the chart should retrieve current Supabase data dynamically
- use `snapshot_data` when the historical values shown at assessment time should be preserved

Do not manufacture charts or indicator data. Charts must be based on real sourced or Supabase data.

Do not paste entire copyrighted articles. Store links, concise summaries and the specific evidence relevant to the assessment.

The structured Opportunity Assessment tables remain the system of record for scores. The TipTap Research & Evidence document is the explanatory research layer around those structured scores.

---

## 7. Daily change detection

Compare today's assessment with the previous assessment for each theme.

Identify:

- major score increases/decreases
- maturity-stage changes
- new bottleneck-unlock evidence
- new commercial validation
- major changes in capital investment
- major changes in adoption
- newly identified beneficiaries/enablers
- themes losing support

A single newspaper story or speculative claim should not materially change a long-term score without sufficient supporting evidence.

---

## 8. Daily report

At the end of every scheduled run, provide a concise report containing:

### 1. Major Opportunity Changes

Only meaningful changes since the previous assessment.

### 2. Highest Opportunity Convergence

Top themes by current `opportunity_score`.

### 3. Technology Inflections

New or materially strengthened bottleneck-unlock developments.

### 4. Structural Changes

Important adoption, demand, capital-investment, capacity or economic changes.

### 5. Themes to Watch

Promising themes where evidence is still early or conflicting.

### 6. Existing Trading Universe Exposure

Tracked instruments most directly exposed to the strongest themes.

### 7. Potential instruments to review

Relevant listed companies identified through the research that are not currently in the Trading instrument universe.

If there are no material changes, say:

> **No material Opportunity Assessment changes today.**

but still complete the daily Supabase assessment refresh.

---

# Governing rules

- Supabase is the system of record for assessment data and results.
- GitHub is the system of record for this methodology specification.
- Do not fabricate scientific, technical, commercial or financial evidence.
- Distinguish scientific promise from engineering feasibility.
- Distinguish engineering feasibility from commercial viability.
- Distinguish commercial viability from large-scale deployment.
- Prefer primary and authoritative sources whenever possible.
- Use multiple independent sources for major claims where feasible.
- Do not copy long passages from sources.
- Do not turn the Opportunity Assessment into a short-term Market Assessment.
- Do not use Technical Engine or ChatGPT Market Assessment results as inputs.
- Do not issue automatic trades.
- Do not equate a high Opportunity Score with a Buy recommendation.
- Be willing to reduce a score when evidence weakens.
- Keep confidence low when evidence is speculative, contradictory or poorly replicated.
- Do not require the user to be online and do not wait for manual confirmation during a normal scheduled run.

---

## Execution relationship

The intended architecture is:

```text
GitHub specification
        ↓
ChatGPT Scheduled Task
        ↓
Supabase reads / research / reasoning / writes
        ↓
Opportunity Assessment + Research & Evidence
```

The Scheduled Task should remain a small runner whose first action is to retrieve this file. Methodology changes should normally be made here rather than by replacing the Scheduled Task prompt.