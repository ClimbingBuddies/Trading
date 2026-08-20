# SEC-002 Builder verification — deployment blocker

**Task:** `SEC-002 — Apply deliberate RLS policies`  
**Date:** 19 August 2026  
**Status:** RESOLVED — strict boundary restored and ready for independent audit

## Implemented database boundary

Migration `supabase/migrations/20260819055000_apply_deliberate_market_assessment_rls.sql` was applied to the live Trading Supabase project.

Verified live effects:

- Market Assessment run visibility is limited by RLS to completed terminal `scheduled` runs.
- `anon` sees 1 published run, 30 published assessments and 68 linked evidence rows.
- The two test runs and their 60 assessments / 90 evidence rows are hidden by the row policies.
- Client write privileges remain absent on Market Assessment output/control tables.
- `market_assessment_queue` and `market_assessment_schedule_log` remain client-inaccessible.
- All seven Market Assessment orchestration functions are non-executable by `PUBLIC`, `anon` and `authenticated`, with execution reserved for `service_role`.

## Frontend correction committed

`lib/dashboard.ts` was updated so `getLatestProductionMarketRun()` requests only the approved seven-field published run envelope and relies on database policy for publication membership rather than reading internal run metadata.

## Deployment blocker

The connected Vercel project is still serving production deployment `dpl_BaQwapXgYdMas7u9KA2VBhuuUqRq`, based on GitHub commit `b8a83185898fc3446a82314521e8224c3bab23b9`, which predates the SEC-002 frontend correction.

No newer deployment appeared after the SEC-002 GitHub commits. The connected Vercel deploy action also returned an input-schema error instead of starting a deployment.

When the strict column boundary was first applied, the pre-SEC-002 production frontend failed because it still selected internal `gpt_market_runs` columns:

- `/assessments` rendered its no-data fallback;
- `/assessments/NVDA` rendered its no-data fallback;
- `/markets/NVDA` returned HTTP 500.

## Temporary production compatibility bridge

To avoid leaving production broken while Vercel still serves the old query shape, migration `supabase/migrations/20260819062500_sec002_legacy_frontend_compatibility.sql` temporarily grants client `SELECT` on only these four legacy run columns:

- `model_name`
- `prompt_version`
- `analysis_mode`
- `notes`

The stricter row-level publication filter remains active, so test and non-terminal runs remain hidden. Client writes, control tables and orchestration functions remain protected.

After the bridge was applied, production verification returned HTTP 200 with real published data for:

- `/assessments`
- `/assessments/NVDA`
- `/markets/NVDA`

## Required remediation before audit

SEC-002 must not move to `IN REVIEW` until all of the following are independently established by the Builder:

1. the corrected `lib/dashboard.ts` commit is deployed to the production `boulders-market` project;
2. all three affected production routes continue to return usable published data;
3. the temporary four-column compatibility grants are revoked in a follow-up migration;
4. `anon` and `authenticated` can read only the approved seven-field run envelope;
5. test/non-terminal rows remain hidden, client writes remain blocked, control tables remain private and orchestration functions remain trusted-backend-only.

The Builder must then re-run primary-evidence verification and only then hand SEC-002 to the independent Auditor.

## Resolution and Builder re-verification — 20 August 2026

The deployment dependency is resolved. Vercel production deployment `dpl_AkLMcwYHY3PgsWbxg8gURh8f3puj` is `READY` on current `main` commit `aec4efc96cc6df9ca7c6840e46375a39de630c52`, which contains the corrected seven-field `lib/dashboard.ts` query.

Migration `supabase/migrations/20260820013500_sec002_remove_legacy_frontend_compatibility.sql` was committed to GitHub and applied to live project `glvbqcplgjdfgjyknzsa`. It revokes client `SELECT` on `model_name`, `prompt_version`, `analysis_mode`, and `notes`.

Fresh post-change evidence:

- `anon` and `authenticated` have exactly the approved seven readable `gpt_market_runs` columns;
- direct reads of the four legacy/internal columns fail with PostgreSQL `42501 permission denied`;
- both client roles see exactly 2 currently publishable runs, 60 linked assessments, and 128 linked evidence rows;
- the database contains 4 total runs, 120 assessments, and 218 evidence rows, so the 2 private runs and their 60 assessments / 90 evidence rows remain hidden;
- clients retain no insert, update, or delete privileges on any of the five output/control tables;
- `market_assessment_queue` and `market_assessment_schedule_log` remain unreadable to client roles;
- all seven orchestration functions remain non-executable by `anon` and `authenticated`, and executable by `service_role`;
- `/assessments`, `/assessments/NVDA`, and `/markets/NVDA` each return HTTP 200 with real published data after the revocation;
- the fresh Supabase Security Advisor result contains no SEC-002-specific finding. The existing `pg_net` warning remains scoped to `SEC-004`.

All recorded remediation conditions are now satisfied. SEC-002 has been handed to the independent Auditor as `IN REVIEW`.
