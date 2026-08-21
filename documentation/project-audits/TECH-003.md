# TECH-003 — Implement technical market scoring

## Review — 21 August 2026, 16:57 AWST

- **Status at review start:** IN REVIEW
- **Decision:** PASS WITH ADVICE
- **Final status:** DONE
- **Next promoted task:** TECH-004 — Add scheduler and monitoring

## Definition of Done

| Requirement | Verdict | Independent evidence |
|---|---|---|
| Reproducible component scores persist in `market_scores` | VERIFIED | Live Supabase contains momentum, trend, volatility and volume components for 71 instruments. Independent SQL recalculated all 71 trend, momentum, volatility and source-derived volume results with zero mismatches. |
| Reproducible overall score persists | VERIFIED | Independent weighted recomputation matched all 71 persisted `overall_score` values. |
| Confidence persists and reflects input availability | VERIFIED | Independent availability-weight recomputation matched all 71 `confidence_score` values; 61 rows are complete and 10 are explicit partial results. |
| Methodology and technical-input versions persist | VERIFIED | All 71 rows use `technical-score-v1` and `technical-engine-v1`; the live schema requires non-empty versions and the deterministic identity includes `methodology_version`. |
| Real results are versioned and constrained | VERIFIED | 71 rows span 71 instruments, every component/overall/confidence value is within 0–100, all rows contain the required reproducibility metadata and there are zero duplicate identities. |
| Missing-data behaviour is deterministic | VERIFIED | Direct Tiingo history checks matched every volume result. GFUZ correctly retains a null volume component with 28 valid periods; no neutral or fabricated value is substituted. Status recomputation produced zero mismatches. |

## GitHub evidence inspected

- `automation/project-plan-auditor.md`
- `documentation/project-plan.md`
- `supabase/migrations/20260821083000_implement_technical_market_scores_v1.sql`
- `documentation/specifications/technical-market-scoring-specification.md`
- `documentation/pipelines/technical-market-scoring-pipeline.md`
- `documentation/specifications/technical-calculation-specification.md`
- `documentation/supabase-data-model.md`
- `documentation/assessment-system-overview.md`
- `documentation/README.md`

The migration implements the documented trend, momentum, volatility, volume, overall and confidence rules. The scorer reads only versioned Technical Engine indicators and canonical market observations. Static inspection of the live function found no GPT, Opportunity Assessment, Market Assessment or convergence reference.

## Supabase evidence

Project: `glvbqcplgjdfgjyknzsa`.

### Live schema and data

- Migration history contains `implement_technical_market_scores_v1`.
- `market_scores` identity: `(instrument_id, score_date, methodology_version)`.
- Component, overall and confidence range constraints: 0–100.
- Status constraint: `complete`, `partial` or `insufficient_input`.
- Persisted rows/instruments: 71/71.
- Complete/partial/insufficient: 61/10/0.
- Wrong scoring versions: 0.
- Wrong indicator versions: 0.
- Rows with required metadata: 71.
- Duplicate identities: 0.

### Independent calculations

Independent SQL used current `technical-engine-v1` rows, referenced market observations and deduplicated Tiingo volume history rather than trusting Builder totals:

- trend mismatches: 0/71;
- momentum mismatches: 0/71;
- volatility mismatches: 0/71;
- volume mismatches: 0/71;
- overall mismatches: 0/71;
- confidence mismatches: 0/71;
- status mismatches: 0/71;
- score-date/source-instrument mismatches: 0.

### Execution, retry and access

- Real `SET LOCAL ROLE service_role` NVDA refresh: one instrument, one successful upsert, `technical-score-v1`.
- Transactional full retry: all 71 row IDs stable, zero deterministic payload changes and zero duplicate identities.
- Function is `SECURITY INVOKER` with fixed `pg_catalog` search path.
- Function execution: `service_role` allowed; `public`, `anon` and `authenticated` denied.
- `market_scores` has RLS enabled. Its only client policy is authenticated SELECT; an authenticated update probe affected zero rows.
- Current security and performance advisors contain no `market_scores` finding.

Vercel and browser evidence were not required because TECH-003's Definition of Done is a database scoring/persistence requirement and no frontend behaviour changed.

## Advice

For stronger historical replay without consulting mutable upstream rows, extend `score_details` in a future compatible methodology revision to include:

- the selected indicator row identities and numeric SMA/EMA values used by the trend component;
- the valid-volume-period count used to distinguish a 40-period volume score from a partial window.

The current scorer remains deterministic and independently reproducible from the versioned indicator rows and canonical source observations, so this advice is non-blocking.

## Decision

**PASS WITH ADVICE.** Every material TECH-003 Definition of Done requirement is independently verified. TECH-003 may move to DONE and TECH-004 may be promoted to NEXT.
