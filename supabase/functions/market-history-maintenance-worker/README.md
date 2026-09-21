# ASX Yahoo daily history

## Latest verified result — 17 September 2026

Worker version 6 loads valid bars while quarantining invalid OHLC/volume records
in `sync_runs.metadata.rejected_bars`, including their original values and dates.
Identity mismatches and duplicate dates still reject the response. Six tests pass.
A successful job means valid records were processed, not that there are no gaps;
`last_error` retains a warning if records were excluded.

All 15 database instruments with ASX exchange have Yahoo daily history through
2026-09-16. Thirteen already had available history; this run added 1,009 older
records each for QAN and XRO. Both now hold 1,264 records spanning five years.
Each excludes 2024-11-15 because Yahoo close exceeds Yahoo high. Original values
remain in audit runs 4a28202a-e4e8-49a2-ba31-b9e3f4c360b4 (QAN) and
f26194a8-5ab1-4a05-b32e-6007f0a549ba (XRO). No prices were fabricated.

Shorter available source histories: 10X starts 2025-12-11 (193 rows), SLM starts
2025-12-18 (187 rows), WA1 starts 2022-02-08 (1,166 rows). These start dates are
provider coverage, not independently verified listing dates. Other shares span
approximately five years. Verification found zero duplicate Yahoo daily dates.
Existing daily schedules remain enabled. This does not complete Decision Lab
provider/benchmark integration. Earlier verification notes below are historical.

The existing `market-history-maintenance-worker` now routes ASX instruments to
`yahoo.mjs`. Other instruments retain the existing Tiingo path. This is a
TypeScript/JavaScript Supabase Edge Function; it does not install Python yfinance.
Yahoo remains an additional external data source, even though no API key is needed.

## Operation

- Existing cron invokes the worker every two minutes, claiming one queue job.
- Existing daily enqueue runs at 22:30 UTC (06:30 Perth), covering active instruments
  and watchlist instruments. No extra schedule was created.
- ASX initial jobs fetch five years where available; daily jobs re-fetch one year
  to fill recent gaps and refresh adjusted closes after corporate actions.
- Excludes the current Sydney session, even after market close, to avoid partial bars.
- Validates ASX venue, symbol, AUD currency, Sydney timezone and daily interval.
- Stores Yahoo-native OHLC and separately supplied adjusted close. Never relabels
  Yahoo records as Tiingo or Twelve Data. Do not assume native OHLC is unadjusted
  pre-split exchange data.
- Upserts by instrument/provider/interval/date. Re-runs do not duplicate bars.
- Sync runs retain requested dates, actual coverage, corporate-action events,
  retrieval time and failures. No decision/prediction records are modified.
- HTTP failures use the existing bounded ten-minute retry policy. No proxy rotation
  or access-control workarounds are implemented.

Provider seed (idempotent; already applied to the connected project):

```sql
insert into public.data_providers(provider_code,provider_name,base_url,is_active)
values ('yahoo','Yahoo Finance (unofficial)','https://query1.finance.yahoo.com',true)
on conflict (provider_code) do nothing;
```

Deploy `index.ts`, `yahoo.mjs` and `deno.json` together with JWT verification enabled.
The existing worker gateway/cron authentication is retained.

## Verification — 16 September 2026

Final controlled check: worker version 5 adds an honest application User-Agent and
Accept: application/json header. Supabase request 10852 succeeded for FUN, saving
1,265 daily records from 2021-09-15 through 2026-09-15. The earlier 429 responses
therefore do not establish a blanket Supabase IP block. The existing queue remains
enabled. Complete coverage of all symbols and long-term reliability remain unverified.
XRO also has a separately observed inconsistent OHLC bar (2024-11-15); validation
correctly rejects it. Do not claim XRO ingestion is fixed by the header change.

Earlier checks:

- Five normalization tests pass (`node --test yahoo.test.mjs`).
- Local Yahoo request for XRO.AX returned 1,265 timestamps over a five-year range.
- Supabase worker version 4 deployed successfully.
- Live request 10842 returned HTTP 429 from Yahoo and correctly recorded
  `retry_scheduled`. Cloud access and completed ASX backfill are NOT verified.
- Fifteen initial ASX jobs were queued. Check their final status before asserting
  successful backfill. A provider's historical availability varies by ticker.

If Yahoo continues limiting Supabase's outbound IP, fetching must run on a separate
scheduled host and securely ingest into Supabase, or use a supported provider.
That external collector is not part of this deployment.

Some downstream technical/decision queries still explicitly select Tiingo.
Saving Yahoo history does not by itself make those consumers use it. A separate
provider-selection change and end-to-end validation are required before claiming
ASX recommendations or Decision Lab outcomes are working.

Yahoo is unofficial and intended for personal research; this adapter does not
grant redistribution rights or guarantee service availability.
