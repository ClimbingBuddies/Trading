# Daily Opportunity Assessment

**Specification version:** 1.3  
**Last updated:** 14 August 2026  
**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

This document is the canonical execution specification for the **Daily Opportunity Assessment**.

At the beginning of every run, retrieve this file fresh from the connected GitHub repository. Do not rely on a remembered, cached or previously executed copy. If the file cannot be retrieved, do not guess and do not write Opportunity Assessment results to Supabase.

The Opportunity Assessment is a **long-term opportunity discovery system**, not the short-term Market Assessment and not an automatic trading signal.

The governing question is:

> **What important real-world structural or technological changes could create major economic and investment opportunities over the coming months or years?**

The assessment has two independent components:

1. **Structural Opportunity Signal**
2. **Technology Inflection Signal**

Only after those two independent assessments are complete should they be combined into the **Opportunity Assessment / Opportunity Convergence**.

---

## 1. Independence rule

Do **not** read or use the following when forming Opportunity scores, conclusions or exposure scores:

- `public.market_scores`
- `public.technical_indicators`
- `public.gpt_market_assessments`
- `public.gpt_market_runs`
- `public.market_convergence_assessments`
- current Buy/Hold/Sell ratings
- short-term price momentum or technical signals

The Opportunity Assessment must remain independent of the short-term Market Assessment.

You may read `public.instruments` to determine whether a listed exposure is already tracked by Discover Boulders Markets. That tracked/untracked state must **not** affect how strongly the company is judged to be exposed to an Opportunity Theme.

---

## 2. Determine the assessment date

Use the current date in `Australia/Perth`.

The daily signal and assessment records are idempotent. If today's records already exist, update/resume them rather than creating duplicate daily results.

---

## 2A. Start the run audit and capture model telemetry

Every invocation — scheduled, manual or test — must create a distinct execution record in:

`public.opportunity_assessment_runs`

Before research or signal writes:

1. Read all current `active` and `watch` themes and count them as `themes_requested`.
2. Determine `execution_source`:
   - `scheduled-task` for the production Scheduled Task;
   - `manual-chat` for a direct normal-chat run;
   - `test` when the user explicitly requests a test run.
3. Set `task_id = '6a7d49a185988191a6998cb4e236a28f'` only for the production Daily Opportunity Assessment Scheduled Task. Otherwise leave it null unless another task ID is actually known.
4. Capture `model_reported` only from the executing runtime when actually available. Do not infer it from the UI, user request or an earlier run. Store `unknown` when uncertain.
5. Capture `reasoning_level_reported` only when exposed by the runtime; otherwise null.
6. Set `github_spec_version = '1.3'`.
7. Set `github_spec_sha` to the GitHub blob/content SHA returned for this file when available; otherwise null.
8. Insert the run with today's assessment date, `started_at = now()`, `status = 'running'`, telemetry above, `themes_requested`, and `themes_completed = 0`.
9. Capture the returned `run_id` and use it throughout the run.

Each invocation gets a new `run_id`; daily Structural, Technology and Opportunity records remain idempotent and should point to the most recent execution that wrote them.

If Supabase is unavailable before the audit row can be created, report the failure and stop. Do not fabricate a run ID.

---

## 3. Review existing Opportunity Themes

Read:

- `public.opportunity_themes`
- `public.opportunity_theme_instruments`
- `public.opportunity_theme_external_instruments`
- `public.opportunity_theme_all_exposures`
- recent `public.structural_opportunity_signals`
- recent `public.technology_inflection_signals`
- recent `public.technology_inflection_events`
- recent `public.opportunity_assessments`

Review every theme with `status = 'active'` or `status = 'watch'`.

Compare current evidence with previous assessments so changes in direction, maturity, score, confidence, beneficiaries and exposure can be identified.

### Baseline monitored theme universe

As of specification v1.3, the intended baseline is:

| Theme code | Theme | Status | Horizon |
|---|---|---|---|
| `AI_ADVANCED_PACKAGING` | Advanced Packaging for AI Compute | active | 1–5 years |
| `AI_DATACENTRE_POWER_COOLING` | AI Data-Centre Power and Cooling | active | 1–5 years |
| `GRID_SCALE_BATTERY_STORAGE` | Grid-Scale Battery Storage | active | 1–5 years |
| `ROBOTICS_PHYSICAL_AI` | Robotics & Physical AI | active | 1–7 years |
| `FUSION_ENERGY_SUPPLY_CHAIN` | Fusion Energy & Enabling Supply Chain | watch | 5–15 years |
| `AI_MEDICAL_DEVICES_DIAGNOSTICS` | AI-Enabled Medical Diagnostics & Devices | active | 1–5 years |
| `GRID_MODERNISATION_TRANSMISSION` | Grid Modernisation & Transmission | active | 1–8 years |
| `ADVANCED_NUCLEAR_SMRS` | Advanced Nuclear & SMRs | watch | 3–10 years |
| `CYBERSECURITY_CRITICAL_INFRASTRUCTURE` | Cybersecurity & Critical Infrastructure | active | 1–5 years |
| `WATER_SECURITY_DESALINATION_REUSE` | Water Security, Desalination & Reuse | watch | 2–10 years |

Supabase remains the system of record for the live theme set. The task must assess all current active/watch themes, including themes added later. This baseline is not a hard cap.

---

## 4. Discover new potential themes

Search current public information for meaningful **multi-year structural or technological changes**.

Relevant areas may include AI infrastructure, semiconductors, advanced computing, robotics, automation, energy generation, grids, storage, fusion, nuclear/SMRs, advanced materials, cooling and power systems, quantum technologies, biotechnology, medical technology, cybersecurity, water security/desalination/reuse, defence technology, space infrastructure, communications, critical minerals and manufacturing technology.

Do not create a theme merely because it appears in that list. Create a new `public.opportunity_themes` row only where credible evidence supports a distinct potentially important multi-year structural change, bottleneck or unlock.

Normally create no more than **3 new themes per daily run**. Reuse/update an existing theme rather than creating an overlapping duplicate. Keep `theme_code` stable.

---

# Assessment A — Structural Opportunity Signal

For every active/watch theme, independently assess the real-world structural environment. Score each component **0–100**:

- `demand_score` — genuine underlying demand expansion
- `adoption_score` — movement from experimental/niche toward mainstream use
- `capital_investment_score` — meaningful corporate, government, infrastructure or private capital commitment
- `capacity_constraint_score` — shortages/bottlenecks creating economic value for solutions; higher means stronger opportunity
- `economics_score` — improving cost, efficiency, margin, payback or total-cost economics

Calculate:

`overall_score = average(demand_score, adoption_score, capital_investment_score, capacity_constraint_score, economics_score)`

Store in `public.structural_opportunity_signals` with:

- `signal_date = <today Australia/Perth>`
- `methodology_version = 'structural-signal-v1'`
- `assessment_run_id = <current run_id>`

Update today's existing row on retry and update `assessment_run_id` to the current run.

Assign `signal_label`:

- 0–29 `weak`
- 30–49 `developing`
- 50–69 `moderate`
- 70–84 `strong`
- 85–100 `very_strong`

Confidence reflects evidence quality, breadth, freshness and agreement, not merely the score. Store a concise `summary` and structured `evidence_summary`.

Prefer official company announcements, regulatory/government sources, reputable industry data, credible research institutions and reputable financial/technical reporting. Do not invent evidence.

---

# Assessment B — Technology Inflection Signal

Perform this independently from the Structural Signal.

The central question is:

> **Is an important technological bottleneck becoming materially easier to solve?**

Identify:

- `bottleneck`
- `unlock_description`

Score each component **0–100**:

- `bottleneck_unlock_score`
- `evidence_quality_score`
- `commercialisation_score`
- `impact_score`

Distinguish claim, scientific result, independent replication, engineering demonstration, manufacturing feasibility, commercial validation and scaled deployment.

Calculate:

`overall_score = average(bottleneck_unlock_score, evidence_quality_score, commercialisation_score, impact_score)`

Store in `public.technology_inflection_signals` with:

- `signal_date = <today Australia/Perth>`
- `methodology_version = 'technology-inflection-v1'`
- `assessment_run_id = <current run_id>`

Update today's existing row on retry.

Assign `signal_label`:

- 0–24 `weak`
- 25–44 `emerging`
- 45–64 `developing`
- 65–84 `strong`
- 85–100 `major`

Use only these `maturity_stage` values:

- `scientific_result`
- `replicated`
- `engineering_demo`
- `manufacturing_feasible`
- `commercial_validation`
- `scaled_deployment`

Confidence must reflect reliability and independence of the evidence.

---

## 5. Technology Inflection Events

When material supporting evidence is found, record it in `public.technology_inflection_events` with available fields including:

- `technology_signal_id`
- `event_date`
- `event_type`
- `title`
- `description`
- `source_name`
- `source_url`
- `evidence_strength`

Examples include scientific results, replication, prototypes, manufacturing breakthroughs, cost reductions, regulatory approvals, contracts, first deployments and scaled deployments.

Before inserting, check recent events for the same theme/title/source URL/date. Do not duplicate events. Do not treat a company press-release claim as equivalent to independent validation.

---

# Opportunity Convergence

Only calculate the final Opportunity Assessment after the independent Structural and Technology assessments are complete.

Write to `public.opportunity_assessments` with:

- `methodology_version = 'opportunity-convergence-v1'`
- `assessment_date = <today Australia/Perth>`
- `assessment_run_id = <current run_id>`
- linked `structural_signal_id` and `technology_inflection_signal_id`
- structural/technology scores and confidences

When both signals are available:

`opportunity_score = (structural_score + technology_inflection_score) / 2`

Assign `opportunity_level`:

- 0–34 `emerging`
- 35–54 `watch`
- 55–69 `high`
- 70–84 `major`
- 85–100 `transformational`

Opportunity confidence must consider both signal confidences, disagreement between signals, evidence freshness and evidence independence. Do not mechanically average confidence where signals strongly disagree. Explicitly mention meaningful divergence in `summary`.

Use only these `commercial_readiness` values:

- `early`
- `watch`
- `developing`
- `actionable`
- `mature`

Set a concise evidence-based `time_horizon` such as `1–3 years`, `3–5 years` or `5–10 years` consistent with the stored theme horizon.

A high Opportunity Score is not a Buy recommendation.

---

## 6. Listed instrument exposure — tracked and external

The purpose of this section is to identify the **best publicly listed exposures to each Opportunity Theme**, whether or not Discover Boulders Markets already tracks their market data.

### 6A. Exposure discovery must not be constrained by the Trading universe

For every active/watch theme, research credible publicly listed companies and ETFs whose businesses have material economic exposure to the theme.

Rank exposure according to the relationship to the theme, not according to whether the ticker is already in `public.instruments`.

Prefer, in this order where evidence supports it:

1. direct/pure or near-pure businesses whose products or revenue materially depend on the theme;
2. material suppliers, infrastructure providers and enabling technology businesses;
3. meaningful beneficiaries;
4. broad or diluted ETFs only where they add useful exposure and no better direct mapping is available.

Do **not** allow a generic mega-cap technology company, semiconductor supplier or broad ETF to outrank a credible direct company merely because the generic instrument is already tracked internally.

Examples of the distinction:

- a listed robotics manufacturer/operator should normally rank ahead of a general-purpose GPU supplier for `ROBOTICS_PHYSICAL_AI`;
- a listed fusion developer should normally rank ahead of a broad energy ETF for `FUSION_ENERGY_SUPPLY_CHAIN`;
- a dedicated cybersecurity company should normally rank ahead of a general technology index for `CYBERSECURITY_CRITICAL_INFRASTRUCTURE`.

Normally maintain approximately **3–8 strong listed exposures per theme** where credible candidates exist, but do not force a minimum or maximum when evidence does not support it.

Allowed `exposure_type` values:

- `direct`
- `enabler`
- `beneficiary`
- `supplier`
- `infrastructure`
- `substitute`
- `risk`

Assign:

- `exposure_score` 0–100 based solely on theme relevance/materiality;
- concise `rationale` explaining the economic relationship;
- credible supporting evidence/source where available;
- `is_active` reflecting whether the mapping remains currently useful.

Exposure scores are **theme relevance scores, not trading recommendations**.

### 6B. Existing Trading-universe instruments

If the listed company/ETF already exists in `public.instruments`, upsert its mapping into:

`public.opportunity_theme_instruments`

Do not duplicate the same tracked ticker in the external table.

### 6C. Publicly listed instruments not tracked by Trading

If a credible exposure is publicly listed but does **not** exist in `public.instruments`, upsert it into:

`public.opportunity_theme_external_instruments`

Populate where available:

- `theme_id`
- `symbol`
- `instrument_name`
- `exchange_code`
- `asset_type`
- `market_source`
- `external_market_url`
- `evidence_source_name`
- `evidence_url`
- `exposure_type`
- `exposure_score`
- `rationale`
- `is_active`

Use stable exchange/ticker identity and update an existing matching record rather than duplicating it.

For an automated external quote destination, `Yahoo Finance` is the default because a stable ticker-based URL can be constructed. A different reputable external source, including MSN Money, may be stored when a stable direct quote URL is actually known. **Do not invent opaque provider quote IDs.**

An external Opportunity exposure is a research reference only. It does **not** create a market-data subscription, does not enter the short-term assessment universe and must not automatically create a row in `public.instruments`.

### 6D. Read and verify the unified exposure set

Use:

`public.opportunity_theme_all_exposures`

as the unified read/verification model across tracked and external exposures.

After updating a theme:

- verify the highest-ranked exposures are economically representative of the theme;
- ensure direct listed businesses are not displaced merely by generic tracked instruments;
- deactivate stale, duplicate, weak or misleading mappings;
- preserve lower-ranked credible enablers where useful rather than deleting them solely because a stronger direct exposure exists.

Never promote an external exposure into `public.instruments` without explicit user approval.

---

# Research & Evidence document

After completing each `public.opportunity_assessments` record, create/update its associated document in `public.assessment_research_documents` with:

- `document_scope = 'opportunity'`
- `opportunity_assessment_id = <current opportunity assessment id>`
- `title = 'Research & Evidence'`
- `content_schema_version = 'tiptap-v1'`
- `generated_by = 'daily-opportunity-assessment'`

Store valid TipTap/ProseMirror JSON rooted at:

```json
{"type":"doc","content":[]}
```

Also populate searchable `plain_text`. Update the existing document on retries/subsequent updates instead of duplicating it.

Include relevant structural developments, bottleneck/unlock, scientific/engineering developments, commercialisation, capital/adoption evidence, important listed exposures, risks/contradictory evidence and useful source links.

## Rich embedded evidence

Create/update meaningful `public.assessment_research_embeds` records. Supported `embed_type` values include:

- `article`
- `external_link`
- `chart`
- `indicator`
- `image`
- `internal_link`
- `evidence`
- `callout`

Use stable `node_id` values. Populate source metadata, relevance/confidence and relevant Supabase IDs where available. Charts must use real sourced/Supabase data through `data_reference` or preserved `snapshot_data`; do not manufacture chart data.

Do not paste whole copyrighted articles. Store links, concise summaries and specific supporting evidence.

Structured Opportunity tables remain the system of record for scores; the TipTap document is the explanatory research layer.

---

## 7. Daily change detection

Compare today's assessment and exposure set with the prior assessment. Identify meaningful:

- score increases/decreases
- maturity-stage changes
- new bottleneck-unlock evidence
- commercial validation
- capital/adoption changes
- newly identified or removed direct companies, suppliers and beneficiaries
- themes losing evidential support

A single speculative claim should not materially change a long-term score without sufficient supporting evidence.

---

## 8. Daily report

At the end of every run, provide a concise report covering:

### 1. Major Opportunity Changes
Meaningful changes since the previous assessment.

### 2. Highest Opportunity Convergence
Top themes by current `opportunity_score`.

### 3. Technology Inflections
New/materially strengthened bottleneck-unlock developments.

### 4. Structural Changes
Important adoption, demand, capital, capacity or economics changes.

### 5. Themes to Watch
Promising themes with early/conflicting evidence.

### 6. Listed Opportunity Exposure
For the strongest themes, summarise the most relevant direct/enabling listed exposures. Clearly distinguish:

- **Tracked internally** — exists in `public.instruments`;
- **External exposure** — listed company/ETF stored in `public.opportunity_theme_external_instruments` but not part of the Trading market-data universe.

### 7. Potential instruments to review
Highlight external exposures that may merit future promotion into the tracked Trading universe. This is a review list only; do not automatically promote them.

### 8. Run telemetry
Report `run_id`, `model_reported`, `reasoning_level_reported` where available, `execution_source`, `github_spec_version`, themes requested/completed and final run status.

If there are no material changes, say:

> **No material Opportunity Assessment changes today.**

but still complete the daily Supabase refresh and run-audit finalisation.

---

## 8A. Finalise the run audit

Before ending, update the current `public.opportunity_assessment_runs` row:

- `completed_at = now()`
- `themes_completed` = number of requested themes for which this execution successfully wrote/updated the final Opportunity Assessment
- `status = 'succeeded'` when all requested themes complete
- `status = 'partial'` when at least one completes but one or more fail
- `status = 'failed'` when no usable assessment results can be produced
- `status = 'skipped'` only when deliberately doing no assessment for a valid operational reason
- concise `notes`
- `error_message` for failure/material partial failure
- `updated_at = now()`

Finalise partial/failed runs whenever Supabase remains reachable. Do not leave a run indefinitely `running` because one theme failed.

---

# Governing rules

- Supabase is the system of record for assessment data/results.
- GitHub is the system of record for this methodology.
- `public.opportunity_assessment_runs` is the execution audit trail.
- Model/reasoning telemetry is self-reported operational evidence, not authoritative platform telemetry.
- Never invent model identity, reasoning level, task ID, GitHub SHA, technical evidence or market identity.
- Prefer primary/authoritative sources and multiple independent sources for major claims where feasible.
- Distinguish scientific promise, engineering feasibility, commercial viability and scaled deployment.
- Keep Opportunity Assessment independent from Technical Engine and short-term Market Assessment inputs.
- Do not issue automatic trades or equate a high Opportunity Score with a Buy recommendation.
- Be willing to reduce scores/mappings when evidence weakens.
- Keep confidence low when evidence is speculative, contradictory or poorly replicated.
- The best Opportunity exposure may be outside the active Trading market universe; do not distort exposure rankings to fit the tracked universe.
- Do not automatically add external exposures to `public.instruments`.
- Do not require the user to be online and do not wait for manual confirmation during a normal scheduled run.

---

## Execution relationship

```text
GitHub specification
        ↓
ChatGPT Scheduled Task / manual execution
        ↓
Opportunity run audit created
        ↓
Supabase reads + public research + independent reasoning
        ↓
Structural + Technology + Opportunity Assessment
        ↓
Tracked + external listed exposure mapping
        ↓
Research & Evidence + run audit finalised
```
