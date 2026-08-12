# Market Data Pipeline

## Purpose

The market-data pipeline loads current quotes from Twelve Data into Supabase and records each execution for operational monitoring.

This is currently the most complete automated pipeline in the platform.

## Components

### Provider

`data_providers`

Current provider:

- code: `twelvedata`
- name: `Twelve Data`
- active: true

### Instrument universe

`instruments`

Current active universe:

- 15 equities
- 5 ETFs
- 5 forex pairs
- 5 crypto pairs

Total: 30 instruments.

### Provider mappings

`provider_instruments`

Each internal instrument maps to the provider symbol expected by Twelve Data.

## Scheduled loader

pg_cron job:

- name: `trading-market-data-every-15-minutes`
- schedule: `*/15 * * * *`
- active: true

The cron job calls the Supabase Edge Function `full-twelve-data-load` through `net.http_post`.

The project URL and publishable key used by the scheduled HTTP call are stored in Supabase Vault.

## Edge Function: `full-twelve-data-load`

Current version: 4.

JWT verification is enabled.

### Server-side configuration

The function expects:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWELVE_DATA_API_KEY`

The service-role key and Twelve Data key stay inside the Edge Function environment and must never be exposed in frontend code.

### Eligibility logic

The loader evaluates instruments by asset type.

#### Forex

Always eligible.

#### Crypto

Always eligible.

#### Equities and ETFs

Eligible only while the US market is open.

The loader uses `America/New_York` time and checks:

- weekday
- 09:30 to 16:00 local market hours
- major US market holidays

The holiday calculation includes:

- New Year's Day
- Martin Luther King Jr. Day
- Presidents Day
- Good Friday
- Memorial Day
- Juneteenth
- Independence Day
- Labor Day
- Thanksgiving
- Christmas Day

#### Futures

Explicitly not eligible in the current function.

Unknown asset types are also skipped.

## Refresh control

Before choosing the batch, the function queries observations loaded in the previous 60 minutes.

Any instrument seen in that rolling window is excluded from the next batch.

The eligible instruments are then:

1. filtered to those not loaded in the previous 60 minutes;
2. sorted by symbol;
3. limited to a maximum batch size of 8.

This means the pg_cron trigger runs every 15 minutes, but an individual instrument is generally refreshed no more frequently than approximately once per hour.

## Load execution

For each chosen provider mapping, the function calls:

`https://api.twelvedata.com/quote`

The provider symbol and API key are passed as query parameters.

A 250 ms pause is used between symbols in the batch.

## Observation insert

Successful provider responses are written to `market_observations`.

Fields populated include:

- `instrument_id`
- `provider_id`
- `interval_code = 'quote'`
- `observed_at`
- OHLC fields
- `adjusted_close`
- `volume`
- `currency_code`
- `is_delayed = true`
- `raw_payload`

`loaded_at` is assigned by the database default.

## Sync-run audit

Every loader invocation first creates a `sync_runs` row with status `running`.

Metadata currently records:

```json
{
  "function": "full-twelve-data-load",
  "batch_size": 8,
  "market_hours_aware": true,
  "eligible_count": 0,
  "skipped_out_of_session": 0,
  "evaluated_at": "timestamp"
}
```

After processing the batch, the run is updated with:

- `finished_at`
- `received_count`
- `inserted_count`
- final `status`
- `error_message` if required

Status logic:

- `succeeded` — no symbol failures
- `partial` — at least one row inserted, but one or more symbols failed
- `failed` — failures occurred and nothing was inserted

## Monitoring dashboard

The Admin dashboard reads:

- `sync_runs`
- `market_observations`
- `instruments`

It derives:

- last load
- last successful load
- loads today
- observations today
- failed/partial runs today
- active instrument count
- latest observation time
- 14-day load/observation history
- observation freshness by instrument

The load-detail page uses a selected `sync_runs` record and searches `market_observations` around the run time to show the observations associated with that execution.

## Test Edge Function

`test-twelve-data-load` is also active.

Purpose:

- load one explicitly requested symbol;
- default to NVDA when no symbol is provided;
- create the same `sync_runs` and `market_observations` audit trail.

This function is useful for controlled diagnostics but is not the scheduled production loader.

## Known limitations

- The current function loads quotes rather than full intraday bars.
- Futures are not currently loaded.
- Equity/ETF eligibility assumes US market hours, so adding non-US exchange instruments will require exchange-aware market-session logic.
- Freshness should be interpreted by asset class and session state rather than using a single global stale-data threshold.
- `observed_at` currently uses the loader execution time rather than a parsed provider timestamp.

## Recommended operational rule

Do not infer loader health from instrument age alone. Use `sync_runs` status together with asset eligibility, current market session and the latest `market_observations.loaded_at` values.
