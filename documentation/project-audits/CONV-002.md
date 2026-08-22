# Project Audit — CONV-002

## Review — 22 August 2026, 11:50 AWST

- **Task:** CONV-002 — Populate `market_convergence_assessments`
- **Project-plan status at review start:** `IN REVIEW`
- **Decision:** **PASS WITH ADVICE**
- **Final project-plan status:** `DONE`
- **Next promoted task:** CONV-003 — Add convergence history and retry rules

## Definition of Done

> Independent Technical and AI Market results combine into persisted convergence rows.

| Check | Verdict | Independent evidence |
|---|---|---|
| Trusted implementation exists in GitHub and live Supabase | **VERIFIED** | GitHub contains `20260822033000_implement_market_convergence_v1.sql`; live migration history contains `20260822032833 implement_market_convergence_v1`; live function `market_convergence.refresh_v1(uuid)` exists. |
| Only eligible independent Technical and AI Market results are combined | **VERIFIED** | Independent live selection found 71 eligible Technical instruments, 30 eligible AI instruments and 30 eligible pairs. The function requires `technical-score-v1`, `independent-market-ai-v1` and `technical_engine_input_used is false`. |
| Real convergence rows are persisted for every eligible pair | **VERIFIED** | 30 eligible pairs produced 30 `market-convergence-v1` rows across 30 distinct instruments, with zero missing and zero unexpected rows. |
| Missing branches do not produce fabricated convergence | **VERIFIED** | 41 Technical-only instruments had zero convergence rows; no neutral/default branch values were fabricated. |
| Source selection is deterministic | **VERIFIED** | Live function orders Technical sources by `score_date desc, calculated_at desc, id desc` and AI sources by `assessment_date desc, created_at desc, assessment_id desc`. Independent recomputation found zero Technical or AI source-ID mismatches. |
| Assessment identity and source lineage are complete | **VERIFIED** | Zero missing `technical_score_id` or `ai_assessment_id` values; both foreign keys exist; `market_convergence_v1_complete_chk` rejects incomplete v1 rows; the unique identity is `(instrument_id, assessment_date, methodology_version)`. |
| Source snapshots and assessment date are correct | **VERIFIED** | Independent comparison found zero snapshot mismatches and zero later-source-date mismatches across all 30 rows. |
| Score, confidence, disagreement precedence and labels match the canonical specification | **VERIFIED** | Auditor-owned SQL independently recalculated every result. There were zero score, confidence or label mismatches, including `conflict` before `mixed` precedence and the specified confidence caps. |
| Deterministic summaries contain the required provenance and disclaimer | **VERIFIED** | Independent reconstruction found zero summary mismatches across all 30 rows. |
| Persisted values remain within the allowed contract | **VERIFIED** | Zero missing outputs, out-of-range scores/confidence values, invalid labels or duplicate identity groups. |
| Trusted execution and client access are deliberate | **VERIFIED** | Function is `security invoker`, owned by `postgres`, and fixed to `search_path=pg_catalog`. Only `service_role` has private-schema usage and execution; `anon` and `authenticated` have table `SELECT` only and no insert/update/execute access. RLS remains enabled with the intended public read-only policy. |
| Retry is idempotent | **VERIFIED** | A fresh `SET LOCAL ROLE service_role` full refresh returned zero changed rows. Row count remained 30 and the complete identity/timestamp and calculation-payload hashes were unchanged. |
| Documentation reflects the implementation | **VERIFIED** | The canonical methodology, implementation migration, population pipeline, data model, assessment overview and documentation index were inspected and agree with the live current-state flow. |

## Primary evidence inspected

### GitHub

- `automation/project-plan-auditor.md` — blob `50e4ca1d2b7f57505e98418322e6d831b062dfd0`
- `documentation/project-plan.md` — starting blob `9a9502360cd572547d574b7841f6720767534ba4`
- `documentation/specifications/market-convergence-specification.md` — blob `e18387a051b1dbb6ab0a6eba4f2ea7bda75da36c`
- `supabase/migrations/20260822033000_implement_market_convergence_v1.sql` — blob `d4f0d8e5805b4f19b8c3cf874158e91482ea460d`
- `documentation/pipelines/market-convergence-pipeline.md` — blob `72c10f1fe7eeca3771d832abeb2a4da2b5573924`
- `documentation/project-audits/CONV-001.md` — prior advice retained and rechecked.

No prior `documentation/project-audits/CONV-002.md` existed.

### Live Supabase — `glvbqcplgjdfgjyknzsa`

- Migration history and live function definition.
- Function owner, security mode, fixed search path and ACLs.
- Destination table schema, constraints, foreign keys, unique identity, RLS and policies.
- All eligible Technical and AI source rows.
- All 30 persisted convergence rows.
- Auditor-owned source selection and complete formula reconstruction.
- Missing-branch behavior.
- Real `service_role` retry with before/after row, identity/timestamp and payload hashes.
- Current Supabase security and performance advisors.

### Vercel / browser

Not applicable to CONV-002. This task changes trusted persistence and documentation only; frontend presentation remains CONV-004.

## Independent result summary

- Eligible Technical instruments: **71**
- Eligible AI Market instruments: **30**
- Eligible pairs: **30**
- Persisted v1 rows: **30**
- Distinct instruments: **30**
- Technical-only instruments: **41**
- Missing/unexpected rows: **0 / 0**
- Source-ID mismatches: **0**
- Snapshot/date mismatches: **0**
- Score/confidence/label/summary mismatches: **0**
- Missing lineage/output: **0**
- Out-of-range or invalid-label rows: **0**
- Duplicate identity groups: **0**
- Unchanged trusted retry rows changed: **0**
- Before/after identity hash: `c29e9c571a9e73e5547302bb2031b171`
- Before/after payload hash: `fa80b5ad870dbebd1eeca5faa4ffabac`

## Non-blocking advice

Supabase's performance advisor reports that the `technical_score_id` and `ai_assessment_id` foreign keys on `market_convergence_assessments` do not yet have covering indexes. At 30 current rows this does not prevent correctness or satisfy any missing CONV-002 requirement. Reassess and add the indexes as history grows under CONV-003. See the [Supabase unindexed foreign-key advisor guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

The existing instrument/date index is currently reported unused, which is expected immediately after first population and is not a reason to remove it before history/query patterns develop.

## Decision

**PASS WITH ADVICE.**

Every material CONV-002 Definition of Done condition is independently verified from live primary evidence. CONV-002 may move to `DONE`, and CONV-003 is the single valid next task.
