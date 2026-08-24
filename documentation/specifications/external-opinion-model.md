# External Opinion Model Specification

**Task:** RES-001 — Review external opinion model  
**Specification version:** `external-opinion-v1`  
**Date:** 24 August 2026  
**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

Define the role of the external-opinion subsystem relative to the independent ChatGPT Market Assessment and establish a non-double-counting evidence contract for later operationalisation under RES-002.

The external-opinion subsystem is **not** a fourth analytical branch beside the Technical Engine, AI Market Assessment and Market Convergence. It is a normalized evidence/staging layer that may supply sourced external opinion to the independent AI Market Assessment.

It does not produce an automatic Trading rating, does not alter the Technical Engine, does not form Opportunity Assessment, and does not independently participate in Market Convergence.

## Governing principle

> One underlying external source or claim may increase Market Assessment evidence breadth/confidence at most once, regardless of how many internal representations of that source exist.

The AI Market Assessment remains responsible for its own score, rating and confidence. External opinion is evidence, not a vote that is mechanically converted into a Trading conclusion.

## Current live model

The live Supabase model contains four related tables:

| Table | Role | Evidence status |
|---|---|---|
| `opinion_sources` | Registry of approved/known source categories | Metadata only; not evidence by itself |
| `opinion_reviews` | Review/collection run lifecycle and operational counts | Control/telemetry only; not evidence |
| `instrument_opinions` | Atomic normalized external observations for an instrument | Canonical opinion evidence records |
| `instrument_opinion_consensus` | Derived per-instrument/as-of-date summary of normalized observations | Derived summary; not an additional independent source |

Verified live state at RES-001 review:

- 5 `opinion_sources` rows;
- 1 `opinion_reviews` row, terminal `succeeded`;
- 2 `instrument_opinions` rows;
- 1 `instrument_opinion_consensus` row;
- the existing sample is NVDA-only and was last reviewed on 25 July 2026;
- no live database function currently references these tables to automate collection or consensus generation;
- all four tables have RLS enabled and currently expose no RLS policies, so normal client reads/writes are not an operational interface;
- the existing data is therefore a scaffold/test baseline, not evidence that RES-002 is operational.

The live sample also demonstrates the duplication risk RES-001 must resolve: the StockAnalysis NVDA forecast URL exists in `instrument_opinions` and is also persisted as a later `gpt_market_evidence` row. That is valid provenance only if the underlying source is counted once in the Market Assessment's evidence weighting.

## Relationship to the independent AI Market Assessment

The canonical Market Assessment may use current external opinion/consensus data as a permitted input, subject to this specification.

External opinion may help the AI understand:

- analyst ratings or target-price context;
- sourced market commentary;
- reported sentiment;
- specialist research views;
- how external expectations have changed.

It must not:

- automatically set `gpt_market_assessments.rating`;
- automatically map `instrument_opinion_consensus.consensus_score` into the AI Market score;
- be treated as independent confirmation merely because both an atomic opinion and its derived consensus are present;
- be counted again when the same underlying URL/reference was independently found through web research;
- be used to alter `technical_indicators` or `market_scores`;
- be used to form long-term Opportunity Assessment outputs;
- bypass the independent AI -> Technical -> Market Convergence architecture.

The Market Assessment should distinguish:

1. **fact** — e.g. an official filing, reported result or verifiable event;
2. **external opinion** — e.g. an analyst rating, target, sentiment or commentary;
3. **AI judgement** — the Market Assessment's own conclusion from permitted evidence.

## Atomic observations versus derived consensus

### `instrument_opinions`

`instrument_opinions` is the atomic normalized evidence layer. Each row should represent one identifiable external observation and retain, where available:

- `source_id`;
- `source_url`;
- `external_reference`;
- `content_hash`;
- `source_published_at`;
- `observed_at`;
- `opinion_type`;
- `stance`;
- rating/target fields where the source actually supplies them;
- headline/summary/rationale;
- materiality.

The current uniqueness constraints on `(instrument_id, content_hash)` and `(instrument_id, source_id, external_reference)` are useful ingestion-level safeguards and should be retained or strengthened by RES-002.

### `instrument_opinion_consensus`

`instrument_opinion_consensus` is a derived convenience layer over normalized opinion observations. It may summarize stance/counts/change, but it must not be treated as a new external source in addition to the observations from which it was derived.

If a Market Assessment uses a consensus summary, the constituent opinion rows represented by that summary must not separately increase evidence breadth or confidence for the same claim set.

Conversely, if the Market Assessment evaluates the constituent opinion rows individually, the derived consensus may be used as a display/summary aid but not as an additional independent evidentiary vote.

`analyst_count` in this internal consensus table must describe the observations represented by the internal model. It must not be assumed to equal an upstream provider's claimed analyst universe unless that upstream count is separately captured with explicit provenance.

## Canonical source identity and deduplication

RES-001 defines the following logical identity order for deciding whether two records represent the same underlying source observation.

Use the strongest available identity, in this order:

1. normalized canonical `source_url`;
2. `(source_id, external_reference)`;
3. `content_hash`;
4. when none of the above exists, a deterministic fallback based on source identity + source publication time/date + normalized headline/claim text.

Normalization should remove purely transport/tracking differences without merging genuinely different source documents. RES-002 should implement one canonical normalization routine rather than allowing each collector to invent its own rules.

### Same source in opinion store and direct web research

When a Market Assessment finds a web source that is already represented in `instrument_opinions`:

- treat both representations as one underlying evidence item;
- prefer the representation with clearer provenance/freshness/text for reasoning;
- persist at most one logical evidence contribution for breadth/confidence;
- do not describe the duplicate representations as independent corroboration.

A `gpt_market_evidence` row may still be written so the assessment has its own evidence ledger, but it must preserve the canonical source URL/reference and must not be accompanied by another assessment-evidence row for the same source/claim merely because the source was reached by a second path.

### Syndication and repeated reporting

Multiple URLs do not automatically mean multiple independent facts.

Where several outlets reproduce the same wire story, press release or analyst note, the Market Assessment should group the repeated claim and avoid confidence inflation. A genuinely independent primary source and independent secondary analysis may both be retained when they add distinct evidence, but the reasoning must not count duplicated reporting as multiple confirmations.

## Market Assessment evidence persistence

When external opinion is material to a Market Assessment:

- use `gpt_market_evidence.evidence_type = 'external_opinion'` for analyst/consensus/commentary evidence;
- preserve the actual canonical `source_url` where available;
- identify the source truthfully in `source_name`;
- include the source/as-of date in the evidence text when recency matters;
- make clear that the item is sourced opinion rather than fact;
- do not create a second evidence row for the same canonical source/claim within the same assessment;
- on retry/resume, reuse/replace/deduplicate rather than append duplicates.

The current `gpt_market_evidence` schema has no foreign key back to `instrument_opinions`. RES-002 should evaluate adding explicit lineage (for example, `instrument_opinion_id` or an equivalent canonical source key) so this boundary becomes machine-verifiable rather than relying only on source URL/text matching.

## Freshness and historical context

Opinion evidence must retain its actual publication/observation date.

A dated opinion snapshot may be useful historical context, but it must not be presented as **current consensus** merely because it is the newest row available in Supabase. The Market Assessment should assess whether an opinion remains sufficiently current and material for the assessment date and reduce weight/confidence when it is stale or superseded.

The current live opinion scaffold was last reviewed on 25 July 2026, so it must not be interpreted as proof that external-opinion coverage is currently fresh on 24 August 2026.

## Evidence weighting rules

For Market Assessment reasoning:

- evidence breadth means distinct underlying sources/claims, not row count;
- a derived consensus plus its constituent rows count as one evidence family, not multiple independent confirmations;
- repeated copies of the same source count once;
- a strong external consensus does not override weak/stale market/company evidence automatically;
- disagreement between credible external sources should reduce certainty or be explained, not averaged away blindly;
- absence of external opinion should not prevent a Market Assessment when other permitted evidence is sufficient.

## Boundary with other assessment systems

### Technical Engine

External opinion is not a Technical Engine input. `technical_indicators` and `market_scores` remain market/indicator-derived only.

### Market Convergence

Market Convergence combines the already-independent Technical result with the already-independent AI Market Assessment. It must not ingest external opinion again as a third branch because that would reintroduce the same evidence after it has already been considered by the AI branch.

### Opportunity Assessment

The external-opinion subsystem defined here is short-term Market research support. Long-term Opportunity Assessment continues to use its own independent structural/technology evidence contract and must not import short-term analyst ratings, target prices or Market Assessment conclusions as Opportunity inputs.

## RES-002 implementation contract

RES-002 may operationalise approved opinion sources only after preserving this boundary. At minimum it should provide:

1. explicit approved source registry and source-specific collection rules;
2. deterministic canonical source identity/URL normalization;
3. idempotent insertion using external reference/content hash/source identity;
4. preserved publication/observation timestamps and source URLs;
5. explicit review-run lifecycle, terminal status and errors;
6. consensus generated only from deduplicated eligible atomic observations;
7. machine-verifiable lineage between derived consensus and/or Market evidence and the atomic source observations where practical;
8. no client-write exposure without deliberate RLS/grant design;
9. tests proving retries do not duplicate opinions or consensus;
10. tests proving the same underlying source cannot increase Market Assessment evidence breadth twice;
11. monitoring of coverage/freshness so absence of current opinion data is distinguishable from neutral consensus;
12. no direct writes into Technical Engine, Market Convergence or Opportunity Assessment outputs.

RES-002 should not treat the existing one-review/two-opinion sample as production coverage.

## Definition of Done mapping for RES-001

Project-plan requirement: **Its role relative to Market Assessment is explicit and evidence is not double-counted.**

This specification makes the role explicit: external opinion is a normalized evidence layer for the independent AI Market Assessment, with atomic observations separated from derived consensus. It establishes a canonical source identity hierarchy and requires the same underlying source/claim to contribute at most once to Market Assessment evidence breadth/confidence, including when the source appears both in Supabase and direct web research.
