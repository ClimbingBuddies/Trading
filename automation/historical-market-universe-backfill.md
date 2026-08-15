# Historical Market Universe Backfill

**Specification version:** 1.0  
**Last updated:** 15 August 2026  
**System:** Discover Boulders Markets / Trading  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

This is the canonical execution specification for backfilling daily Tiingo history across the active Trading instrument universe.

At the beginning of every run, retrieve this file fresh from GitHub and also retrieve:

`documentation/pipelines/historical-market-data-backfill.md`

Treat the single-instrument historical backfill document as the authoritative source for provider handling, database writes, idempotency, validation and provenance. This file adds the universe-level sequencing, pacing and completion rules.

Do not rely on a remembered instrument list. Query the active Trading universe fresh from Supabase on every run.

## Current control state

As at 15 August 2026 the active universe contains 30 instruments:

- 15 equities
- 5 ETFs
- 5 forex pairs
- 5 crypto pairs

NVDA already has a proven five-year Tiingo daily backfill and idempotency test.

The universe count may change later. Always use the current active rows in `public.instruments` rather than assuming the count remains 30.

## Objective

For every active instrument, establish up to five years of canonical daily historical market data in `public.market_observations` using Tiingo and `interval_code = '1day'`.

For instruments with less than five years of available history, load all history Tiingo actually provides. Never fabricate pre-listing or unavailable history.

The existing Twelve Data live quote loader must remain unchanged.

## Recommended pacing

Use a conservative working cap of:

- **one actual Tiingo historical request every 2 minutes**
- **maximum 30 Tiingo historical requests per rolling hour for this workflow**

This intentionally leaves headroom below the Tiingo Starter account request ceiling for diagnostics, retries and other Tiingo activity.

Do not use the theoretical maximum provider rate as the working rate.

At the current 30-instrument universe, one complete first-pass run should require no more than about 30 Tiingo history requests. Instruments already proven complete may be skipped without making another Tiingo request.

Maintain at least two minutes between actual Tiingo historical API calls. Database-only validation and mapping work does not consume a Tiingo request and does not need to wait two minutes.

## Quota preflight

Before starting a universe run:

1. Verify the current Tiingo plan limits from Tiingo's official pricing/documentation rather than relying on a historical remembered quota.
2. Confirm the intended pacing remains below the current hourly and daily request ceilings.
3. Confirm `TIINGO_API_TOKEN` is available to the Supabase Edge Function runtime without exposing its value.
4. If Tiingo returns a quota/rate-limit response, stop new provider requests for the batch rather than repeatedly retrying.

## Determine the universe

Query `public.instruments` where `is_active = true`.

Capture at minimum:

- `id`
- `symbol`
- `instrument_name`
- `asset_type`
- `exchange_code`
- `currency_code`

Record the total requested instrument count and counts by asset type for the run summary.

Do not hard-code the current 30 symbols into execution logic.

## Tiingo symbology

Resolve and verify a Tiingo provider symbol for every instrument before its first backfill.

General Tiingo currency-pair convention removes the slash:

- `EUR/USD` -> `EURUSD`
- `AUD/USD` -> `AUDUSD`
- `BTC/USD` -> `BTCUSD`
- `ETH/USD` -> `ETHUSD`

For equities and ETFs, use Tiingo's documented security symbology. Do not assume that every internal symbol is always identical to the Tiingo symbol, especially for share classes or unusual instruments.

Create or update `public.provider_instruments` for the Tiingo provider only when the identity is unambiguous.

If a symbol cannot be resolved confidently, mark that instrument as requiring mapping review and continue with other unambiguous instruments. Do not guess.

## Asset-class verification gate

The NVDA equity path is production-proven.

Before bulk-processing an asset class that has not yet been production-proven, perform one controlled representative test from that class and verify the result using the single-instrument runbook.

Recommended first controls:

- ETF: `QQQ`
- Forex: `EUR/USD`
- Crypto: `BTC/USD`

For each control test verify:

- provider attribution = Tiingo
- `interval_code = '1day'`
- sensible first/last coverage dates
- plausible row count
- sensible OHLC values
- no duplicate dates
- source/provenance metadata
- successful `sync_runs` record

If the representative control fails because the endpoint, symbology or response structure is wrong, stop that asset class, fix and re-test it before bulk-processing the rest of that class. Other already-proven asset classes may continue.

## Determine whether an instrument needs a pull

Before consuming Tiingo quota for an instrument, inspect existing Tiingo `1day` observations.

If the instrument already has a recent successful five-year backfill with reasonable coverage through the latest expected market date, do not automatically download the full five years again during a universe-seeding run.

Classify each instrument as one of:

- `complete` — sufficient existing Tiingo history; no pull needed
- `pending` — mapping valid and history missing/incomplete
- `mapping_required` — Tiingo symbol not yet resolved
- `validation_required` — returned history exists but cannot yet be accepted
- `failed` — provider or ingestion failure after permitted attempts

NVDA should normally classify as `complete` unless a fresh rebuild has explicitly been requested.

## Execution order

Process the universe in this order unless there is an operational reason to change it:

1. already-proven equities
2. ETF control, then remaining ETFs
3. forex control, then remaining forex pairs
4. crypto control, then remaining crypto pairs

Within an asset class, alphabetical symbol order is acceptable.

This order makes failures easier to isolate and prevents an unverified endpoint family from consuming a large number of requests.

## Scheduler / queue behaviour

For unattended execution, use a temporary Supabase-controlled queue/worker rather than holding one chat session open for an hour.

The runner should:

1. contain one queue item per active instrument needing a Tiingo pull;
2. process **exactly one** pending instrument per tick;
3. invoke `backfill-market-history` with `years = 5`;
4. persist the result/status for that queue item;
5. wait until the next scheduled tick before making another Tiingo request;
6. use a two-minute cadence;
7. stop or disable the temporary scheduler after there are no pending/retryable queue items.

Do not create a permanent recurring historical backfill that keeps downloading full five-year histories after the initial seed is complete.

Historical refresh after initial seeding should be incremental and designed separately if required.

## Retry rules

A normal provider or network failure may be retried a maximum of **two times** for the same instrument during a universe run.

Retry rules:

- never retry immediately;
- place the failed item behind other pending work;
- maintain the same two-minute minimum spacing between actual Tiingo requests;
- preserve every failed attempt in `sync_runs`;
- if Tiingo reports invalid credentials, stop the entire universe run;
- if Tiingo reports a rate-limit/quota condition, stop new provider calls and report it;
- if three instruments fail consecutively with the same unexplained provider error, pause the universe run and investigate rather than continuing to hammer the provider.

Mapping ambiguity is not a retryable provider failure. It requires mapping review.

## Per-instrument execution

For each pending instrument follow `documentation/pipelines/historical-market-data-backfill.md`.

The standard invocation is:

```json
{
  "symbol": "<INTERNAL_SYMBOL>",
  "years": 5
}
```

The function must remain idempotent and use Tiingo as the provider for historical observations.

## Per-instrument validation

After each backfill, verify before marking the queue item complete:

1. latest Tiingo `sync_runs` record succeeded;
2. historical provider is Tiingo;
3. interval is `1day`;
4. first and last observation dates are plausible;
5. row count is plausible;
6. duplicate date groups = 0;
7. OHLC constraints are valid;
8. sample `raw_payload._backfill.source` identifies Tiingo;
9. the live quote view remains isolated from the historical interval.

A newly listed instrument may legitimately have substantially fewer rows than older securities.

Crypto and forex calendar density differs from exchange-traded equities. Do not compare their row counts directly with the expected US-equity trading-day count.

## Completion criteria

The universe run is complete only when every active instrument is in one of these terminal states:

- `complete`
- `mapping_required`
- `validation_required`
- `failed`

A clean successful universe run has every active instrument in `complete`.

At completion produce a summary with:

- active instruments requested
- already complete / skipped
- Tiingo requests made
- succeeded
- failed
- mapping required
- validation required
- rows inserted by instrument
- first/last coverage by instrument
- total Tiingo historical rows now stored
- duplicate checks
- quota/rate-limit warnings
- elapsed run period if known

Do not describe the universe as fully backfilled while unresolved instruments remain.

## Data retention

Historical observations must remain in the database when an instrument is later removed from the active universe.

Deactivate the instrument or provider mapping instead of deleting historical observations so research and backtests remain reproducible.

## Future daily/incremental history

This procedure is for initial or corrective five-year seeding.

Do not repeatedly download five years every day.

After the universe is seeded, any regular historical maintenance should request only missing/new daily observations or otherwise use an incremental design. That should be documented as a separate workflow before enabling it.

## Preferred short prompt

Use:

> Run the Trading universe historical backfill.

The execution agent must then retrieve this file and `documentation/pipelines/historical-market-data-backfill.md` fresh, use the current active Supabase universe, apply the quota/pacing rules above, and report the completion state.

For the current initial seeding pass, a more explicit prompt is:

> Backfill five years of Tiingo daily history for the active Trading universe using the GitHub universe backfill procedure. Process one Tiingo pull every 2 minutes until the queue is complete, verify every instrument, and report unresolved items rather than guessing.
