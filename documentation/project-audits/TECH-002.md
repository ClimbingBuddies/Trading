# TECH-002 — Implement core technical indicators

## Independent audit — 21 August 2026

**Review date/time:** 21 August 2026, 15:09 Australia/Perth  
**Project-plan status at review start:** `IN REVIEW`  
**Decision:** `REWORK`

## Definition of Done checks

| Requirement | Verdict | Primary evidence |
|---|---|---|
| Core indicator implementation exists | VERIFIED | GitHub migrations define SMA-20/50/200, EMA-12/26, Wilder RSI-14, MACD and annualised volatility under `technical-engine-v1`, with daily and completed-week processing. |
| Results are generated from real market observations | VERIFIED | Live Supabase contains 89,805 Tiingo `1day` source rows across 71 instruments. The indicator function reads `market_observations` / `data_providers`, and all persisted result provenance identifies Tiingo. |
| Versioned indicator output is persisted | VERIFIED | Live `technical_indicators` contains 1,136 `technical-engine-v1` rows across 71 instruments and 142 instrument/interval pairs: 568 daily and 568 weekly. Each of the eight indicator codes has 142 rows. |
| Formula implementation matches the canonical specification | VERIFIED | An independently written recursive SQL calculation over raw NVDA observations matched persisted daily and weekly SMA, EMA, Wilder RSI, MACD signal/histogram and annualised volatility. Scalar differences were below (5 × 10^-9), consistent with the table's `numeric(24,8)` storage scale; MACD signal and histogram matched exactly. |
| Missing-history behaviour is deterministic | VERIFIED | Live output has 1,121 complete rows and 15 explicit `insufficient_history` rows. Incomplete values are null, carry reason/provenance fields and correspond to available periods below the documented threshold. |
| Daily and weekly identities do not collide | VERIFIED | The live unique constraint is `(instrument_id, observation_id, interval_code, indicator_code, calculation_version)`; no duplicate keys exist. |
| Retry is idempotent | VERIFIED | A targeted NVDA retry reported 16 upserts, retained 16 rows with the same row IDs, left the total versioned row count at 1,136 and created no duplicate keys. |
| Technical Engine independence is preserved | VERIFIED | The live refresh definition reads market observations and contains no references to GPT Market Assessment, Opportunity Assessment, `market_scores` or convergence tables. |
| Trusted service execution path works | **FAILED** | Executing the documented entry point while impersonating the actual `service_role` failed with PostgreSQL error `42501: permission denied for function sma`. The migration revokes execution on every helper from `PUBLIC`, `anon` and `authenticated`, but grants `service_role` only the outer `refresh_v1(uuid)` function. Because `refresh_v1` is `SECURITY INVOKER`, the caller also needs permission to execute the private helper functions. |

## Primary evidence inspected

### GitHub

- `automation/project-plan-auditor.md`
- `documentation/project-plan.md`
- `documentation/specifications/technical-calculation-specification.md`
- `documentation/pipelines/technical-indicator-pipeline.md`
- `documentation/README.md`
- `documentation/supabase-data-model.md`
- `supabase/migrations/20260821064000_implement_technical_indicators_v1.sql`
- `supabase/migrations/20260821070000_add_technical_indicator_interval_identity.sql`

### Supabase — project `glvbqcplgjdfgjyknzsa`

The audit independently inspected:

- Tiingo daily source coverage and quality;
- live indicator schema, unique constraint and persisted output;
- interval, indicator, status and version distributions;
- required JSON provenance fields;
- the deployed refresh function body;
- schema/function privileges for `anon`, `authenticated` and `service_role`;
- an independent daily/weekly NVDA formula calculation;
- targeted retry behaviour;
- the real service-role invocation path.

No Vercel or browser verification was required because TECH-002 changes the database calculation layer and does not claim a deployed frontend surface.

## Required remediation

1. Grant `service_role` execution permission on the private helper functions used by `technical_engine.refresh_v1`, or refactor the trusted entry point so its documented service-role call can execute without widening access to `anon` or `authenticated`.
2. Verify the real caller path explicitly with:
   - `SET LOCAL ROLE service_role`;
   - a targeted `technical_engine.refresh_v1(<instrument_uuid>)` call.
3. Re-run retry verification and confirm:
   - the targeted refresh succeeds;
   - row IDs remain stable;
   - the total `technical-engine-v1` row count remains 1,136 for the unchanged source snapshot;
   - duplicate deterministic keys remain zero.
4. Reconfirm that `anon` and `authenticated` retain no schema usage or execution permission.

The Builder must not redesign formulas or regenerate unrelated project work; the failed permission chain is the bounded remediation.

## Final project state

- `TECH-002` → `IN PROGRESS`
- no next item promoted
- `TECH-003` and later items remain `PLANNED`
