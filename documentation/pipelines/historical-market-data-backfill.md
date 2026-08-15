# Historical Market Data Backfill

## Purpose

This document is the authoritative execution procedure for on-demand historical market-data backfills in the Trading platform.

Use it whenever an active instrument needs historical daily data, including when a new ticker is added to the Trading universe.

Supabase project: `glvbqcplgjdfgjyknzsa`

Primary historical provider: **Tiingo**

Edge Function: `backfill-market-history`

Default history: **5 years**

Historical interval: `1day`

The existing Twelve Data quote loader remains the live/current market-data pipeline and must not be replaced or disrupted by this process.

## Simple future instruction

A normal ChatGPT request can be as short as:

> Backfill NVDA 5 years using the Trading historical backfill procedure.

For a newly added ticker:

> Add MSFT to the Trading universe and backfill 5 years using the Trading historical backfill procedure.

For a complete active-universe seed, use the canonical universe execution specification:

`automation/historical-market-universe-backfill.md`

A universe request can be as short as:

> Run the Trading universe historical backfill.

The assistant must retrieve the applicable GitHub document fresh and treat it as the authoritative procedure for the run.

## Architecture

```text
Instrument
   |
   +-- Twelve Data mapping -> live/current quote loader -> interval_code = quote
   |
   +-- Tiingo mapping ------> on-demand history backfill -> interval_code = 1day
                                                      |
                                                      +-> market_observations
                                                      +-> sync_runs audit
```

Historical and live observations intentionally share `market_observations`, but use different providers and interval codes.

`latest_market_observations` is restricted to `interval_code = 'quote'` so historical daily rows cannot replace the current quote shown by the Markets dashboard.

## Required server-side configuration

The Edge Function expects:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TIINGO_API_TOKEN`

`TIINGO_API_TOKEN` is stored as a Supabase Edge Function secret.

Never put the Tiingo token in frontend code, GitHub, database metadata, logs or chat output.

## Provider registration

`data_providers` contains a dedicated Tiingo provider:

- `provider_code = 'tiingo'`
- `provider_name = 'Tiingo'`
- `base_url = 'https://api.tiingo.com'`
- `is_active = true`

Historical Tiingo observations must use the Tiingo `provider_id`.

Never store Tiingo, Yahoo Finance or another historical provider's data under the Twelve Data provider ID.

## Provider mappings

Each instrument being backfilled requires an active `provider_instruments` row for Tiingo.

The mapping records:

- internal `instrument_id`
- Tiingo `provider_id`
- Tiingo `provider_symbol`
- `is_active = true`
- useful non-secret metadata

For NVDA, the tested Tiingo symbol is `NVDA`.

When adding another ticker, resolve the correct Tiingo symbol rather than assuming the internal symbol is always identical.

If the mapping is ambiguous, stop rather than guess.

## Edge Function request

`backfill-market-history` accepts:

```json
{
  "symbol": "NVDA",
  "years": 5
}
```

Rules:

- `symbol` is required.
- `years` defaults to `5`.
- supported request range is currently 1 to 5 years.
- the instrument must already exist and be active in `instruments`.
- an active Tiingo provider mapping must exist.

## Retrieval

The function selects the Tiingo endpoint family from `asset_type`.

Current implementation contains handling for:

- equity / ETF -> Tiingo end-of-day history
- forex -> Tiingo FX history
- crypto -> Tiingo crypto history

The production test completed on 15 August 2026 was for a US equity using the Tiingo EOD endpoint. Other asset classes must be verified individually before being considered production-proven.

## Historical observation rules

Tiingo history is normalised into `market_observations` with:

- `provider_id` = Tiingo
- `interval_code = '1day'`
- `observed_at` = actual historical market date at UTC midnight
- `open`
- `high`
- `low`
- `close`
- `adjusted_close` where supplied
- `volume`
- instrument currency
- source/provenance metadata in `raw_payload`

`raw_payload._backfill` records information such as:

- source
- function
- provider symbol
- Tiingo endpoint family
- retrieval time
- requested start date
- requested end date

## Adjusted prices

Tiingo can provide adjusted values that differ materially from raw prices because of stock splits and other corporate actions.

Do not overwrite raw OHLC values with adjusted values.

Store raw OHLC in the normal OHLC columns and the Tiingo adjusted close in `adjusted_close` where available.

Backtesting code must deliberately choose raw versus adjusted data according to the strategy being tested.

## Idempotency

`market_observations` has a unique key on:

```text
(instrument_id, provider_id, interval_code, observed_at)
```

The historical function upserts using that key.

Re-running the same backfill must therefore update the same provider/date records rather than create duplicates.

A successful verification rerun for NVDA on 15 August 2026 returned 1,255 rows from Tiingo, inserted 0 new rows and updated the existing 1,255 rows in place. The table remained at 1,255 daily Tiingo rows with zero duplicate dates.

## Sync-run audit

Every invocation creates a `sync_runs` record for the Tiingo provider.

Useful metadata includes:

- `function`
- `provider`
- `symbol`
- `provider_symbol`
- `asset_type`
- `years`
- `interval`
- requested start/end dates
- endpoint family
- received count
- normalised count
- upserted count
- inserted count
- updated-existing count
- actual coverage start/end
- total coverage rows

A failed provider call must leave a failed `sync_runs` record and must not invent market observations.

## Validation requirements

After every backfill, verify all of the following before declaring success:

1. `sync_runs.status = 'succeeded'`.
2. Provider attribution is Tiingo.
3. `interval_code = '1day'`.
4. Earliest and latest historical dates are reasonable for the requested range.
5. Row count is plausible for the asset class and period.
6. There are no duplicate `(instrument, provider, interval, observed_at)` dates.
7. Sample OHLC rows have sensible values and provenance says Tiingo.
8. `high >= low` and database constraints remain valid.
9. The live `latest_market_observations` view remains quote-only.
10. A repeat execution does not increase the historical row count for the same period.

For newly listed instruments, five-year backfill means all data Tiingo actually has since listing. Never fabricate missing pre-listing history.

## Proven NVDA control test

Production test date: **15 August 2026**

Instrument: `NVDA` / NVIDIA Corporation

Requested period:

- start: 15 August 2021
- end: 15 August 2026

Actual Tiingo coverage:

- first bar: **16 August 2021**
- last bar: **14 August 2026**
- daily rows: **1,255**
- duplicate date groups: **0**

Initial run:

- received: 1,255
- inserted: 1,255
- status: succeeded

Idempotency rerun:

- received: 1,255
- inserted: 0
- updated existing: 1,255
- final row count: 1,255
- status: succeeded

Sample provenance checks confirmed `raw_payload._backfill.source = 'Tiingo'`.

## Previous NVDA test cleanup

An earlier controlled Yahoo Finance test had inserted 20 January 2026 NVDA daily rows while incorrectly using the Twelve Data provider ID.

Those clearly tagged test rows were removed before the canonical Tiingo backfill. Do not recreate historical observations under an incorrect provider identity.

## Instrument onboarding procedure

Use this sequence whenever a new market instrument is added:

```text
Add instrument
-> create/verify Twelve Data live mapping if current quotes are required
-> create/verify Tiingo historical mapping
-> run Tiingo 5-year backfill
-> verify coverage and idempotency
-> ready for indicators/backtesting
```

Do not delete historical rows when an instrument later leaves the active universe. Set the instrument or mapping inactive as appropriate so historical backtests remain reproducible.

## Operational prompt

Preferred short prompt:

> Backfill <SYMBOL> 5 years using the Trading historical backfill procedure.

The execution agent should then:

1. retrieve this document fresh from GitHub;
2. inspect the instrument and Tiingo mapping;
3. create the mapping only when identity is unambiguous;
4. invoke `backfill-market-history`;
5. verify the database result and audit record;
6. report actual coverage, row count, duplicates and any limitations.

For the entire current active universe, retrieve and follow:

`automation/historical-market-universe-backfill.md`

Stop rather than guess when symbol identity, provider mapping or returned data is ambiguous.
