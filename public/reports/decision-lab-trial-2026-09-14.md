# Decision Lab trial review — 14 September 2026

## Result
The manual trial executed price recovery, the decision eligibility check and the live outcome evaluator. No AI decision was eligible for publication. This was not a completed research-to-decision run and does not establish trading performance.

## Verified price recovery
Canonical Tiingo daily history was refreshed using the deployed backfill-market-history function (one-year request, existing older history retained).

| Instrument | Latest daily bar | Total daily rows | New rows |
| --- | --- | ---: | ---: |
| AVGO | 11 September 2026 | 1,274 | 5 |
| BEAM | 11 September 2026 | 1,259 | 5 |
| FIG | 11 September 2026 | 281 | 5 |
| MRVL | 11 September 2026 | 1,259 | 5 |
| QQQ benchmark | 11 September 2026 | 1,274 | 5 |

All five requests returned success. Verification found zero duplicate dates and zero rows with nonpositive closes or high below low. The 25 new rows retain Tiingo provenance.

## Decision and outcome review
At 14:14 Perth on 14 September:
- Six watched shares were detected by private.decision_candidates_v3().
- All six remained blocked by fresh-assessment eligibility.
- Original plans: 0. Decision events: 0. Outcomes: 0.
- private.evaluate_decisions_v3() completed and returned 0.
- AVGO's latest assessment was dated 10 September. BEAM, FIG, MRVL, WA1 and 1AI had no qualifying assessment.
- WA1 and 1AI additionally lacked provider mappings and price coverage. AUD benchmark support remains unresolved; USD QQQ must not be substituted.
- Refreshed prices cannot be backdated into an older assessment's frozen evidence.

## Tests
The isolated scripts/test-decision-journal.mjs suite passed on 14 September. It covers immutable original calls and outcomes, linked AI updates, personal-note isolation and idempotency, ownership and anonymous permissions, signal-based exits, checkpoints without forced sales, REDUCE as advisory, and corrected-price handling. These synthetic tests did not insert live predictions.

## Scheduled trial
A separate temporary Codex task follow-up, Decision Lab three-week trial, was created for daily 10:00 Australia/Perth checks through 5 October 2026, with weekly and final reviews. It coordinates with the existing Daily Trading Controller; it does not replace that controller or the 15-minute database evaluator. Creation was confirmed; unattended execution remains to be verified.

The next expected research window is Tuesday 15 September Perth morning after Monday's US session. The follow-up should refresh coverage again when needed, inspect actual completed research, publish only eligible prospective calls, and report verified output or precise blockers. First publication and later outcome measurement remain outstanding.

## Interpretation
The watchlist queue works and the price-refresh path works. The full automated assessment-to-decision flow has not yet produced a live record. No win rate, return or market-beating claim is available.
