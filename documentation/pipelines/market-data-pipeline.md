# Market Data Pipeline

## Purpose

Trading now has two deliberately separate market-data paths:

1. **Twelve Data live/current quotes** for operational dashboards.
2. **Tiingo daily historical backfills** for indicators, research and backtesting.

Both write to `market_observations`, but they use separate providers and interval codes so current-market behaviour and historical analysis do not interfere with one another.

For the complete historical procedure, see:

`documentation/pipelines/historical-market-data-backfill.md`

## Providers

`data_providers` currently includes:

- `twelvedata` / Twelve Data — current quote provider.
- `tiingo` / Tiingo — on-demand historical provider.

Provider identity is part of the observation key and must remain accurate. Historical Tiingo data must never be labelled as Twelve Data.

## Instrument universe

`instruments` is the internal instrument master.

Current active universe at the time of this documentation includes:

- 15 equities
- 5 ETFs
- 5 forex pairs
- 5 crypto pairs

Total: 30 active instruments.

## Provider mappings

`provider_instruments` maps each internal instrument to the provider-specific symbol.

A single instrument may have separate mappings for Twelve Data and Tiingo.

This permits:

```text
internal instrument
  +-- Twelve Data symbol -> live quotes
  +-- Tiingo symbol      -> daily history
```

Do not assume two providers always use identical ticker syntax. Stop rather than guess when a mapping is ambiguous.

## `market_observations`

The shared observation table stores both current and historical market records.

### Live records

The scheduled Twelve Data loader writes:

- `provider_id` = Twelve Data
- `interval_code = 'quote'`
- current OHLC/close/volume information
- provider response in `raw_payload`

### Historical records

The Tiingo backfill writes:

- `provider_id` = Tiingo
- `interval_code = '1day'`
- actual historical market date in `observed_at`
- raw OHLC
- adjusted close where available
- volume
- Tiingo provenance in `raw_payload._backfill`

The unique key is:

```text
(instrument_id, provider_id, interval_code, observed_at)
```

This supports idempotent provider-specific historical upserts.

## Latest observation view

`latest_market_observations` is a security-invoker view used by the Markets dashboard.

It is intentionally restricted to:

```sql
interval_code = 'quote'
```

This is important because daily Tiingo history can otherwise have a later market date than the latest current quote and incorrectly become the dashboard's "latest" observation.

The view still returns one latest live quote per instrument using `observed_at`, `loaded_at` and row ID as deterministic ordering fields.

## Scheduled Twelve Data loader

pg_cron job:

- name: `trading-market-data-every-15-minutes`
- schedule: `*/15 * * * *`
- active: true

The cron job calls the Supabase Edge Function `full-twelve-data-load` through `net.http_post`.

The project URL and publishable key used by the scheduled HTTP call are stored in Supabase Vault.

### Edge Function: `full-twelve-data-load`

Current deployed version at the time of this document: 4.

JWT verification is enabled.

Server-side configuration:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWELVE_DATA_API_KEY`

The service-role key and Twelve Data key must never be exposed in frontend code.

### Eligibility logic

Forex and crypto are always eligible.

US equities and ETFs are eligible only while the US market is open. The loader uses `America/New_York` time and checks weekday, configured US market holidays and 09:30-16:00 market hours.

Futures and unknown asset types are currently skipped.

### Refresh control

Before selecting a batch, the loader queries observations loaded during the previous 60 minutes.

Recently loaded instruments are excluded, then remaining eligible instruments are sorted by symbol and limited to a maximum batch of 8.

The cron triggers every 15 minutes, but an individual instrument is normally refreshed no more frequently than about once an hour.

### Quote retrieval

The loader calls:

`https://api.twelvedata.com/quote`

Successful provider responses are inserted into `market_observations` with `interval_code = 'quote'`.

### Current-loader audit

Every invocation creates a `sync_runs` record with status `running`, then updates it with counts, finish time, final status and any error message.

Status logic:

- `succeeded` — no symbol failures.
- `partial` — at least one row inserted and at least one symbol failed.
- `failed` — failures occurred and nothing was inserted.

## On-demand Tiingo historical loader

Edge Function:

`backfill-market-history`

Default request:

```json
{
  "symbol": "NVDA",
  "years": 5
}
```

Server-side configuration:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TIINGO_API_TOKEN`

The Tiingo token is stored in Supabase Edge Function secrets and must never be committed to GitHub.

The function requires:

- an existing active instrument;
- an active Tiingo provider;
- an active Tiingo mapping for the instrument.

It currently contains retrieval handling for equities/ETFs, forex and crypto. The production-proven path as of 15 August 2026 is Tiingo EOD equity history.

### Idempotency

Historical observations are upserted using the unique market-observation key. Repeating the same symbol/range updates existing Tiingo daily records rather than creating duplicates.

The NVDA production test loaded 1,255 daily rows on the first run. The immediate rerun received the same 1,255 rows, inserted 0 new rows and updated the existing 1,255 rows. The final historical row count remained 1,255 with zero duplicate dates.

### Historical audit

Each backfill creates a Tiingo `sync_runs` record with metadata including:

- function
- symbol
- provider symbol
- asset type
- requested start/end
- years
- interval
- endpoint family
- received/normalised/upsert counts
- inserted and updated-existing counts
- actual coverage
- total coverage rows

For the complete run procedure and validation checklist, use `historical-market-data-backfill.md`.

## Monitoring dashboard

The Admin dashboard reads `sync_runs`, `market_observations` and `instruments` to derive loader health, current observation freshness, run counts and failures.

The Markets dashboard reads `latest_market_observations`, which now deliberately represents live `quote` observations only.

Historical `1day` records are analytical data and are not used to determine current-market freshness.

## Diagnostic functions

`test-twelve-data-load` remains available for loading one explicitly requested live quote, defaulting to NVDA when no symbol is supplied.

`backfill-twelve-data` also exists as an earlier historical Twelve Data test function. The canonical on-demand five-year historical workflow is now `backfill-market-history` using Tiingo.

## Known limitations

- The scheduled current loader loads quote snapshots rather than full intraday bars.
- Futures are not loaded by the current quote function.
- US equity/ETF session logic is not yet exchange-aware for non-US listings.
- The current Twelve Data quote loader uses loader execution time for `observed_at` rather than parsing the provider timestamp.
- Tiingo equity EOD history is production-tested; Tiingo forex and crypto paths require their own controlled verification before being treated as production-proven.

## Operational rules

For live-loader health, use `sync_runs` status together with asset eligibility, market session, latest observation time and ingestion time.

For historical onboarding use:

```text
Add instrument
-> create/verify provider mappings
-> Tiingo 5-year backfill
-> verify coverage and idempotency
-> ready for indicators/backtesting
```
