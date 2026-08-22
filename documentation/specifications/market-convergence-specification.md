# Market Convergence Specification

**Methodology version:** `market-convergence-v1`  
**Project-plan item:** CONV-001  
**System:** Short-term Market Assessment  
**Supabase project:** `glvbqcplgjdfgjyknzsa`

## Purpose

Market Convergence combines two already-completed, analytically independent views of the same tracked instrument:

1. the deterministic Technical Engine market score; and
2. the independent ChatGPT Market Assessment.

It answers **how strongly the two branches jointly support or oppose current attractiveness**. It does not recalculate either branch and it does not use Opportunity Assessment output.

The canonical output relation is `public.market_convergence_assessments`. CONV-001 defines the calculation contract only. Population, scheduling, history/retry behaviour and frontend presentation belong to later project-plan items.

## Independence boundary

Convergence may read the completed outputs only after each branch has formed its conclusion independently.

Permitted Technical input:

- `public.market_scores` with `methodology_version = 'technical-score-v1'`;
- `overall_score`, `confidence_score`, `score_status`, `score_date` and source row ID.

Permitted AI input:

- `public.gpt_market_assessments` with `methodology_version = 'independent-market-ai-v1'`;
- `technical_engine_input_used = false`;
- `score`, `confidence`, `rating`, `assessment_date` and source assessment ID.

Prohibited inputs:

- Technical indicators or raw observations used to second-guess the Technical score;
- AI evidence, prose or model output used to recalculate the AI score;
- prior Market Convergence scores or labels;
- Opportunity Assessment, Structural Opportunity or Technology Inflection output;
- any manual override that changes one branch before combination.

The convergence process is downstream. It must never write back into either source branch.

## Output identity and lineage

A result is uniquely identified by:

```text
(instrument_id, assessment_date, methodology_version)
```

For `market-convergence-v1`:

- `assessment_date` is the later of the selected Technical `score_date` and AI `assessment_date`;
- `technical_score_id` and `ai_assessment_id` must reference the exact selected source rows;
- the source scores, signals and confidence values are snapshotted into the convergence row;
- source methodology versions are validated through the linked rows;
- rerunning the same identity updates that row rather than creating a duplicate.

The source IDs are mandatory for a calculated v1 result even though the scaffolded database columns currently permit null. A calculation with missing lineage is invalid.

## Eligible source selection

For each instrument, select the latest source row on or before the convergence run's cutoff timestamp.

A Technical row is eligible only when:

- `methodology_version = 'technical-score-v1'`;
- `overall_score` and `confidence_score` are present and within 0–100;
- `score_status` is `complete` or `partial`.

An AI row is eligible only when:

- `methodology_version = 'independent-market-ai-v1'`;
- `technical_engine_input_used = false`;
- `score` and `confidence` are present and within 0–100;
- `rating` is one of `Strong Buy`, `Buy`, `Hold`, `Sell`, or `Strong Sell`.

If either eligible branch is missing, do not create a calculated convergence row. Never substitute 50, copy the available branch, or fabricate confidence.

A partial Technical score remains eligible because its `confidence_score` already measures input coverage. The convergence calculation must not add a second arbitrary partial-data penalty.

## History, cutoff and source freshness

CONV-003 completes the v1 history and retry contract without changing the calculation:

- every run has an immutable cutoff timestamp;
- the logical assessment date is the cutoff converted to `America/New_York`, matching the AI Market assessment date boundary;
- source rows must have both a source date on or before the logical date and a calculation/creation timestamp on or before the cutoff;
- source selection retains the deterministic date, timestamp and stable-ID ordering above;
- both selected source dates must be between zero and four calendar days old at the logical date;
- four calendar days deliberately spans an ordinary Friday-to-Monday weekend without requiring an incomplete exchange-holiday calendar;
- if either selected branch is older than four calendar days, the pair is recorded as stale in `public.market_convergence_runs` and no result is inserted or changed;
- if either branch is missing, the instrument is recorded as missing input and no result is fabricated.

History is source-date history. The result identity remains `(instrument_id, assessment_date, methodology_version)`, where `assessment_date` is the later source date. A new source date creates a new historical row; a retry for the same source identity updates only a materially changed payload and otherwise changes zero rows. Calendar days with no new eligible source pair do not create duplicate snapshot rows.

Retries inherit the original cutoff, logical date and instrument scope. They are limited to three total attempts and require a failed parent. Retry lineage is linear: a failed run may have at most one direct retry child regardless of that child's terminal status, every subsequent retry targets the latest failed leaf, and attempts advance exactly `1 -> 2 -> 3`. An ancestor that already has any child cannot be retried, and attempt 3 cannot be retried. The one-child rule is enforced both in `run_v1` and by a unique partial index on non-null `retry_of_run_id`. A freshness decision is therefore stable across retries.

The canonical score, confidence, precedence, labels and summary remain unchanged. A formula-changing freshness adjustment requires a new methodology version.

## Normalised source signals

Snapshot the AI signal from its persisted `rating`, preserving the five allowed values.

Derive the Technical signal from `overall_score`:

| Technical score | Technical signal |
|---:|---|
| 80–100 | `Strong Buy` |
| 60–<80 | `Buy` |
| 40–<60 | `Hold` |
| 20–<40 | `Sell` |
| 0–<20 | `Strong Sell` |

For disagreement classification, map signals to ordinals:

| Signal | Ordinal |
|---|---:|
| `Strong Sell` | -2 |
| `Sell` | -1 |
| `Hold` | 0 |
| `Buy` | 1 |
| `Strong Buy` | 2 |

## Convergence score

Let:

- `T` = Technical `overall_score`;
- `A` = AI `score`.

Both are on the same bounded 0–100 attractiveness scale. Each independent branch receives equal weight:

```text
convergence_score = round((T + A) / 2, 2)
```

Confidence does not change the score. It describes how much trust to place in that combined score. This prevents a high-confidence branch from erasing the other branch's independently formed view.

## Disagreement

Calculate the numeric gap:

```text
disagreement_gap = abs(T - A)
```

Classify disagreement in this precedence order:

1. **Conflict** — both signal ordinals are non-zero and have opposite signs.
2. **Mixed** — not Conflict and `disagreement_gap >= 25`.
3. **Aligned** — not Conflict or Mixed and `disagreement_gap < 10`.
4. **Mild disagreement** — every remaining case.

Conflict therefore captures opposite directional conclusions. Mixed captures a material magnitude gap that does not cross into opposite directional conclusions. Neither condition is hidden by the arithmetic mean.

## Convergence confidence

Let:

- `CT` = Technical `confidence_score`;
- `CA` = AI `confidence`;
- `D` = `disagreement_gap`.

First combine the two input confidences using their geometric mean. This makes a weak source constrain the result:

```text
input_confidence = sqrt(CT * CA)
agreement_factor = 1 - (D / 200)
raw_convergence_confidence = input_confidence * agreement_factor
```

Because `D` is bounded to 0–100, `agreement_factor` is bounded to 0.50–1.00.

Apply the disagreement cap:

| Disagreement class | Confidence cap |
|---|---:|
| Conflict | 40 |
| Mixed | 60 |
| Aligned or mild disagreement | 100 |

```text
convergence_confidence =
  round(min(raw_convergence_confidence, disagreement_cap), 2)
```

The result is clamped to 0–100 before persistence. Convergence confidence is methodology confidence, not a probability of future return.

## Convergence labels

Conflict and material disagreement override the directional score label:

1. If disagreement class is Conflict, `convergence_label = 'conflict'`.
2. Else if disagreement class is Mixed, `convergence_label = 'mixed'`.
3. Otherwise label the convergence score:

| Convergence score | Label |
|---:|---|
| 85–100 | `very_strong_bullish` |
| 70–<85 | `strong_bullish` |
| 60–<70 | `moderate_bullish` |
| 40–<60 | `neutral` |
| 30–<40 | `moderate_bearish` |
| 15–<30 | `strong_bearish` |
| 0–<15 | `very_strong_bearish` |

This mapping uses only labels already permitted by the live table constraint.

## Summary contract

The persisted `summary` must be deterministic, concise and auditable. It must state:

- Technical signal, score and confidence;
- AI signal, score and confidence;
- convergence score and confidence;
- disagreement class and numeric gap;
- both source dates;
- both source methodology versions;
- that Market Convergence is not Opportunity Assessment and is not investment advice.

The summary must not invent narrative evidence, catalysts or risks. Those remain in the independent source records.

## Worked examples

### Aligned bullish

```text
T = 78, CT = 100, Technical signal = Buy
A = 72, CA = 81, AI signal = Buy
D = 6
score = 75
raw confidence = sqrt(100 * 81) * (1 - 6/200) = 87.30
label = strong_bullish
```

### Material but non-opposite disagreement

```text
T = 82, CT = 100, Technical signal = Strong Buy
A = 55, CA = 64, AI signal = Hold
D = 27
score = 68.50
raw confidence = sqrt(100 * 64) * (1 - 27/200) = 69.20
mixed cap = 60
label = mixed
confidence = 60
```

### Opposite directional conclusions

```text
T = 28, CT = 90, Technical signal = Sell
A = 74, CA = 81, AI signal = Buy
D = 46
score = 51
raw confidence = sqrt(90 * 81) * (1 - 46/200) = 65.74
conflict cap = 40
label = conflict
confidence = 40
```

## Persistence mapping

| Convergence column | v1 source/calculation |
|---|---|
| `instrument_id` | shared source instrument |
| `assessment_date` | later source date |
| `technical_score_id` | selected `market_scores.id` |
| `ai_assessment_id` | selected `gpt_market_assessments.assessment_id` |
| `technical_score` | `market_scores.overall_score` |
| `technical_signal` | derived Technical five-level signal |
| `technical_confidence` | `market_scores.confidence_score` |
| `ai_score` | `gpt_market_assessments.score` |
| `ai_signal` | `gpt_market_assessments.rating` |
| `ai_confidence` | `gpt_market_assessments.confidence` |
| `convergence_score` | equal-weight formula |
| `convergence_confidence` | geometric input confidence, agreement factor and cap |
| `convergence_label` | disagreement override or score band |
| `summary` | deterministic audit summary |
| `methodology_version` | `market-convergence-v1` |

All numeric outputs are rounded to two decimal places.

## Versioning

`market-convergence-v1` is immutable once production rows are written.

A new methodology version is required for any change to:

- source methodology eligibility;
- Technical signal thresholds;
- branch weights;
- score formula;
- confidence formula or caps;
- disagreement rules;
- directional label bands;
- rounding precision.

Documentation-only clarifications that do not change an output for any valid input may retain v1.

## Implementation and audit gates

CONV-002 must implement this contract without populating inputs that fail eligibility and must verify exact calculations against live source rows.

CONV-003 implements idempotent source-date history, immutable-cutoff retries and explicit stale-input handling without altering v1 calculations.

The independent Auditor should verify:

1. the implementation reads only permitted completed branch outputs;
2. source IDs and snapshots agree;
3. formulas, precedence, rounding and labels reproduce independently;
4. missing inputs do not create fabricated rows;
5. versioned retries preserve the unique identity;
6. Opportunity outputs are absent from dependencies.

## Live design evidence

At CONV-001 design time, live Supabase showed:

- `market_convergence_assessments` was empty;
- RLS was enabled with read-only dashboard access for `anon` and `authenticated`;
- the table already constrained every score/confidence to 0–100;
- the label constraint matched the nine labels defined above;
- the unique identity was `(instrument_id, assessment_date, methodology_version)`;
- 71 `technical-score-v1` rows existed, including explicit complete and partial states;
- 120 AI assessment rows explicitly recorded `technical_engine_input_used = false`;
- 30 instruments had both an independently identified AI result and a Technical score.

No convergence rows were created as part of CONV-001.

A read-only v1 dry run over the 30 instruments with both eligible branches produced:

- 30 bounded convergence scores and 30 bounded confidence values;
- zero invalid labels against the live constraint;
- 14 aligned, 10 mild-disagreement, 3 mixed and 3 conflict classifications;
- a 31.48–79.78 score range and a 40.00–92.25 confidence range;
- no inserts, updates or deletes.

This dry run verifies that every formula branch maps into the existing schema. It is design evidence only, not proof of the later CONV-002 implementation.
