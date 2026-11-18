# ASX research session readiness

This boundary checks whether admitted Yahoo raw daily history is ready for independent research. It does not enable paper fills, ASX evaluation, a benchmark, provider rights or publication. No table, function, grant or schedule is installed by this release.

## Reviewed calendar

`data/shared-market-calendars/asx-research-2026-20261118.json` lists every date from 15 October through 20 December 2026: 67 dates, 47 OPEN weekdays. It has no opening/closing timestamps and cannot be imported with the shared fill-calendar importer. Its separate `.trust.json` binds the canonical SHA256, purpose and revision to reviewed sources. Review expires **25 November 2026 02:34:21 UTC**. Date coverage does not extend review expiry.

The [official notice 0922.25.08](https://asxonline.com/content/asxonline/public/notices/2025/august/0922.25.08.html), updated 20 March 2026, and [2026 cash calendar PDF](https://asxonline.com/content/dam/asxonline/public/notices/2025/august/asxtrade2026.pdf) list no scheduled holidays or shortened dates in this bounded period. Omitted weekdays are trading days. Coverage starts after Sydney's daylight-saving transition and ends before the 24/31 December shortened sessions; do not extrapolate over them.

The [current cash phases](https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours) include opening auction from 09:59, closing auction finishing at 16:11 and post-close trading through 16:21:30 Sydney. Continuous trading's 16:00 end does not prove daily-bar finality. This research contract always excludes the current Sydney date, even after trading hours, and assigns no hypothetical execution instant to Yahoo date labels.

The [official status page](https://www.asx.com.au/markets/market-resources/system-status) embeds a public status feed. Its `a=historyAll` feed at `https://mcw59b7dl3hk0mnrsr49zd4b7jby.pub.sfmc-content.com/tezwp3l1olh` was independently checked at 02:34:21 UTC on 18 November. November ASX Trade notices concerned Outlook issues while exchange services were operational, followed by a normal-operation update. This is not an exhaustive disruption or instrument-halt audit. Check fresh official alerts each invocation; affected dates/instruments remain blocked pending review even when the query passes.

## Controller use

Fetch `scripts/asx-research-readiness.sql` fresh at the controller's exact source commit. Execute unchanged, read-only, before preparing a new Market run. One current statement cutoff covers each ASX instrument in the active/watched/open-call union. Inactive watched/open entries stay explicitly blocked. No personal notes, indicators, Technical scores or assessment conclusions are read.

The query checks current trust and coverage through yesterday in Sydney, then selects the last explicit OPEN date strictly before today. It never falls back to a truncated calendar's end. The existing read-only `technical_engine.asx_source_snapshot_v1` is used solely for raw-source provenance validation; despite its schema name it reads/computes no Technical indicator or score. Source failures retain their exact `source_reason`.

`RAW_PRICE_SESSION_READY` requires a clean source, target date present, at least 20 distinct admitted OPEN observations within reviewed coverage, no admitted CLOSED-date bars in that range, and no observations loaded after cutoff or dated today/later. Twenty OPEN observations need not be consecutive and do not certify complete history. Older rows outside coverage are not calendar-certified. Existing identity, raw-value, duplicate, correction/quarantine and audit-lineage checks remain unchanged.

Save cutoff, calendar revision/hash, target/latest admitted session, source hash, anchor/terminal audit IDs, counts and blockers in the per-instrument ledger. A succeeded history job or US-hours quote status is not a substitute. Prepare issuer/publication source receipts before freezing a legitimate new assessment cutoff. That cutoff must be at or after readiness, with every analytical input available before it. At use, recheck current source identity/hash and rejection state; changed evidence requires fresh admission within the existing lifecycle, never moving/backdating a cutoff or creating a second same-date run. This query is not an input-persistence function or permission to use Technical conclusions in Market research.

Current issuer/news proof, operation-specific rights, Market lifecycle, publication hashes and measured configuration remain separate gates. Verify scheduled adoption from the next legitimate hosted invocation's exact source commit and durable receipts.

## Renewal and recovery

Review official calendar/alerts before expiry. Under the development lock, create a new immutable manifest/trust revision, preserve prior files, regenerate the query and obtain independent review/tests:

```powershell
node scripts/prepare-asx-research-readiness.mjs data/shared-market-calendars/asx-research-2026-20261118.json data/shared-market-calendars/asx-research-2026-20261118.trust.json scripts/asx-research-readiness.sql
```

The offline compiler validates purpose, explicit dates, hash, identity and a maximum seven-day trust window. It executes no SQL. Commit the generated SQL with reviewed inputs; hosted controllers can execute that file without a shell. Never extend trust without fresh evidence or convert this artifact into a fill calendar.

Rollback reverts the repository controller/query reference and restores the explicit calendar blocker. No database rollback or history deletion is involved.
