# Technical Engine Independence Verification

**Project-plan item:** TECH-005  
**Builder verification date:** 22 August 2026, 09:25 AWST  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Status:** Builder verification complete; awaiting independent Auditor review

## Purpose

This record defines and verifies the analytical input boundary for the independent Technical Engine. It demonstrates that `technical-engine-v1` indicators and `technical-score-v1` market scores use market and indicator inputs only, without reading or reacting to ChatGPT Market conclusions, Opportunity Assessment output or Market Convergence output.

This is Builder pre-flight evidence. The Project Plan Auditor must independently decide whether TECH-005 passes.

## Required boundary

### Permitted analytical inputs

| Engine stage | Permitted inputs |
|---|---|
| Indicator calculation | Canonical Tiingo `1day` rows in `public.market_observations`, provider identity in `public.data_providers`, and deterministic calculation parameters |
| Technical scoring | Versioned rows in `public.technical_indicators` plus canonical Tiingo market observations used for volume evidence |
| Orchestration | `public.technical_engine_runs` for lifecycle, attempt and telemetry state |

The engine may write only its own result and run-telemetry tables:

- `public.technical_indicators`
- `public.market_scores`
- `public.technical_engine_runs`

### Prohibited analytical inputs

The engine must not read or derive output from:

- `public.gpt_market_assessments`
- `public.gpt_market_runs`
- `public.gpt_market_evidence`
- `public.market_convergence_assessments`
- `public.opportunity_assessments`
- `public.structural_opportunity_signals`
- `public.technology_inflection_signals`
- AI ratings, conclusions, bull/bear cases or evidence summaries
- Opportunity scores, exposure scores or convergence labels

Displaying independently completed outputs together is allowed. Using one branch's conclusion to form another branch's score is not.

## Source verification

The following GitHub implementation was inspected:

| Source | Blob | Boundary confirmed |
|---|---|---|
| `supabase/migrations/20260821064000_implement_technical_indicators_v1.sql` | `b61ec86917a76f27f32f0596b147cf0619d44232` | Reads Tiingo observations/provider identity and writes technical indicators |
| `supabase/migrations/20260821083000_implement_technical_market_scores_v1.sql` | `6bd093ccf57e1c6c871d87e9f684e4a9e59565d7` | Reads technical indicators and Tiingo observations and writes technical scores |
| `supabase/migrations/20260821095000_add_technical_engine_scheduler_monitoring.sql` | `6b2d6409a182a2450c4b5e18e3c349eb1215b526` | Coordinates the two engine stages and records run telemetry |
| `documentation/specifications/technical-calculation-specification.md` | current `main` | Defines deterministic market-observation inputs and the AI-independence rule |
| `documentation/specifications/technical-market-scoring-specification.md` | current `main` | Defines indicator/volume inputs and prohibits AI, Opportunity and convergence inputs |
| `documentation/assessment-system-overview.md` | current `main` | Defines the independent Technical and ChatGPT branches before Market Convergence |

No Technical Engine migration contains a reference to a GPT Market, Opportunity Assessment or Market Convergence relation.

## Live PostgreSQL verification

The live `technical_engine` schema contained these nine functions:

- `sma`
- `ema`
- `rsi_wilder`
- `macd`
- `annualised_volatility`
- `refresh_v1`
- `refresh_scores_v1`
- `run_v1`
- `retry_latest_failed_v1`

The live definitions were scanned for relation references.

| Function | Live relation references |
|---|---|
| `refresh_v1(uuid)` | `data_providers`, `market_observations`, `technical_indicators` |
| `refresh_scores_v1(uuid)` | `data_providers`, `market_observations`, `technical_indicators`, `market_scores` |
| `run_v1(text, uuid)` | `technical_engine_runs` plus calls to the two refresh functions |
| `retry_latest_failed_v1()` | `technical_engine_runs` plus a call to `run_v1` |
| Pure calculation helpers | No table references |

Across all nine live definitions:

- GPT Market relation references: **0**
- Market Convergence relation references: **0**
- Opportunity Assessment relation references: **0**

There are no non-internal triggers on `public.technical_indicators` or `public.market_scores` that could introduce a hidden cross-system dependency.

The only foreign keys on the result tables are:

- `technical_indicators.instrument_id -> instruments.id`
- `technical_indicators.observation_id -> market_observations.id`
- `market_scores.instrument_id -> instruments.id`

There are no foreign keys to GPT Market, Opportunity or convergence tables.

## Persisted-output verification

Live persisted output at Builder verification time:

| Output | Evidence |
|---|---|
| Technical indicators | 1,136 rows across 71 instruments; only `technical-engine-v1`; source provider `tiingo`; source interval `1day` |
| Technical scores | 71 rows across 71 instruments; only `technical-score-v1`; technical calculation version `technical-engine-v1` |
| Forbidden metadata scan | 0 indicator payloads and 0 score-detail payloads contain GPT, ChatGPT, Opportunity, convergence, rating, Buy or Sell metadata |

## Rollback-only contamination test

A dynamic test was run against a real instrument with both AI and Technical results:

- instrument: `XRP/USD`
- instrument ID: `5cc3abf2-532c-4bc6-9a05-44b3e95d54ca`
- GPT assessment ID: `ad2afe2f-f6a2-4825-8356-bf48ddea1f87`
- original GPT conclusion: `Hold`, score `58`, confidence `66`

Inside one `REPEATABLE READ` transaction:

1. Indicator and score payload digests were recorded, excluding audit timestamps.
2. The GPT conclusion was changed to `Sell`, score `1`, confidence `1`.
3. `technical_engine.refresh_v1(uuid)` was executed as `service_role`.
4. `technical_engine.refresh_scores_v1(uuid)` was executed as `service_role`.
5. The Technical Engine payloads were compared with the pre-change payloads.
6. The transaction was rolled back.

Results:

| Evidence | Before | After | Result |
|---|---|---|---|
| Indicator payload digest | `e11048a57bbfddeeed9da7e4597f0b4e` | `e11048a57bbfddeeed9da7e4597f0b4e` | **UNCHANGED** |
| Score payload digest | `e5bf4a2f15796e4d313413c7b9b92aca` | `e5bf4a2f15796e4d313413c7b9b92aca` | **UNCHANGED** |

A post-test query confirmed the rollback restored the original `Hold / 58 / 66` assessment and no probe summary persisted.

This test shows that changing a GPT Market conclusion does not alter indicator or technical-score output when the market/indicator inputs are unchanged.

## Repeatable audit checks

An independent review should verify all of the following:

1. Fetch the current Technical Engine migrations and inspect every relation read by `refresh_v1`, `refresh_scores_v1`, `run_v1` and `retry_latest_failed_v1`.
2. Inspect the live function definitions rather than relying only on migration text.
3. Confirm there are no hidden triggers or foreign keys from Technical Engine result tables into GPT, Opportunity or convergence data.
4. Confirm persisted payloads carry market/indicator provenance and versioning but no AI or Opportunity conclusions.
5. Repeat a rollback-only contamination test with an existing GPT assessment and compare timestamp-excluded Technical Engine payloads.
6. Confirm the test transaction was rolled back and no fixture or altered conclusion remains.

## Builder conclusion

All inspected source, live database definitions, relationships, persisted metadata and dynamic behavior conform to the required independence boundary.

**Builder verification: SATISFIED — hand off TECH-005 to the independent Auditor.**
