# TECH-001 — Define technical calculation specification

## Independent audit — 21 August 2026

**Review date/time:** 21 August 2026, Australia/Perth  
**Project-plan status at review start:** `IN REVIEW`  
**Decision:** `PASS WITH ADVICE`

## Definition of Done checks

| Requirement | Verdict | Evidence |
|---|---|---|
| Indicators are documented | VERIFIED | `documentation/specifications/technical-calculation-specification.md` defines SMA-20/50/200, EMA-12/26, RSI-14, MACD and 20-return rolling volatility. |
| Intervals are documented | VERIFIED | Daily and weekly calculation intervals are defined; intraday is explicitly deferred. Weekly aggregation is deterministic. |
| History requirements are documented | VERIFIED | Exact first-eligible periods and valid-input counts are specified for every indicator and apply independently to daily and weekly series. |
| Exact formulas are documented | VERIFIED | SMA, EMA with SMA seeding, Wilder RSI, MACD with signal seeding/warm-up, and arithmetic-return annualised volatility are explicitly defined. |
| Versioning is documented | VERIFIED | `technical-engine-v1` is the required calculation methodology version and formula/parameter/smoothing/aggregation/missing-data changes require a new version. |
| Missing-data behaviour is documented | VERIFIED | Invalid inputs, gaps, insufficient history and data-quality failures are fail-closed and deterministic; no observations or indicator values are fabricated. |
| Independence boundary is preserved | VERIFIED | The Technical Engine is explicitly prohibited from consuming GPT Market Assessment, Opportunity Assessment, Technology Inflection or Market Convergence outputs. |

## Primary evidence inspected

### GitHub

- `automation/project-plan-auditor.md`
- `documentation/project-plan.md`
- `documentation/specifications/technical-calculation-specification.md`

### Supabase — project `glvbqcplgjdfgjyknzsa`

Live schema verification confirmed:

- `public.market_observations` contains the fields required by the specification, including `id`, `instrument_id`, `provider_id`, `interval_code`, `observed_at`, OHLC, `adjusted_close`, `volume` and `loaded_at`.
- `public.technical_indicators` remains scaffolded with zero rows and contains `instrument_id`, `observation_id`, `indicator_code`, `interval_code`, `calculated_at`, `value`, `values` and `calculation_version`.
- the unique observation key exists on `(instrument_id, provider_id, interval_code, observed_at)`.
- the unique technical-indicator identity exists on `(instrument_id, observation_id, indicator_code, calculation_version)`.
- current market history separates Tiingo `1day` data from Twelve Data `quote` data.
- Tiingo `1day` history currently has 89,805 rows, spans 15 August 2021 through 18 August 2026, and has no null `adjusted_close` values.

No Vercel or browser verification was required because TECH-001 is a methodology/documentation task and does not change deployed functionality.

## Auditor judgement

The Definition of Done is fully satisfied. The specification is substantially more precise than the project-plan minimum: it defines provider/interval selection, adjusted-price basis, deterministic ordering and deduplication, invalid-price handling, weekly aggregation, EMA seeding, Wilder RSI smoothing, MACD warm-up, volatility return type and annualisation, calculation timestamps, idempotent indicator identity and persistence metadata.

### Non-blocking advice

Add the new technical calculation specification to the repository's documentation navigation/index during a later documentation-maintenance change so it is easier to discover. This is not required by TECH-001's Definition of Done and does not block implementation.

## Final project state

- `TECH-001` → `DONE`
- `TECH-002 — Implement core technical indicators` → `NEXT`
- all later Technical Engine items remain `PLANNED`
