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

### Late provider session recovery

A completed download can truthfully omit a session when Yahoo returns an empty bar. Keep `TARGET_SESSION_MISSING` separate from a failed worker and from missing AI research. Do not copy the preceding close into the gap, assume a holiday, or treat `requested_end` as admitted coverage.

If a fresh read through the existing `fetchYahoo` normalizer now returns the missing completed session with matching symbol, ASX, AUD and Sydney daily identity, use the already reviewed `scripts/recover-asx-missing-session.sql` under the development lock. Bind its four session parameters to the reviewed instrument, symbol, current clean terminal audit and yesterday's Sydney target. The script rejects changed enqueue definitions, conflicting identity/keys, existing active work and an already present target; it creates one idempotent ordinary incremental job. Existing demand-driven dispatch performs ingestion and the existing Technical refresh follows. No schedule or analytical run is created by this recovery.

Verify the actual terminal job and linked audit, retained rejected-bar evidence, admitted target date and matching Technical source before declaring recovery. A queued job alone is not recovery. A zero-volume provider bar can be retained under the existing source contract; it is not proof of an executed trade, continuous liquidity or an eligible paper fill. Preserve all prior job/audit records. Do not reset or replay an existing recovery key after failure without a new review.

### Research coverage review — 19 November 2026, before 08:00 Perth

The first overnight verification after PR69 found 70 scheduled watchdog executions succeeded from 18 November 14:15 through 19 November 07:30 Perth. ASX failures are isolated from ordinary monitoring, so these cron receipts alone do not prove 70 healthy ASX snapshots. The latest saved ASX snapshot was independently readable and classified its actual blockers. No ASX alert rules were configured; a real configured crossing and daily AI controller acceptance remain separate checks.

The active universe still includes all 15 ASX instruments. The assessment inventory explains the 12 research gaps:

| Saved independent AI research | Instrument count | Required work |
| --- | --- | --- |
| Never saved | 9 | First current evidence-backed assessment |
| Last dated 21 October | 2 | Fresh research; retain old rows |
| Last dated 6 October | 1 | Fresh research; retain old row |
| Last dated 16 November | 3 | Reassess in the next legitimate daily run; existing rows remain within the adapter's separate four-day admission window |

The 17 November scheduled Market run saved three assessments and finalized partial. The 18 November Market stage recorded a combined ASX session/Tiingo saved-output blocker before that day's session/calendar repairs, and saved no new Market run. This is an upstream research-production gap, not a display filter hiding completed assessments. The current controller already requires a disjoint per-instrument eligible/blocked ledger; an unrelated Tiingo restriction cannot block independently eligible Yahoo/issuer research. Existing issuer proof, frozen cutoff, rights and publication gates still apply.

The 19 November 07:31 raw-session check admitted 18 November prices for 14 instruments. One instrument was source-clean but lacked that target: its 18 November 22:22 download skipped one empty provider bar. A fresh provider check at 19 November 07:33 returned the complete target bar without rejects/duplicates, with zero volume. One reviewed recovery was queued at 07:36 through the unchanged script; its terminal outcome must be checked before claiming all 15 are price-ready. Exact instrument/job/audit identities stay in protected operational evidence.

Queue size alone is not queue position. The live claim function matches the 17 November alignment migration: active open calls first, then active watched instruments, then the rest of the active universe, then background history. It retains initial-backfill priority within each class and atomic `FOR UPDATE OF j SKIP LOCKED` claiming. At 07:44 the recovery was eighth among due pending jobs, not behind all background jobs. Preserve the existing two-minute dispatch and provider allowances; neither a larger total queue nor one delayed provider bar justifies increasing request frequency or replacing the installed ordering.

Today's 08:00 controller was not yet due at this review cutoff. Its adoption must be established from its actual source SHA, stage receipts, saved assessment/evidence rows and native convergence receipts. Price readiness does not certify current issuer research or successful publication. Do not launch a competing manual Market run or backfill an earlier cutoff to make this review appear complete.
