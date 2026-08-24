# Daily Trading Market Assessment

**Specification version:** 1.1  
**Last updated:** 24 August 2026  
**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

This document is the canonical execution specification for the **Daily Trading Market Assessment**.

At the beginning of every production run, retrieve this file fresh from the connected GitHub repository. Do not rely on a remembered, cached or previously executed copy. If this file cannot be retrieved, do not guess and do not write Market Assessment results to Supabase.

The Market Assessment is the independent AI branch of the short-term market system. Its governing question is:

> **Is this tracked instrument attractive now?**

It produces instrument-level research and persisted evidence. It does **not** calculate the Technical Engine result and it does **not** perform Market Convergence.

---

## 1. Independence rules

The AI Market Assessment must remain analytically independent from both the Technical Engine and the long-term Opportunity Assessment.

### 1A. Do not use Technical Engine or Market Convergence outputs

When forming ratings, scores, confidence, conclusions, technical commentary or evidence, do **not** read or use:

- `public.technical_indicators`
- `public.market_scores`
- `public.market_convergence_assessments`
- any derived Technical Engine score, label or conclusion

The `technical_view` field in `public.gpt_market_assessments` must be the AI assessment's own interpretation of raw/recent market observations and price history. It must not copy or depend on the independent Technical Engine.

Persist:

- `methodology_version = 'independent-market-ai-v1'`
- `technical_engine_input_used = false`

for every new or updated assessment produced under this specification.

### 1B. Do not use Opportunity Assessment outputs

When forming the Market rating, score, confidence or conclusion, do **not** read or use:

- `public.structural_opportunity_signals`
- `public.technology_inflection_signals`
- `public.technology_inflection_events`
- `public.opportunity_assessments`
- Opportunity exposure scores or Opportunity Convergence conclusions

The Market and Opportunity systems may later be displayed together in the frontend, but one must not be used to form the other.

### 1C. Allowed inputs

The independent AI Market Assessment may use:

- `public.instruments`
- `public.market_observations`
- recent raw price history and data freshness
- current instrument metadata
- current public company, regulatory, macroeconomic and market information
- current external opinion/consensus data in Supabase where available
- reputable current web research where it materially improves the assessment

External opinion is evidence, not an automatic rating. Distinguish sourced opinion from fact and from the AI's own judgement.

External opinion must follow `documentation/specifications/external-opinion-model.md` (`external-opinion-v1`). In particular:

- `public.instrument_opinions` is the atomic normalized opinion-evidence layer;
- `public.instrument_opinion_consensus` is a derived summary, not an additional independent source;
- `public.opinion_sources` is source-registry metadata, not evidence;
- `public.opinion_reviews` is collection/review telemetry, not evidence;
- the same underlying external source or claim must contribute to evidence breadth/confidence at most once, even when it appears in both Supabase opinion data and direct web research;
- do not mechanically map an external stance, rating, target price or `consensus_score` into the AI Market rating/score;
- a dated opinion snapshot may be historical context, but it must not be described as current consensus unless its source dates support that description.

---

## 2. Assessment date and scope

Use the current date in `America/New_York` as the Market Assessment date because the workflow is aligned to the US market session.

Assess the current active Trading universe only:

- read `public.instruments`
- include instruments where `is_active = true`

Do not process historical pending queue records from earlier dates unless the user explicitly requests historical recovery work.

A normal production run works only on the current New York assessment date.

---

## 3. Validate source-data freshness before starting

Before creating or resuming an assessment run:

1. read the active instrument universe;
2. inspect the latest relevant `public.market_observations` for those instruments;
3. assess whether the market-data loader appears healthy and sufficiently current for the intended assessment date;
4. take account of whether there was a relevant market session to assess.

Do not manufacture or simulate current results when the source data is clearly stale, the loader has failed, there was no relevant session, or Supabase is unavailable.

If the assessment cannot safely proceed, report the reason clearly and do not fabricate ratings, prices or evidence.

---

## 4. Prepare or resume today's idempotent run

Use the existing orchestration function:

```sql
SELECT *
FROM public.prepare_chatgpt_market_assessment(
  <current America/New_York date>,
  'chatgpt-scheduled-task',
  'independent-market-ai-v1'
);
```

The live function is responsible for creating or reusing the daily queue/run pair and returns:

- `queue_id`
- `run_id`
- `effective_run_date`
- `queue_status`
- `run_status`
- `tickers_requested`
- `tickers_completed`
- `already_complete`

Use the returned `queue_id` and `run_id` for the entire run.

If `already_complete = true`, do not create duplicate assessments. Report that the date is already complete and stop.

The current database enforces uniqueness for:

```text
public.gpt_market_assessments (run_id, instrument_id)
```

so retries must reuse the same run rather than creating duplicate assessment rows.

---

## 5. Determine remaining instruments

Query:

- all active `public.instruments`;
- existing `public.gpt_market_assessments` rows for the current `run_id`.

Process only instruments that do not yet have a valid assessment row for that run.

If the run is interrupted, the next invocation must resume the same daily run and process only the missing instruments.

Do not replay already completed instruments merely because the task restarted.

---

## 6. Independent instrument assessment

For each missing active instrument, establish a current evidence set from permitted inputs.

Consider, where relevant:

- recent raw price behaviour and volatility from `public.market_observations`;
- source-data freshness;
- current company or fund developments;
- earnings, guidance and material filings;
- valuation context where evidence is available;
- macroeconomic or sector conditions;
- material catalysts;
- material risks;
- reputable external analyst/opinion context;
- current regulatory or official information;
- current reputable financial reporting.

Do not invent prices, filings, events, analyst views, sources, URLs or evidence.

Where material current information cannot be established, reduce confidence rather than filling the gap with unsupported claims.

### Rating scale

Use only:

- `Strong Buy`
- `Buy`
- `Hold`
- `Sell`
- `Strong Sell`

### Score and confidence

Store:

- `score` from 0 to 100 as the AI Market Assessment's overall current attractiveness score;
- `confidence` from 0 to 100 reflecting evidence quality, freshness, breadth, consistency and uncertainty.

The score and confidence are separate. A strong directional view with weak or conflicting evidence should not receive artificially high confidence.

Evidence breadth is the number and quality of distinct underlying sources/claims, not the number of internal rows representing them. A derived external-opinion consensus plus its constituent observations must not inflate confidence as though they were independent confirmations.

### Required assessment fields

Upsert into `public.gpt_market_assessments` for the current `(run_id, instrument_id)`:

- `assessment_date`
- `rating`
- `confidence`
- `score`
- `summary`
- `bull_case`
- `bear_case`
- `technical_view`
- `macro_view`
- `valuation_view`
- `key_catalysts`
- `key_risks`
- `evidence_summary`
- `model_version`
- `methodology_version = 'independent-market-ai-v1'`
- `technical_engine_input_used = false`

Use a truthful runtime/model identifier for `model_version` when available. If the exact executing model is not exposed, use the configured task/model label rather than inventing a specific model identity.

The assessment is research and monitoring output, not automatic trade execution.

---

## 7. Supporting evidence

For every assessment, write useful evidence into `public.gpt_market_evidence` linked by `assessment_id`.

Populate where available:

- `evidence_type`
- `source_name`
- `source_url`
- `evidence_text`
- `relevance_score`
- `confidence`

Evidence may include:

- Supabase market data;
- official company or fund information;
- regulatory filings or announcements;
- official macroeconomic data;
- reputable financial news;
- credible external opinion or consensus material.

Do not create fake URLs or unsupported evidence.

### External-opinion deduplication

Before treating external opinion/web research as separate evidence, apply `external-opinion-v1` source identity in this order:

1. normalized canonical source URL;
2. `(source_id, external_reference)` when using `instrument_opinions`;
3. `content_hash`;
4. deterministic source + publication time/date + normalized headline/claim fallback when stronger identifiers are unavailable.

If the same underlying source is found in both `instrument_opinions` and direct web research, it is one logical evidence item. Prefer the representation with the clearest provenance/freshness and do not count the duplicate path as corroboration.

If `instrument_opinion_consensus` is used as a summary, do not also count the constituent `instrument_opinions` as additional evidence breadth for the same claim set. If the constituents are assessed individually, the consensus is a summary/display aid rather than a further evidentiary vote.

Use `evidence_type = 'external_opinion'` for analyst ratings, target-price context, sentiment and sourced commentary. Preserve the actual canonical source URL where available and make the source/as-of date explicit when recency matters.

Multiple URLs do not automatically mean independent evidence: syndicated copies of one wire story, press release or analyst note should be grouped rather than used to inflate confidence.

On retry, do not blindly append duplicate evidence. Reuse, replace or deduplicate evidence associated with the assessment as appropriate.

Where an external source has materially changed since the earlier partial run, prefer the current verified evidence and make the updated conclusion clear.

---

## 8. Progress accounting

As instruments are completed, keep:

```text
public.gpt_market_runs.tickers_completed
```

consistent with the actual number of persisted `public.gpt_market_assessments` rows for the current `run_id`.

Do not report completion counts from memory or intended work. Counts must reflect persisted rows.

---

## 9. Finalise every started run

After processing has finished, call:

```sql
SELECT *
FROM public.finalize_chatgpt_market_assessment(
  <queue_id>,
  <run_id>,
  <brief truthful run notes>
);
```

The live function counts actual persisted assessment rows and sets the run/queue terminal status to:

- `succeeded` when completed rows meet the requested universe;
- `partial` when at least one assessment exists but the full universe was not completed;
- `failed` when no assessment rows were completed.

Call finalisation even when some instruments fail, so a started run does not remain indefinitely `running` merely because the universe was only partially completed.

If the finalisation call itself fails, report that explicitly. Do not claim a terminal state that was not persisted.

---

## 10. Retry and idempotency rules

A retry for the same New York assessment date must:

1. call `prepare_chatgpt_market_assessment` for the same date;
2. reuse the existing queue/run where present;
3. inspect already persisted assessments;
4. process only missing instruments;
5. avoid duplicate evidence, including duplicate external-opinion/direct-web representations of the same source;
6. keep `tickers_completed` aligned with actual assessment rows;
7. finalise the reused run.

Never create a second current-date assessment merely because the first execution was interrupted.

Historical inconsistent or stale queue/run records are not to be replayed as current work. Their cleanup is governed separately by the project plan.

---

## 11. Failure handling

### GitHub unavailable

If this canonical specification cannot be retrieved fresh, stop. Do not run from a remembered methodology and do not write Market Assessment results.

### Supabase unavailable

If required source data, orchestration functions or writes are unavailable, do not fabricate a run ID or result. Report the failure clearly.

### Stale market data

If source data is clearly too stale for a defensible current assessment, do not manufacture ratings. Report the freshness problem and leave a truthful operational result.

### Individual instrument failure

Continue other instruments where safe. Record the failed/skipped instruments and reason. Finalise the overall run so it reaches the appropriate terminal state.

### Evidence uncertainty

Lower confidence and state the uncertainty. Do not convert weak evidence into a strong conclusion merely to fill required fields.

---

## 12. End-of-run report

Report concisely:

- assessment date;
- run ID;
- final persisted status;
- instruments requested;
- instruments completed;
- rating distribution;
- highest-conviction assessments;
- lowest-confidence assessments;
- failed or skipped instruments;
- data-freshness or loader issues;
- whether the run was a fresh execution, resumed partial run, or already complete.

Do not expose privileged credentials or service-role secrets.

---

## 13. Boundary with Technical Engine and Market Convergence

This workflow stops after the independent AI Market Assessment is persisted.

It must not:

- populate `public.technical_indicators`;
- populate `public.market_scores`;
- populate `public.market_convergence_assessments`;
- alter Technical Engine methodology;
- calculate a combined AI + Technical score.

External opinion is consumed, when useful, only inside this independent AI branch. Market Convergence must not ingest the same external-opinion data again as a third analytical branch, because that would double-count evidence already reflected in the AI Market Assessment.

Those are separate project-plan stages.

The intended future architecture is:

```text
Raw market observations
      |                       |
      v                       v
Technical Engine      Independent AI Market Assessment
                              ^
                              |
                     External opinion evidence
      |                       |
      +-----------+-----------+
                  v
          Market Convergence
```

Independence is valuable because disagreement between the two analytical branches is itself useful information.

---

## 14. Source-of-truth responsibilities

### Supabase

Supabase is the system of record for:

- active instruments;
- market observations;
- run/queue lifecycle;
- AI Market Assessment rows;
- supporting evidence;
- persisted completion state;
- normalized external-opinion observations/consensus where available.

### GitHub

GitHub is the system of record for this methodology and future revisions to it. External-opinion interpretation and deduplication are governed by `documentation/specifications/external-opinion-model.md`.

### Scheduled Task

The production Scheduled Task should be a thin runner that retrieves this file fresh and executes it. The migration from the current embedded task prompt to that thin-runner form is a separate project-plan item (`OPS-002`).

---

## 15. Current implementation notes

Verified on 17 August 2026:

- `public.prepare_chatgpt_market_assessment` exists in live Supabase;
- `public.finalize_chatgpt_market_assessment` exists in live Supabase;
- `public.gpt_market_assessments` has a unique constraint on `(run_id, instrument_id)`;
- `public.gpt_market_assessments` includes `methodology_version` and `technical_engine_input_used` columns;
- the existing Daily Trading Market Assessment Scheduled Task is currently disabled;
- its current prompt still embeds the methodology directly rather than retrieving this GitHub file;
- changing that Scheduled Task into a thin GitHub-spec runner remains `OPS-002`, not part of this documentation task.

RES-001 review on 24 August 2026 adds the authoritative external-opinion evidence boundary without claiming that the external-opinion collection subsystem itself is operational. Operational collection, provenance, consensus generation, monitoring and machine-verifiable deduplication remain RES-002.
