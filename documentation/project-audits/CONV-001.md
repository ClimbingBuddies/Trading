# CONV-001 — Project Plan Audit

## Review — 22 August 2026, 10:53 AWST

**Task:** CONV-001 — Finalise Market Convergence methodology  
**Project-plan status at review start:** `IN REVIEW`  
**Decision:** **PASS WITH ADVICE**

## Definition of Done

> Score, confidence, disagreement handling, labels and version are documented.

| Requirement | Verdict | Independent evidence |
|---|---|---|
| Convergence score | **VERIFIED** | `market-convergence-v1` defines `round((T + A) / 2, 2)`, keeps the two independent branches equally weighted and separates score from confidence. All worked-example and live-candidate scores reproduced independently. |
| Convergence confidence | **VERIFIED** | The specification defines the geometric mean of source confidences, the exact agreement factor `1 - D/200`, conflict/mixed caps and two-decimal rounding. Worked examples reproduced as 87.30, 60.00 and 40.00 after caps. |
| Disagreement handling | **VERIFIED** | Exact precedence is documented: opposite non-neutral signal directions are `conflict`; remaining gaps of at least 25 are `mixed`; gaps below 10 are aligned; the remainder is mild disagreement. Conflict/mixed override the directional label rather than disappearing into the average. |
| Labels | **VERIFIED** | The seven directional score bands plus `mixed` and `conflict` exactly match the nine values permitted by the live Supabase check constraint. |
| Methodology version | **VERIFIED** | `market-convergence-v1` is named, mapped to persistence, declared immutable after production use and includes explicit version-bump conditions. |
| Independent-input boundary | **VERIFIED** | Eligible inputs are limited to completed `technical-score-v1` output and `independent-market-ai-v1` rows with `technical_engine_input_used = false`; Opportunity output, prior convergence conclusions and source-branch recalculation are prohibited. |
| Missing input and lineage | **VERIFIED** | Missing branches may not be replaced with neutral/fabricated values. Exact Technical and AI source IDs are required by the methodology even though the scaffolded live columns remain nullable. |
| Documentation discoverability | **VERIFIED** | The specification is linked from the documentation index and the assessment-system overview. |

## Primary evidence inspected

### GitHub

- `documentation/specifications/market-convergence-specification.md` — blob `e18387a051b1dbb6ab0a6eba4f2ea7bda75da36c`
- `documentation/specifications/technical-market-scoring-specification.md` — blob `1a1e6a98fc1fdd6f9e2e46f46239eceea2e4fa8d`
- `automation/daily-market-assessment.md` — blob `06b39f10cd0e18d02c226fb8b29fccaec528a985`
- `documentation/assessment-system-overview.md` — blob `ae51f0aea487c81bf3f475b6d2544f617a5e7451`
- `documentation/README.md` — blob `d711c3103d8228f32bb719ccb13a8e7fd4a06699`
- `supabase/migrations/20260813_phase2_two_assessment_architecture.sql` — blob `44f8295bc5bd738472f4a632aa519be8305278c5`
- `documentation/project-plan.md` — review-start blob `a10adb2cd69ef11ed5f2775502ae689929cdf2f0`

No prior `documentation/project-audits/CONV-001.md` existed.

### Live Supabase

Project: `glvbqcplgjdfgjyknzsa`

The Auditor independently verified:

- `market_convergence_assessments` exists with RLS enabled and zero rows;
- `methodology_version` defaults to `market-convergence-v1`;
- the unique identity is `(instrument_id, assessment_date, methodology_version)`;
- score and confidence columns are constrained to 0–100;
- Technical and AI signal constraints accept the documented five signals;
- the convergence-label constraint accepts exactly the documented nine labels;
- foreign keys preserve Technical and AI source lineage;
- 71 current `technical-score-v1` rows satisfy the documented Technical eligibility rule;
- 90 current `independent-market-ai-v1` rows satisfy the documented independence and field eligibility rules;
- the latest eligible source selection provides both branches for 30 instruments;
- no duplicate independent AI rows currently exist for the same instrument/date/methodology;
- no convergence rows were written during this documentation audit.

## Independent calculation verification

The Auditor rebuilt the v1 calculations from current live source rows using an independently written read-only SQL expression.

Current 30-instrument result:

- score range: 31.48–79.78;
- confidence range: 40.00–92.25;
- disagreement classes: 14 aligned, 10 mild disagreement, 3 mixed and 3 conflict;
- labels: 12 neutral, 7 strong bullish, 4 moderate bullish, 3 mixed, 3 conflict and 1 moderate bearish;
- invalid bounded scores: 0;
- invalid bounded confidence values: 0;
- invalid schema labels: 0.

The Auditor also tested all score pairs from 0–100 against confidence pairs `0, 25, 50, 75, 100`: **255,025 cases**. There were zero out-of-range scores, zero out-of-range confidence values and zero invalid labels.

The three published worked examples independently reproduced:

| Example | Score | Raw confidence | Final confidence |
|---|---:|---:|---:|
| Aligned bullish | 75.00 | 87.30 | 87.30 |
| Material non-opposite disagreement | 68.50 | 69.20 | 60.00 |
| Opposite directional conclusions | 51.00 | 65.74 | 40.00 |

## Decision rationale

Every material condition in CONV-001's Definition of Done is documented precisely and is compatible with the live schema and the two independent source contracts. The methodology is deterministic for score, confidence, disagreement classification, label selection, rounding and versioning.

CONV-001 therefore passes with non-blocking advice.

## Non-blocking advice

When CONV-002 implements source selection, make the tie-break order explicit in code—recommended ordering is source date descending, calculation/creation timestamp descending, then stable source ID descending. The current live AI dataset has no same-date/methodology duplicates, so this does not block CONV-001, but explicit ordering will protect deterministic selection if a future same-date rerun creates more than one eligible source row.

CONV-002 should also enforce the methodology's mandatory non-null lineage at the trusted write function even though the scaffolded table columns currently allow null.

## Resulting project state

- CONV-001: `DONE`
- CONV-002 — Populate `market_convergence_assessments`: `NEXT`
- CONV-003 and later work remain `PLANNED`
