# Opportunity Exposure History Cleanup

**Specification version:** 1.1  
**Last updated:** 02 September 2026  
**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

This is the canonical post-assessment Opportunity / Exposure historical-data cleanup used by the Daily Trading Controller.

It answers:

> Do the current active Opportunity exposures have approved historical coverage needed for long-term trend research?

It is a coverage-maintenance workflow, not another analytical signal and not a short-term Trading-universe expansion mechanism.

At the beginning of every cleanup retrieve fresh:

- this file;
- `documentation/pipelines/opportunity-exposure-history-mapping-registry.md`;
- `documentation/pipelines/historical-market-data-backfill.md` when a provider pull is considered;
- `automation/daily-opportunity-assessment.md`.

GitHub is authoritative for workflow and identity decisions. Supabase is authoritative for persisted state.

## 1. Active-universe boundary

`public.instruments.is_active = true` alone defines the tracked short-term Trading universe.

The Owner has approved a narrow history-support boundary in which the cleanup may create inactive supporting `public.instruments` rows and Tiingo mappings when identity is unambiguous. Such rows:

- remain `is_active = false` outside a bounded provider call;
- are not promoted into Market Assessment or External Opinion scope;
- receive no Twelve Data mapping from this workflow;
- remain external Opportunity exposures unless separately approved for tracking.

The historical worker may temporarily activate a supporting row only because the canonical backfill function requires an active instrument, and must restore the original state on every success/failure path.

## 2. Current Tiingo licensing gate — mandatory

Before any new Tiingo data is persisted, verify the current Tiingo plan and current Tiingo Terms of Use.

As of 02 September 2026, Tiingo's current Terms state that Starter and trial plans may process Tiingo Data only transiently and may not persist it in durable storage. Eligible paid plans may persist data subject to their terms.

Therefore:

- provider identity/mapping work may proceed without a data pull;
- if the account is confirmed Starter/trial, **do not persist new Tiingo raw OHLC/history**;
- if the account plan is unverified, treat new persistent Tiingo ingestion as `BLOCKED_LICENSE_VERIFICATION` rather than assuming permission;
- only begin/resume persistent Tiingo pulls after an eligible paid-plan persistence right is verified;
- do not delete existing stored Tiingo data automatically. Any retention/remediation decision is a separate Owner action after plan/terms review.

This gate overrides older documentation that assumed the Starter plan could be used for persistent historical storage.

## 3. Scope and classification

Read `public.opportunity_theme_all_exposures` where `is_active = true`, deduplicated by stable listed-security identity.

Classify each exposure as applicable:

- `tracked` — active Trading instrument;
- `history_only` — inactive same-security support row;
- `history_proxy` — approved inactive proxy support row from the mapping registry;
- `not_seeded`;
- `mapping_required`;
- `complete`;
- `pending_seed`;
- `validation_required`;
- `blocked_license_verification`.

An inactive support/proxy row does not make the canonical exposure tracked.

## 4. Existing-history preflight

Before consuming a provider request, inspect Tiingo `interval_code = '1day'` coverage for the applicable support instrument.

Normally accept as complete:

- a proven five-year seed with reasonable coverage; or
- all available data since listing for a security listed less than five years ago.

Never fabricate pre-listing history.

Do not repeatedly download five years merely to advance a recent daily bar. Already-seeded histories are skipped by this cleanup. Tail maintenance must use a separately approved incremental design.

## 5. Direct identity rules

For tracked instruments use the existing verified Tiingo mapping.

For external exposures, use stored symbol/name/exchange/source evidence plus the fresh mapping registry. Resolve provider identity only when unambiguous.

Plain US-listed/OTC symbols and mainland-China A-shares may be mapped only when Tiingo's current documented coverage and the exact listed ticker support the decision.

International suffixes, changed listings, delisted ADRs, share classes and other non-trivial cases must not be mechanically stripped/transformed. Use `mapping_required` unless the mapping registry explicitly resolves them.

## 6. Historical proxy boundary

A historical proxy is allowed only when the mapping registry explicitly records it as `RESOLVED_PROXY`.

A proxy must:

- have its own inactive `public.instruments` row;
- preserve its own exchange and trading currency;
- have its own Tiingo mapping;
- record `mapping_kind = 'historical_proxy_adr'` and `proxy_for_external_symbol` in `provider_instruments.metadata`;
- never cause proxy prices to be stored under the canonical local security's currency or identity;
- be used for percentage trend/research context, clearly labelled as a proxy.

The cleanup must find an approved proxy via `provider_instruments.metadata ->> 'proxy_for_external_symbol'` before concluding that the canonical external exposure is unresolved.

Do not silently replace a canonical exposure symbol with its proxy, except where the mapping registry explicitly records a corrected current security identity (for example stale ABB/NYSE corrected to current ABBNY/OTC).

## 7. Supporting-instrument metadata

Direct history-only mappings should include non-secret metadata such as:

```json
{
  "purpose": "opportunity_exposure_history",
  "controller": "daily-trading-controller",
  "tracking_scope": "external_opportunity_history_only",
  "mapping_kind": "direct"
}
```

Proxy mappings use `tracking_scope = 'external_opportunity_history_proxy'` and record the canonical external symbol.

Never store credentials/tokens in metadata.

## 8. Seed batch construction

Only `pending_seed` items that also pass the licensing gate belong in a provider batch.

Reuse:

- `public.historical_backfill_batches`;
- `public.historical_backfill_queue`;
- `opportunity-exposure-historical-backfill-worker`;
- `backfill-market-history`.

Use `years = 5`, one queue row per supporting instrument, and batch metadata containing scope, controller date, source identities, direct/proxy classification and unresolved symbols.

If zero provider pulls are permitted/needed, do not create a pointless running batch or temporary cron.

## 9. Pacing and retry

When licensed persistent ingestion is permitted, retain the conservative operational cap:

- one actual Tiingo historical request every 2 minutes;
- maximum 30 historical requests per rolling hour for this workflow.

Use temporary cron `trading-opportunity-exposure-backfill-every-2-minutes` only while an Opportunity exposure batch is running. It must unschedule itself after no running batch remains.

Never run two Opportunity exposure seed batches concurrently.

Preserve existing worker retry/idempotency rules. Mapping ambiguity is not a retryable provider failure.

## 10. Validation

For every completed seed verify:

1. relevant `sync_runs.status = 'succeeded'`;
2. provider attribution = Tiingo;
3. interval = `1day`;
4. coverage dates/row count are plausible;
5. duplicate provider/date groups = 0;
6. sample OHLC and provenance are sensible;
7. `high >= low` constraints remain valid;
8. support/proxy instrument is inactive after the call;
9. no Twelve Data mapping was created;
10. live current-quote view remains quote-only;
11. canonical Opportunity exposure remains external unless separately approved;
12. proxy results are explicitly labelled as proxy history.

Use `validation_required` when any acceptance condition cannot be met.

## 11. Mapping-required handling

Do not block safe symbols merely because another exposure cannot be mapped.

Record unresolved symbols and exact reasons such as unsupported primary exchange, no approved long-history proxy, ADR/listing transition requiring continuity validation, or provider identity ambiguity.

Consult the mapping registry before reporting a symbol unresolved.

## 12. Completion semantics

The cleanup is operationally clean when:

- all high-confidence direct/proxy identities are persisted as mappings;
- all permitted seeds are complete or truthfully queued;
- unresolved identities are explicit;
- licence-blocked pulls are explicit;
- no exposure-only support row is left active;
- no idle two-minute cron remains.

The controller may report the analytical morning pipeline complete while separately reporting unresolved or licence-blocked historical coverage. It must not claim 100% history coverage when any remain.

## 13. End-of-cleanup report

Report concisely:

- active distinct Opportunity exposures;
- tracked/external counts;
- direct-history and proxy-history mappings;
- already complete/skipped;
- mappings resolved this run;
- provider pulls queued/succeeded/pending/failed;
- `mapping_required`, `validation_required` and `blocked_license_verification` symbols;
- rows loaded only when a licensed provider pull actually occurred;
- temporary cron state.

Do not expose credentials or privileged keys.
