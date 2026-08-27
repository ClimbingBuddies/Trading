# Daily External Opinion Review

**Specification version:** 1.0  
**Last updated:** 27 August 2026  
**System:** Discover Boulders Markets / Trading  
**Repository:** `ClimbingBuddies/Trading`  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Model contract:** `documentation/specifications/external-opinion-model.md` (`external-opinion-v1`)

## Purpose

This is the canonical execution specification for the scheduled external-opinion research workflow.

At the beginning of every run, retrieve this file and `documentation/specifications/external-opinion-model.md` fresh from GitHub. Do not rely on a remembered or cached copy. If either file cannot be retrieved, stop without writing opinion data.

The workflow collects current, attributable external opinion and material research for the active Trading universe, normalises it into `public.instrument_opinions`, builds a deduplicated derived consensus, and persists review/coverage telemetry. It is an evidence pipeline for the independent AI Market Assessment. It is not a Trading rating engine, Technical Engine input, Market Convergence branch or Opportunity Assessment input.

## 1. Run identity and idempotency

Use the current `America/New_York` date as `review_date`.

Call the service-only helper:

```sql
select *
from external_opinion.prepare_review_v1(
  <review_date>,
  'scheduled-external-opinion-review'
);
```

Use the returned `review_id` for the whole run.

If `already_complete = true`, do not repeat research or insert rows. Report the persisted completed review and stop.

A failed/partial same-date retry must reuse the same review row and increment its attempt count. Do not create a second scheduled review for the same date.

## 2. Scope

Read `public.instruments` and process only rows where `is_active = true`.

Read active `public.opinion_sources` and obey each row's:

- `source_key`;
- `source_type`;
- `collection_method`;
- `approved_domains`;
- `lookback_hours`;
- `max_items_per_instrument`;
- `trust_tier`;
- `collection_notes`.

Do not hard-code a source as approved when the live registry says otherwise.

## 3. Research rules

Use current public web research. Prefer primary and authoritative sources. Do not fabricate a source, URL, publication date, analyst view, target, filing, quotation or material event.

Do not bypass paywalls or authentication. If a source cannot be verified sufficiently, omit it or record the source family as failed/skipped with a truthful reason.

Only persist material evidence that can reasonably affect current short-term market research. Absence of a material item is not negative evidence and must not be converted to a neutral opinion row.

### `analyst_consensus`

Use only domains currently approved in `opinion_sources`. Capture visible analyst consensus/rating/target context with an explicit source/as-of date. Use `opinion_type = 'analyst_rating'` or `analyst_target` as appropriate.

An upstream consensus is sourced opinion. It must never be copied mechanically into the Trading Market Assessment rating or score.

### `financial_news`

Use current material reporting from approved domains. Store the original article URL and publication timestamp/date. Classify `stance` only as the source-level effect/context being captured; do not convert straight factual reporting into unsupported sentiment.

Use `opinion_type = 'news_sentiment'`, `market_commentary` or another allowed type only when the stored interpretation is supported by the source.

### `official_company`

Use only the issuer/fund sponsor's official site, investor-relations site or official press-release/event page. The source registry deliberately allows dynamic issuer domains, so verify official provenance before ingestion.

Use `company_update` for attributable issuer developments. Company statements are primary-source claims/facts, not analyst consensus.

### `regulatory`

Use only approved official regulatory/exchange domains. Preserve filing/announcement identifiers and dates where available. Use `regulatory_update` and avoid assigning bullish/bearish stance when the filing itself does not justify that interpretation.

### `research`

Use approved authoritative specialist/macro sources only when materially relevant to a tracked instrument. Preserve the research publication date and scope. Do not stretch general research into an instrument-specific conclusion without a defensible connection.

## 4. Atomic ingestion and canonical identity

For each accepted observation call:

```sql
select *
from external_opinion.ingest_opinion_v1(
  <review_id>,
  <instrument_symbol>,
  <source_key>,
  <opinion_type>,
  <stance>,
  <headline>,
  <summary>,
  <source_url>,
  <source_published_at>,
  <external_reference>,
  <rating>,
  <target_price>,
  <target_currency>,
  <time_horizon>,
  <rationale>,
  <confidence>,
  <is_material>
);
```

The helper is the canonical persistence path. It validates active instruments/sources and approved static domains, creates the canonical source/claim identity and deduplicates the observation. The live model enforces one canonical observation for an instrument, canonical source, opinion type and publication timestamp; undated observations also use the external reference. Dated snapshots from a dynamic page remain distinct when their publication dates differ.

Do not insert directly into `instrument_opinions` from the scheduled workflow.

Treat `inserted = false` as an idempotent duplicate, not an error. Historical duplicates are retained for audit with `deduplication_status = 'superseded'` and excluded from consensus. A controlled service-only repair uses `external_opinion.resolve_duplicate_v1(...)`; do not delete or rewrite the original evidence.

## 5. Non-double-counting rule

Apply `external-opinion-v1` throughout the research process:

- one underlying source/claim contributes once;
- a derived consensus is not another independent source;
- a rewritten summary of the same dated filing is still the same observation and must not create a second evidence family;

- the same source discovered from Supabase and direct web research is one logical evidence item;
- syndicated/reposted versions of one wire story, press release or analyst note do not become independent confirmations;
- preserve canonical provenance so the later Market Assessment can enforce the same rule.

Do not write to `gpt_market_evidence` in this workflow. The independent Market Assessment owns its own evidence ledger and may link to an `instrument_opinion_id` when it uses opinion evidence.

## 6. Per-source telemetry

Every active source family must reach a terminal source result, even when no material item is found.

After researching a source family call:

```sql
select external_opinion.record_source_result_v1(
  <review_id>,
  <source_key>,
  <'succeeded' | 'failed' | 'skipped'>,
  <items_seen>,
  <opinions_inserted>,
  <duplicates_skipped>,
  <error_message_or_null>,
  <truthful_metadata_json>
);
```

Use:

- `succeeded` when the source family was researched successfully, including a valid zero-material-item result;
- `skipped` only when the source family is deliberately not applicable for the run and the reason is recorded;
- `failed` when research could not be completed reliably.

Do not leave a source result `pending` merely because it produced no opinion.

## 7. Finalisation, consensus and monitoring

Always finalise a started review, including partial/failure cases:

```sql
select *
from external_opinion.finalize_review_v1(
  <review_id>,
  <actual_active_instruments_checked>,
  <overall_error_or_null>
);
```

Finalisation rebuilds `instrument_opinion_consensus` only from eligible deduplicated atomic observations, persists `opinion_consensus_members` lineage, calculates current/stale/none coverage, and moves the review to a terminal status.

After finalisation inspect:

- `opinion_reviews` for status, counts and errors;
- `opinion_source_review_results` for per-source outcomes;
- `external_opinion_coverage_v1` for `current`, `stale` and `none` coverage;
- current consensus rows and member lineage for instruments where evidence exists.

`none` means no opinion coverage. It is not neutral consensus.

## 8. Failure handling

If GitHub specifications cannot be read fresh, stop without writes.

If Supabase is unavailable or service-only helpers cannot be called, do not fabricate a review or counts.

If individual source families fail, continue safe independent source families, record exact per-source failure and finalise the review as partial when appropriate.

If a source item is uncertain, stale beyond its configured lookback, unsupported, or outside an approved static domain, do not force it into the database.

## 9. System boundaries

This workflow must not write to or use external opinion to calculate:

- `technical_indicators`;
- `market_scores`;
- `market_convergence_assessments`;
- Structural Opportunity Signal;
- Technology Inflection Signal;
- Opportunity Assessment / Opportunity Convergence.

It may write only the external-opinion model/control tables through the approved trusted helpers.

## 10. End-of-run report

Report concisely:

- New York review date;
- `review_id` and attempt count;
- final persisted status;
- active instruments checked;
- source families checked/failed;
- opinions seen/inserted/duplicates skipped;
- consensus rows;
- current/stale/none coverage;
- material changes;
- source families skipped/failed and why;
- whether this was a fresh run, resumed retry or already complete.

Do not expose credentials or privileged keys.