# Opportunity Exposure History Cleanup

**Specification version:** 1.0  
**Last updated:** 01 September 2026  
**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

This document is the canonical procedure for the **post-assessment Opportunity / Exposure historical-data cleanup** used by the Daily Trading Controller.

The cleanup answers one operational question:

> **Do the current active Opportunity exposures have the approved historical Tiingo coverage needed for long-term trend research?**

It is a coverage-maintenance workflow, not another analytical signal and not a short-term Trading-universe expansion mechanism.

At the beginning of every cleanup retrieve this file fresh from GitHub and also retrieve:

- `documentation/pipelines/historical-market-data-backfill.md`
- `automation/daily-opportunity-assessment.md`

Treat the historical backfill document as authoritative for Tiingo provenance, `market_observations`, idempotency, validation and provider identity. This document adds the Opportunity-exposure scope and safety boundary.

## 1. Owner-approved boundary

On 01 September 2026 the Owner approved the Daily Trading Controller architecture in which the first three analytical workflows run and the historical cleanup follows.

That approval includes a narrow standing permission for the cleanup to create an **inactive historical-only `public.instruments` row** and an active Tiingo provider mapping when all of the following are true:

1. the symbol is a current active external Opportunity exposure;
2. the listed security identity is unambiguous;
3. the exchange and symbol can be verified without guessing;
4. the row is required only because `market_observations.instrument_id` references `public.instruments`;
5. the row is created with `is_active = false` and remains inactive outside the bounded historical provider call;
6. no Twelve Data mapping is created by this workflow;
7. the Tiingo mapping metadata records `purpose = 'opportunity_exposure_history'`.

This standing permission **does not promote the security into the active Trading universe**. Only `public.instruments.is_active = true` represents a tracked short-term Trading instrument for controller purposes.

An inactive historical-only instrument must continue to be treated as an **external Opportunity exposure**. The cleanup must not move its Opportunity mapping from `opportunity_theme_external_instruments` into `opportunity_theme_instruments` merely because an inactive supporting instrument row exists.

Any future promotion to `is_active = true`, Twelve Data live loading, Market Assessment scope or tracked-instrument status requires a separate explicit Owner decision.

## 2. Scope

Read the current active unified exposure set from:

`public.opportunity_theme_all_exposures`

using `is_active = true`.

Deduplicate by stable listed-security identity, normally symbol plus exchange where needed.

For each current exposure classify it as one of:

- `tracked` — an active `public.instruments` row exists;
- `history_only` — an inactive supporting instrument row exists and the symbol remains an active external Opportunity exposure;
- `not_seeded` — no supporting instrument row exists;
- `mapping_required` — the security or Tiingo provider identity cannot be resolved safely;
- `complete` — acceptable five-year-or-available-since-listing Tiingo seed already exists;
- `pending_seed` — identity is valid but historical seed is absent/incomplete;
- `validation_required` — history exists but cannot be accepted safely.

Do not infer that an external exposure should become tracked because historical data has been loaded for it.

## 3. Existing-history preflight

Before consuming a Tiingo request, inspect the Tiingo provider and `interval_code = '1day'` history for the supporting instrument.

A symbol is normally `complete` for this cleanup when durable evidence shows that a five-year backfill has already succeeded and the stored coverage is reasonable for the security's listing history.

Accept shorter coverage for a security that listed less than five years ago. Never fabricate pre-listing history.

Do not repeatedly download a full five-year history merely to advance the most recent daily bar. This cleanup is primarily a **missing/new exposure coverage seed**.

If a symbol already has a valid five-year seed, skip the provider pull and preserve the existing observations.

Daily/regular tail maintenance of already-seeded histories must use a future bounded incremental design rather than repeatedly downloading five years. Until such a tail-refresh procedure is separately approved, this cleanup must not convert the five-year seeder into a daily full-history downloader.

## 4. Identity and mapping rules

For a tracked instrument, use its existing verified Tiingo mapping.

For a current external Opportunity exposure that has no supporting instrument row:

1. use the stored symbol, instrument name, exchange and source URLs as the starting identity;
2. verify the listed security and exchange from reputable current evidence when needed;
3. resolve the Tiingo provider symbol only when unambiguous;
4. stop at `mapping_required` rather than guess.

Plain US-listed symbols on clearly identified US exchanges may normally use the verified listed ticker as the Tiingo EOD symbol when identity is unambiguous.

International exchange suffixes, changed listings, delisted ADRs, share classes and other non-trivial identities require explicit provider-symbol verification. Do not mechanically strip or transform suffixes.

Known examples of symbols that require care include historical ADR/listing changes such as ABB and non-US forms such as `.HK`, `.SZ`, `.DE` and `.PA`.

## 5. Historical-only instrument onboarding

When the standing Owner-approved conditions are met, create the supporting instrument conservatively:

- preserve the exposure's canonical symbol;
- preserve the verified listed company/fund name;
- preserve the verified exchange code;
- use the verified asset type;
- use the verified trading currency;
- set `is_active = false`;
- do not create a Twelve Data provider mapping.

Create or update the Tiingo `provider_instruments` row only when the Tiingo identity is unambiguous.

Merge useful non-secret metadata including:

```json
{
  "purpose": "opportunity_exposure_history",
  "controller": "daily-trading-controller",
  "tracking_scope": "external_opportunity_history_only"
}
```

Never store provider credentials or tokens in metadata.

Historical-only rows must be returned to `is_active = false` after every bounded provider call, including failures.

## 6. Seed batch construction

Only symbols classified `pending_seed` belong in a new provider batch.

Reuse:

- `public.historical_backfill_batches`
- `public.historical_backfill_queue`
- Edge Function `opportunity-exposure-historical-backfill-worker`
- Edge Function `backfill-market-history`

Create one batch for the controller cleanup with:

- `years = 5`;
- `status = 'running'`;
- `requested_count = <actual queued symbols>`;
- `skipped_count = <already complete symbols>`;
- metadata including:
  - `scope = 'opportunity_exposure'`;
  - `mode = 'coverage_seed'`;
  - `source = 'daily-trading-controller'`;
  - controller Perth date;
  - applicable New York market date when relevant;
  - GitHub source identities;
  - unresolved `mapping_required` symbols, if any.

Insert exactly one queue row per supporting instrument needing a provider pull.

Use `years = 5` and the existing worker's retry/idempotency rules.

If there are zero pending provider pulls, do not create a pointless running batch and do not create a Tiingo worker cron.

## 7. Provider pacing and temporary worker

Use the established conservative pacing:

- one actual Tiingo history request every 2 minutes;
- maximum 30 history requests per rolling hour for this workflow.

When a batch has pending queue rows, create or reuse a temporary pg_cron job named:

`trading-opportunity-exposure-backfill-every-2-minutes`

The cron must invoke `opportunity-exposure-historical-backfill-worker` at two-minute cadence.

The cron command must first inspect whether an `opportunity_exposure` historical batch is still `running`:

- if yes, invoke the worker exactly once;
- if no, unschedule `trading-opportunity-exposure-backfill-every-2-minutes` so the poller does not remain active after completion.

Never leave an idle two-minute poller running indefinitely.

Do not create more than one active Opportunity exposure seed batch at a time. If one already exists, resume/inspect it rather than creating another.

## 8. Worker safety boundary

`opportunity-exposure-historical-backfill-worker` may temporarily set an inactive supporting instrument to `is_active = true` only for the bounded call to `backfill-market-history`, because the canonical backfill function requires an active instrument.

The worker must restore the original inactive state in all success/failure paths.

A historical-only instrument must have no Twelve Data mapping, so this temporary activation must not subscribe it to the normal live quote loader.

If that condition is not true, stop and investigate before running the item.

## 9. Validation

For every completed seed verify:

1. latest relevant `sync_runs.status = 'succeeded'`;
2. provider attribution is Tiingo;
3. `interval_code = '1day'`;
4. first/last coverage dates are plausible;
5. row count is plausible for the listing history;
6. duplicate `(instrument_id, provider_id, interval_code, observed_at)` dates = 0;
7. sample OHLC is sensible and provenance identifies Tiingo;
8. `high >= low` constraints remain valid;
9. the supporting external-history instrument is inactive after the call;
10. no Twelve Data mapping was created by this workflow;
11. live `latest_market_observations` remains quote-only;
12. the Opportunity exposure remains external unless separately approved as a tracked instrument.

Use `validation_required` when history exists but these checks cannot be satisfied.

## 10. Mapping-required and unsupported symbols

Do not block safe symbols merely because another exposure cannot be mapped.

Record unresolved symbols with a concise reason, for example:

- non-US provider symbol not verified;
- ADR/listing changed;
- exchange identity ambiguous;
- Tiingo returned no usable history;
- security appears delisted or renamed.

A mapping-required item is an Owner/research follow-up, not a reason to invent data.

## 11. Completion semantics

The cleanup is clean when:

- every current active exposure with an approved/unambiguous supporting identity has a valid historical seed or is already complete;
- every unresolved external symbol is explicitly listed as `mapping_required` or `validation_required`;
- no duplicate historical observations were created;
- no exposure-only instrument was left active;
- no idle temporary cron remains.

The Daily Trading Controller may report the analytical morning pipeline as complete while separately reporting unresolved external-history mapping items. It must not describe historical exposure coverage as 100% while unresolved symbols remain.

## 12. End-of-cleanup report

Return a concise summary containing:

- active distinct Opportunity exposure symbols;
- tracked symbols;
- external symbols;
- already-complete history / skipped;
- new historical-only instruments created;
- Tiingo mappings created/verified;
- queued provider pulls;
- batch ID when one was created;
- succeeded / pending / failed / validation_required / mapping_required;
- historical rows loaded where available;
- unresolved symbols and exact reasons;
- whether the temporary two-minute cron is active or has been removed.

Do not expose API keys, service-role keys or Tiingo credentials.
