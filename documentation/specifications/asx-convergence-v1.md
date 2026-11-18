# ASX Market Convergence v1

`market-convergence-asx-v1` combines existing ASX Technical and independent AI Market scores. It does not change original `market-convergence-v1`, independent research, recommendations, price ingestion schedules or measured returns. Implementation: `20261118033709_add_asx_convergence_adapter_v1.sql`.

## Admission and arithmetic

Only active ASX/AUD equities qualify. Select the latest named Technical and AI rows at one cutoff, using date, creation/calculation time and descending ID, before validating their content. Never fall back around a newer invalid or unfinished row.

- Technical requires `technical-score-asx-v1` / `technical-engine-asx-v1`, complete or partial status and scores/confidence in 0–100. Its score date must equal the last OPEN date strictly before the cutoff's Sydney date and be 1–4 calendar days old. Current Sydney bars are always excluded.
- The installed, independently validated date-only calendar must cover yesterday and remain trusted now. Require the target bar, at least 20 distinct OPEN observations within reviewed coverage, no CLOSED-date bars there and no post-cutoff loads. This does not certify consecutive/full history, individual halts, daily-price finality or hypothetical fills. The controller must check fresh official status alerts before dispatch.
- Reproduce the exact saved private ASX snapshot at the cutoff; require its source hash to remain current and its cutoff/calculation time/metadata to agree. Recalculate the saved Technical score and compare its values/status/details. Completed-week calculation boundaries must remain current. Quarantine or later source changes block rather than substitute data.
- AI requires `independent-market-ai-v1`, `technical_engine_input_used=false`, valid score/confidence/rating and a date 0–4 calendar days before the **New York** logical date. The selected run must be succeeded/partial and completed by the cutoff, after its assessment was created. Its research cutoff must precede assessment creation. A newer unfinished run blocks.
- Preserve original v1 arithmetic: round input scores/confidences to two decimals, equal-weight mean, absolute score gap, opposite nonneutral signals first classified conflict, otherwise gap ≥25 mixed, <10 aligned. Confidence is the rounded geometric mean multiplied by `(1-gap/200)`, capped at 40 conflict, 60 mixed or 100 otherwise. Original label thresholds and raw Technical signal thresholds remain unchanged. Normalize AI signal casing.

## Persistence, idempotency and retries

`market_convergence.asx_runs_v1` is a separate private ledger, so original v1 retry tools cannot pick ASX failures. Each receipt freezes the complete selected Technical row, immutable source snapshot, AI assessment and terminal run, reviewed calendar and cutoff. These inputs are inserted outside the calculation subtransaction and survive a failed calculation/publication. Rows can move from running to one terminal status; terminal history cannot be rewritten or deleted.

The public result retains the existing presentation shape plus nullable `technical_source_date`, `ai_source_date`, `source_cutoff_at`. These are required for ASX; legacy rows remain unchanged/null. Identity is instrument + greatest source date + method. ASX rows are insert-once and protected against update/deletion, including FK cleanup. Identical inputs are idempotent; different inputs for the same identity explicitly conflict. Same-day matching execution returns the original successful receipt. A fresh cutoff alone does not change source identity. Later Technical refreshes may deliberately cause an immutable conflict: do not overwrite the saved result to hide it.

New scheduled/manual admissions require a cutoff no more than five minutes old. `run_asx_v1(instrument_id, source, retry_id, cutoff)` acquires the existing global convergence advisory lock and refuses unresolved running receipts in either ledger. Failed leaves block a new chain on that logical date. Only a diagnosed failed leaf can retry; inherit original instrument/cutoff/envelope, allow one child and at most three total attempts. Revalidate the entire frozen envelope, including current source and trust; calendar renewal or any selected-row mutation may invalidate an old chain permanently. Never freshen/backdate it. A later legitimate date may admit genuinely new evidence.

Use `scripts/asx-convergence-readiness.sql` unchanged, then execute only READY SQL in separate short transactions. ALREADY_SUCCEEDED is an existing receipt, not new work. Read receipts by exact returned UUID, verify succeeded and linked result with identical saved IDs/dates/values. A lost response requires durable lookup by scope/cutoff before replay. Failed SQL is not success merely because the function returned a UUID. No automatic retry or separate scheduler is installed.

## Access and consumers

Calendar and private run tables have RLS enabled and no public policies. anon/authenticated cannot read/write them or execute adapter functions. Trusted service_role may read the calendar, insert/read run receipts and update only terminal fields. Calendar installation/renewal remains owner-only, compiled with `validateAsxResearchCalendar` and independently reviewed; SQL constraints are not a replacement for manifest/hash/full-coverage validation. This is a trusted SQL operator boundary, not an untrusted arbitrary-write API.

Dashboard and Opportunity context readers select the supported methodology by venue; details display the frozen Technical source date. Existing overview scope remains the latest production AI run, so it is not an inventory of all historical ASX results. Independent shared recommendations and measured outcomes do not consume convergence. Original success-triggered alerts watch the original public run ledger: **automatic ASX convergence alerts are not installed by this adapter**. The generic alert evaluator can read these results if separately invoked; no alert is manually fired during acceptance.

## Recovery and acceptance

Disable controller C.1 ASX dispatch and revoke `service_role` execution of `run_asx_v1` if needed. Preserve new tables, source snapshots, receipts and public history; never run a destructive down migration or drop public columns after frontend deployment. Original v1 remains callable and definition-identical. UI rollback is compatible with additive columns but loses the corrected source-date presentation.

Local actual-Postgres fixtures cover admission, formula parity, immutability, retry/failure boundaries and privileges. Native multi-session advisory lock contention requires a real multi-connection environment; single-backend fixtures cannot certify it. Deployment and any current one-off results are separate from unattended acceptance, which requires a genuine eligible controller run on the new commit. Report current ready/missing/stale counts separately.

Initial calendar: `asx-research-2026-20261118`, coverage 15 October–20 December 2026, trust expires **25 November 2026 02:34:21 UTC**. Renew with newly reviewed official evidence before expiry; no rolling self-renewal or inference from weekdays.
