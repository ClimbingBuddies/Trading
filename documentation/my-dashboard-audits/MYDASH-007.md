# MYDASH-007 audit record

## Current status

- Gate: `MYDASH-007`
- Status: `DONE — OWNER REVIEW C`
- Current owner: `OWNER`
- Audit outcome: `PASS_WITH_ADVICE`
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

Complete whole-gate regression and independent audit; then route real pilot evidence to Owner Review C. The 07:00 operational schedule remains uninstalled pending approval.

## Producer evidence — owner-scoped Decision Lab comparisons

Decision Lab now reads immutable return snapshots with the permanent owner predicate and the already validated decision-ID set. Response validation rejects unknown parents, timestamps, checkpoint/quality identities, invalid nullable numerics, positive drawdown, malformed source hashes and any calculation version other than `personal-forward-return-v1`; one failure hides the full private decision/result read.

Each decision displays its own ordered snapshot cutoffs, quality state, source identity and nullable return evidence. Separate, non-ranked AI-signal and user-paper cohorts report coverage and completed BUY simulations only. A cohort mean uses at most the latest persisted configured-horizon or EXIT result per BUY decision; OPEN, non-BUY, missing and pending states do not contribute and are never converted to zero. The original AI assessment and user server-capture clocks remain visible on every card.

Verification on 6 September 2026:

- focused Decision Lab checks: 5/5 passed;
- repository tests: 160/160 passed;
- TypeScript: passed;
- palette: passed;
- `git diff --check`: passed;
- localhost server: Next.js 16.3.4 started on port 3001;
- localhost browser execution: signed-in owner-only Decision Lab, distinct decision clocks, no-trade disclosure and fail-closed error state verified; the unapplied return migration prevents result-bearing success-state evidence;
- narrow-screen browser execution: deferred because the available in-app browser exposes no viewport override; no private result row or screenshot was accessed;
- isolated database/RLS/function execution: deferred because the migration is unapplied.

The comparison phase and its corrected localhost evidence are published through `cebff79f820d3b7441019e9651a0f5fc92ecfc2d` on `origin/main`.

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

## Producer evidence — non-deployed operational evaluator path

The fourth phase adds internal run and per-checkpoint result ledgers plus a service-only batch evaluator. Every invocation uses an explicit non-future cutoff; identity includes cutoff, trigger, calculation version and optional target decision. A transaction advisory lock serializes identical concurrent invocations, completed runs replay idempotently, and failed retries increment their attempt count.

Each eligible decision evaluates OPEN, only its configured 5D/20D/60D horizon, and EXIT only when a persisted owner-matched EXIT event exists by the cutoff. Per-checkpoint exceptions persist bounded SQLSTATE/error evidence as `CALCULATION_ERROR` without creating a snapshot or aborting unrelated work. Both telemetry tables and the runner deny browser roles and grant only the service role. No cron, HTTP, provider, broker, order or position-changing path is installed.

Verification on 6 September 2026:

- focused migration contract: 21/21 passed;
- repository tests: 159/159 passed;
- TypeScript: passed;
- palette: passed;
- `git diff --check`: passed;
- isolated database/function/concurrency execution: deferred because the migration is unapplied;
- browser verification: not applicable to this internal schema-only phase.

## Producer evidence — exact FX, benchmark and drawdown

The third phase resolves non-base returns only from a single exact-time Tiingo `1day` direct or inverse FX observation. Same-currency decisions use rate one without fabricating an observation; absent endpoints remain `INCOMPLETE_FX`, while direct/inverse ambiguity fails as `CALCULATION_ERROR`. No triangulation, nearest row, carry-forward or fallback provider is accepted.

Optional owner-selected benchmarks require one active Tiingo mapping and observations exactly matching both selected instrument session timestamps. Missing evidence leaves benchmark and excess returns null without suppressing independently valid price/base results. Excess return compares raw instrument price return with raw benchmark return, preserving comparable methodology.

Maximum drawdown is the signed minimum of each raw close divided by its running peak across the inclusive, canonical entry-to-checkpoint path. Invalid intermediate closes fail closed. FX/benchmark observation IDs, exact rates, selected prices, derived base/excess returns and drawdown are all included in immutable source identity.

Verification on 6 September 2026:

- focused migration contract: 16/16 passed;
- repository tests: 154/154 passed;
- TypeScript: passed;
- palette: passed;
- `git diff --check`: passed;
- read-only hosted schema inspection: canonical public source tables confirmed; no private rows read;
- isolated database/RLS/function execution: deferred because the migration is unapplied;
- browser verification: not applicable to this schema-only phase.

## Producer whole-gate regression and Auditor handoff

The Producer reran the complete locally available MYDASH-007 contract surface without changing implementation. The focused suite covers immutable recommendation generation and persistence, unsupported-path denial, risk/methodology/cutoff presentation, constrained feedback, distinct AI/user decision clocks, no-trade boundaries, immutable return snapshots, exact checkpoint/FX/benchmark/drawdown calculations, operational idempotency and owner-scoped Decision Lab comparisons.

Verification on 6 September 2026:

- focused MYDASH-007 suite: 57/57 passed;
- repository tests: 160/160 passed;
- TypeScript: passed;
- palette: passed;
- Next.js 16.3.4 production build: passed with Webpack; the default Turbopack build is unavailable because the installed native Windows SWC binding is invalid and WASM-only Turbopack is unsupported;
- `git diff --check`: passed;
- prior localhost browser evidence remains applicable because implementation did not change;
- isolated database/RLS/function/concurrency execution, result-bearing success-state browser evidence and narrow-screen execution remain deferred for the previously recorded environment reasons;
- migration application, the proposed 07:00 schedule, hosted replay and production changes remain outside this gate run's authority.

Handoff: an independent Auditor must reproduce the calculations/source-cutoff invariants from primary evidence, verify security and unsupported-path denial, assess whether the deferred evidence is acceptable for Owner Review C, and record an audit outcome. This Producer run makes no audit conclusion.

The verified Producer regression and audit handoff are published as `329de804793e4d8a9c5007b31b41b7b61853007d` on `origin/main`.

## Independent Auditor outcome — 6 September 2026

Outcome: `PASS_WITH_ADVICE`.

The Auditor independently reproduced the focused MYDASH-007 suite at 57/57 and the repository suite at 160/160. TypeScript, palette, `git diff --check` and the Next.js 16.3.4 Webpack production build passed. Primary inspection of the migration, tests and Decision Lab boundary confirmed exact forward-session cutoffs, separate AI and user clocks, unrounded BUY-only simulation, exact-time direct/inverse FX, exact-time optional benchmark evidence, deterministic bounded raw-close drawdown, immutable source hashes, identical-retry idempotency, divergent-conflict denial, owner-scoped browser reads, service-only evaluation and absence of cron, broker, order or trading paths.

No locally reproducible defect was found. The advice is to retain the unapplied migration, real pilot-return rows, result-bearing browser state, 390 x 844 execution, isolated two-permanent-user/anonymous RLS and function/concurrency execution, and proposed 07:00 operational schedule as explicit deferred evidence. These items were not fabricated or treated as passed, and accepting this audit grants no authority to apply the migration, install the schedule, deploy, access private rows or enable trading.

Owner Review C decision package: accept MYDASH-007 with the above deferred evidence and authorise progression to MYDASH-008, retain the pause until real pilot/runtime evidence is available under separate exact authority, or request a bounded revision. The verified package presently contains no real pilot-return result and makes no performance claim.

Publication of this independent audit is deferred. The bounded audit/plan/journal commit is local `9ae3d1f`; the execution safety review rejected exporting that payload to the unverified external shared `origin/main` destination without fresh direct owner approval. The last confirmed remote identity remains `ca29ab54c9a7d784c0ca39280eb9232cfd51ec11`.
