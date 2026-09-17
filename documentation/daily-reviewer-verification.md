# Redesign verification — 17 September 2026

Scope: controller instructions and a read-only operational preflight. No live schedule or Decision Lab publication function was changed.

- PASS: preflight executes against Supabase project `glvbqcplgjdfgjyknzsa` without a SQL error.
- PASS: the result contains 59 instruments and 59 distinct instrument IDs; no duplicate universe rows.
- PASS: the result identifies all 15 ASX instruments and all six pending personal decision candidates.
- PASS: rerunning the diagnostic is read-only; it does not publish, alter or backdate decisions.
- FAIL (existing pipeline): all 15 ASX instruments lack an active Yahoo provider mapping, despite having stored Yahoo history.
- FAIL (existing pipeline): zero of six pending personal candidates currently passes the publication input checks. Five lack an eligible assessment; AVGO reports stale daily price evidence.
- UNVERIFIED: expected-session/calendar validation, complete source-evidence coverage, immutable-outcome replay, and UI reconciliation. This diagnostic deliberately does not mark those as passed.
- NOT DEPLOYED: the redesigned instructions have not been merged into the live GitHub controller specification or confirmed in the main scheduled task.

All 59 instruments have at least 20 positive, same-currency daily observations under the diagnostic's selected provider. That does not prove freshness, uninterrupted coverage, exchange identity, or publication readiness.

