# TECH-005 Audit

## Review — 22 August 2026, 09:52 AWST

- **Task:** TECH-005 — Verify Technical Engine independence
- **Starting status:** IN REVIEW
- **Decision:** **PASS**
- **Final status:** DONE
- **Next task:** CONV-001 — Finalise Market Convergence methodology

## Definition of Done

| Check | Result | Independent evidence |
|---|---|---|
| Indicator engine uses market inputs only | **VERIFIED** | Fresh GitHub source and every live `technical_engine` function definition were inspected. `refresh_v1(uuid)` references only `data_providers`, `market_observations` and `technical_indicators`; its calculation helpers are table-free. |
| Technical scoring uses market/indicator inputs only | **VERIFIED** | `refresh_scores_v1(uuid)` references only `data_providers`, `market_observations`, `technical_indicators` and `market_scores`. |
| Orchestration introduces no analytical cross-dependency | **VERIFIED** | `run_v1(text, uuid)` and `retry_latest_failed_v1()` reference only `technical_engine_runs` and invoke the verified refresh functions. |
| Engine does not read GPT Market conclusions | **VERIFIED** | All nine live Technical Engine function definitions contain zero references to `gpt_market_assessments`, `gpt_market_runs` or `gpt_market_evidence`. The current implementation migrations contain zero such references. |
| Engine does not read Opportunity or convergence output | **VERIFIED** | All live definitions and implementation migrations contain zero references to Market Convergence, Opportunity Assessment, Structural Opportunity Signal or Technology Inflection Signal relations. |
| No hidden relational path introduces conclusions | **VERIFIED** | There are no non-internal triggers on `technical_indicators` or `market_scores`. Their only foreign keys target `instruments` and `market_observations`. |
| Persisted output records market/indicator provenance only | **VERIFIED** | 1,136 indicators across 71 instruments use `technical-engine-v1` and Tiingo provenance; 71 scores use `technical-score-v1` and `technical-engine-v1`. Zero indicator or score payloads contain GPT, Opportunity, convergence, rating, Buy or Sell metadata. |
| Changing a GPT conclusion does not change Technical output | **VERIFIED** | An Auditor-owned rollback-only test changed a real ADA/USD GPT conclusion from `Hold / 56 / 68` to `Sell / 1 / 1`, executed both refresh functions as `service_role`, and produced identical timestamp-excluded indicator and score digests. |

## Independent dynamic test

The Auditor deliberately used a different instrument from the Builder's recorded probe.

- **Instrument:** ADA/USD
- **Instrument ID:** `8c68c592-81c1-4195-aaef-b20aa80c3d02`
- **GPT assessment ID:** `e2a0f614-5de4-402b-873e-5a6a1b13694c`
- **Original conclusion:** Hold, score 56, confidence 68
- **Temporary conclusion:** Sell, score 1, confidence 1
- **Isolation:** `REPEATABLE READ`
- **Execution role:** `service_role`

| Evidence | Before | After | Result |
|---|---|---|---|
| Indicator digest | `1027bd933d4aeae8f95eff4afe59938a` | `1027bd933d4aeae8f95eff4afe59938a` | **UNCHANGED** |
| Score digest | `5c37c2daa9aabfa6afbd644521ff1bdd` | `5c37c2daa9aabfa6afbd644521ff1bdd` | **UNCHANGED** |

The transaction was rolled back. A separate post-test query confirmed the original `Hold / 56 / 68` conclusion, 16 indicator rows and one score row remained, and no probe text persisted.

## Primary evidence

### GitHub

- `automation/project-plan-auditor.md` — blob `50e4ca1d2b7f57505e98418322e6d831b062dfd0`
- `documentation/project-plan.md` — starting blob `d34d46484981af805a6d6db89ceb4ee7c2b9e4bf`
- `supabase/migrations/20260821064000_implement_technical_indicators_v1.sql` — blob `b61ec86917a76f27f32f0596b147cf0619d44232`
- `supabase/migrations/20260821070000_add_technical_indicator_interval_identity.sql` — blob `359ed1077d272303eb282b73394608c616c5c557`
- `supabase/migrations/20260821073000_grant_technical_indicator_helper_execution.sql` — blob `aa6c7cd467abf72a58de576ee583e1dbab39aa48`
- `supabase/migrations/20260821083000_implement_technical_market_scores_v1.sql` — blob `6bd093ccf57e1c6c871d87e9f684e4a9e59565d7`
- `supabase/migrations/20260821095000_add_technical_engine_scheduler_monitoring.sql` — blob `6b2d6409a182a2450c4b5e18e3c349eb1215b526`
- `documentation/specifications/technical-calculation-specification.md` — blob `92f8807e13b2bd22c3e3f2a5b441080e7367dfb2`
- `documentation/specifications/technical-market-scoring-specification.md` — blob `1a1e6a98fc1fdd6f9e2e46f46239eceea2e4fa8d`
- `documentation/pipelines/technical-indicator-pipeline.md` — blob `a9fb2914c26b21c8163bb1289a9c3b18716f0f99`
- `documentation/pipelines/technical-market-scoring-pipeline.md` — blob `de0279c3ae337b306bf139fef73cf9dc6aa11714`
- `documentation/pipelines/technical-engine-independence.md` — blob `17b2c14a88f9bf058dcb277fc45ac3fb6eb2d537`
- `documentation/assessment-system-overview.md` — blob `78c22bbfc7030c57b60eddb38229fcac99f5263c`
- `documentation/README.md` — blob `d7b8e7bb8b7bc7eaa340dbcec78b10317994edaf`

### Supabase

- Project: `glvbqcplgjdfgjyknzsa`
- Nine live functions in private schema `technical_engine`
- Live relation-reference scan: no prohibited relations
- Result-table triggers: none
- Result-table foreign keys: only `instruments` and `market_observations`
- Persisted results: 1,136 indicators and 71 scores across 71 instruments
- Forbidden persisted metadata: zero rows
- Independent rollback-only ADA/USD contamination test: passed
- Post-test cleanup/restoration: verified

### Vercel / production

Not applicable to this Definition of Done. TECH-005 verifies the database calculation boundary and does not change or require a deployed UI behavior.

## Audit conclusion

The Technical Engine's source, live database definitions, relationships, persisted provenance and dynamic behavior all demonstrate that it uses market/indicator inputs only. Changing a real GPT Market conclusion did not change the Technical Engine output.

Every material Definition of Done requirement is **VERIFIED**.

**Decision: PASS.**
