# STRAT-001 — Define first real strategy

## Review — 24 August 2026, 15:20 AWST

**Project-plan status at review start:** `IN REVIEW`  
**Decision:** `PASS WITH ADVICE`

### Definition of Done

Project-plan requirement: **Rules, universe, entry/exit logic, risk and version are persisted.**

| Check | Verdict | Independent evidence |
|---|---|---|
| Strategy rules are persisted | VERIFIED | Live `public.trading_strategies` contains one `DAILY_TREND_PULLBACK` v1 row with structured `entry_rules`, `exit_rules`, `risk_rules`, `execution_rules` and `data_requirements`. |
| Universe is persisted and testable | VERIFIED | The live row stores a fixed 20-symbol 24-Aug-2026 USD equity/ETF snapshot. All 20 symbols resolve to active equity/ETF instruments; the least-covered symbol has 543 daily observations and the selected universe has no incomplete daily OHLC/adjusted-close rows. |
| Entry logic is deterministic | VERIFIED | The persisted contract requires SMA50 > SMA200, close > SMA200, RSI14 45–65, pullback/reclaim of SMA20, positive day-over-day close, next-session-open entry, a >3% gap-up skip and deterministic signal ranking. |
| Exit logic is deterministic | VERIFIED | The persisted contract defines 8% initial protective stop with gap handling, SMA50 trend exit, 60-session time exit and explicit exit precedence. |
| Risk rules are persisted | VERIFIED | 0.75% equity risk per trade, 10% notional cap, maximum four positions, 40% gross long exposure, 3% total initial open risk, no leverage, no shorting and no averaging down are stored in the live row. |
| Version is persisted | VERIFIED | `strategy_version = 1`, `methodology_version = strategy-definition-v1`, and live schema has unique `(owner_user_id, strategy_code, strategy_version)` identity. |
| Strategy is research/testing only | VERIFIED | `status = testing`, `live_execution_enabled = false`, and execution rules explicitly record live execution as unauthorised. |
| STRAT-002/STRAT-003 work has not been smuggled into this task | VERIFIED | The strategy has zero `trading_test_runs`; no backtest result or performance claim is presented as STRAT-001 evidence. |

### Primary evidence inspected

#### GitHub

- `automation/project-plan-auditor.md` v1.1 — fresh-read at start of audit.
- `documentation/project-plan.md` — fresh-read; STRAT-001 was the single `IN REVIEW` item.
- `documentation/specifications/daily-trend-pullback-strategy.md` — deterministic v1 strategy contract.
- `supabase/migrations/20260824151000_define_strategy_contract_v1.sql` — structured version/rules schema and version-identity index.
- `documentation/project-audits/STRAT-001.md` did not exist before this review.

#### Supabase production (`glvbqcplgjdfgjyknzsa`)

- Live migration history contains `define_strategy_contract_v1`.
- Exactly one `DAILY_TREND_PULLBACK` version-1 strategy row exists.
- Structured live row independently matches the documented universe, entry, exit, risk, execution and data requirements.
- Fixed universe contains 20 valid active USD equities/ETFs; minimum daily history is 543 rows.
- Required daily historical price fields are complete for the selected universe in the checked data set.
- No strategy row has `live_execution_enabled = true`.
- No test-run row exists for this strategy.
- Rollback-only real-role RLS check: the owner can read the strategy and a second permanent authenticated user cannot.

The first RLS test attempt failed only because the real `authenticated` role could not write the temporary audit-results table; that transaction rolled back. The same test was rerun with privileges granted only on the temporary harness table and passed. No production strategy data was changed by the RLS audit.

#### Vercel / production

- Reviewed implementation/documentation deployment `dpl_Gf8Tt62FYGxtMtztK2ESxCcLrWLa` is `READY` on commit `a3128f048369f9d386f9e25cc5dd73c964879acd`.
- Production `/strategies` returned HTTP 200.
- Signed-out production still shows zero private strategies. This is consistent with owner-only strategy RLS and the project plan: deliberate real-strategy frontend surfacing belongs to STRAT-005, not STRAT-001.

### Assessment

STRAT-001 defines a genuine first strategy rather than a placeholder. The strategy is deterministic enough for a later backtest to reproduce without inventing entry, exit, portfolio-allocation or execution assumptions. Its fixed-current-universe survivorship limitation and raw-OHLC versus adjusted-close corporate-action limitation are explicitly disclosed rather than hidden.

No evidence of profitability has been created or implied. That is appropriate: STRAT-002 defines the test-run ingestion/provenance format and STRAT-003 loads the first real test run.

### Non-blocking advice

STRAT-002 should make each test run persist an immutable snapshot or deterministic hash of the exact strategy definition used. The current owner policy allows the v1 strategy row to be edited in place; historical test provenance must therefore not rely only on rereading the mutable current row. Once test evidence exists, consider requiring rule changes to create a new `strategy_version` rather than silently mutating a tested version.

### Final state

**Audit decision:** `PASS WITH ADVICE`  
**Final project-plan status:** `DONE`  
**Next promoted task:** `STRAT-002 — Define test-run ingestion format`
