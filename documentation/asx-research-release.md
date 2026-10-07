# WA1/1AI research publication release

Install `scripts/shared-research-recommendations.sql` once through the Supabase migration tool before deploying the UI. It depends on installed shared decision tables, private immutable-change trigger and public independent research tables. Run `scripts/test-shared-research-recommendations.sql` only as its explicit rollback transaction; never invoke a live scheduled job with fixtures.

Research records and sources are immutable; corrections append a new legitimate assessment and recommendation. Do not delete saved originals. On UI failure roll back the deployment while keeping the reader and saved data. An older UI simply does not consume the new RPC. No previous evaluator/calendar configurations are changed by this migration.

To promote ASX to measured publication, separately verify provider mappings, raw/adjusted prices and exchange-session interpretation, official ASX calendar and compatible AUD benchmark; test the normal prospective evaluator path before enabling configuration. A later genuine measurable call hides active research-only cards but preserves their history. Do not backfill performance onto today's research records.

Live manual research run: `545e307b-41e2-45fd-8af1-56145d6b982d`; cutoff `2026-10-07T03:12:30.002497Z`. Saved WA1/1AI WAIT records and release evidence are in `documentation/decision-lab-evidence-log.md`. First scheduled v1.7 adoption and signed-in browser reconciliation remain separate operational verification.
