# MYDASH-007 audit record

## Current status

- Gate: `MYDASH-007`
- Status: `IN_PROGRESS`
- Current owner: `PRODUCER`
- Audit outcome: not yet submitted for independent audit
- Deployment: none; the migration is intentionally unapplied

## Producer evidence — return-ledger and entry-resolution foundation

The local candidate adds an immutable, owner-scoped return snapshot ledger matching the approved contract and a service-only deterministic entry resolver. Resolution requires exactly one active Tiingo provider mapping, uses only canonical `1day` observations, selects the first distinct session strictly after the persisted decision clock, and rejects future or pre-decision evaluation cutoffs. Missing mapping or session evidence remains `MAPPING_REQUIRED` or `PENDING_ENTRY`; numeric output remains null.

Security boundaries include permanent-owner SELECT RLS, anonymous denial, browser table-write denial, evaluator-only function execution, a composite decision/owner parent key and update/delete rejection. No broker or order capability exists.

Verification on 6 September 2026:

- focused migration contract: 7/7 passed;
- repository tests: 145/145 passed;
- TypeScript: passed;
- palette: passed;
- `git diff --check`: passed;
- isolated database/RLS/function execution: deferred because the migration is unapplied;
- browser verification: not applicable to this schema-only phase.

## Remaining gate scope

Implement exact timestamp-aligned FX and benchmark resolution plus deterministic drawdown; expose honest Decision Lab comparisons; define but do not deploy the scheduled operational path without separate authority; complete whole-gate regression and independent audit; then route real pilot evidence to Owner Review C.

## Producer evidence — immutable checkpoint evaluation

The second local phase adds the internal INSERT-only checkpoint evaluator. OPEN selects the latest canonical session at or before the persisted cutoff; 5D, 20D and 60D count exact sessions after the immutable entry; EXIT requires a persisted owner-matched EXIT event and the first later canonical session. All selection remains bounded by the evaluation cutoff.

The evaluator calculates raw close return and the approved unrounded fee/slippage BUY simulation. WATCH, HOLD, PASS and AVOID remain observational and never receive simulated profit. Same-currency base return is explicit; unavailable FX, optional benchmark and unverified corporate-action evidence remain null with stable reasons. The canonical source hash binds the decision source hash, cutoff, checkpoint, selected observation IDs and quality result. INSERT-on-conflict returns an identical immutable retry and raises `CALCULATION_ERROR` for divergent evidence without mutation.

Verification on 6 September 2026:

- focused migration contract: 12/12 passed;
- repository tests: 150/150 passed;
- TypeScript: passed;
- palette: passed;
- `git diff --check`: passed;
- isolated database/function/concurrency execution: deferred because the migration is unapplied;
- browser verification: not applicable to this schema-only phase.
