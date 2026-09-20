# Shared market calendar input boundary

This is a server-only manifest validator and daily observation attribution helper. It does not fetch prices, authenticate callers, write the database, enable a trading schedule or certify an exchange calendar.

## Files and contract

- `lib/shared-market-calendar.mjs`: `loadCalendarManifest`, `calendarManifestHash`, `localSessionInstant`, `attributeDailyObservations`.
- `data/shared-market-calendars/nasdaq-2026.json`: 365 explicit dates, 251 published regular sessions, exchange NASDAQ, timezone America/New_York.
- `tests/shared-market-calendar.test.mjs`: synthetic and published-schedule validation.

The manifest contains version, exchange, revision, timeZone, startDate, endDate, source URLs, limitations and every calendar date. Each day is OPEN with explicit UTC opens_at/closes_at, or CLOSED with a reason. Missing dates fail. No sessions are inferred from price rows. Stable session IDs are NASDAQ:YYYY-MM-DD.

`loadCalendarManifest(manifest, trust, {asOf, requiredStart, requiredEnd})` requires a separate privileged trust record: manifestHash (recursive sorted-key SHA-256), exchange, revision, verifiedAt, validUntil, reference. Verification and expiry timestamps must bracket asOf. The returned complete calendar has coverageStart/coverageEnd, provenance and sessions in the paper-adapter format. Its completeness is structural plus the external trust decision, not proof from a Boolean supplied by the browser. The DB importer must independently review sources and set trust; the manifest deliberately has no verified flag.

`attributeDailyObservations(rows, calendar, mapping, {asOf})` requires trusted mapping with verified true, reference, dateConvention SESSION_DATE, instrumentId, providerId, currency and exchange. Rows carry explicit session_date labels plus identity, close, adjusted_close and loaded_at. A provider midnight value must only become a date label after its provider semantics are established upstream. Missing adjusted_close fails; it is never copied from close. Attribution returns the official session closing instant, rejects holidays, duplicates, identity mismatches and observations loaded before close or after evaluation. Prices retain decimal strings; downstream adapter enforces its numeric precision limit.

## Sources reviewed 20 September 2026

[Nasdaq 2026 official calendar](https://www.nasdaqtrader.com/Trader.aspx?id=Calendar) supplies the ten weekday closures and the 27 November / 24 December 13:00 Eastern early closes.
[Nasdaq official market hours](https://www.nasdaq.com/market-activity/stock-market-holiday-schedule) supplies 09:30 to 16:00 Eastern regular Nasdaq equity hours. UTC conversion uses the runtime IANA America/New_York timezone, including daylight saving changes.

This is the published 2026 schedule, not an assertion that all past emergency events were audited or that future closures cannot change. Expired trust blocks evaluation. The controller must refresh official alerts, issue a new immutable revision for changes and avoid silently relocating pinned fills. Out-of-year coverage, NYSE/NYSE Arca equivalence and instrument-specific suspensions are not established by this manifest.

## ASX limitation

[ASX 2026 cash calendar](https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours/trading-calendar) lists holidays and 24/31 December early trading cessation at 14:10 Sydney.
[ASX cash phases](https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours.) currently shows opening auction from 09:59 and the closing auction finishing at 16:11 Sydney. Continuous trading ending at 16:00 is not the final daily auction close.

No ASX calendar is promoted here: historical phase applicability, early-day auction completion and the exact provider daily-close semantics require verification. Tests verify Sydney timezone conversion only. ASX price availability and benchmark mapping are separate blockers. Do not reuse Nasdaq or presume 10:00/16:00 ASX timing.

## Verification

Run Node --test tests/shared-market-calendar.test.mjs. Fourteen checks cover full explicit coverage, missing dates, tampering, expired trust, DST in both hemispheres, holiday/early-close handling, provider mapping, daily timestamp attribution, missing adjusted prices, duplicates and availability times. Passing these does not prove live provider semantics or live SQL integration.

