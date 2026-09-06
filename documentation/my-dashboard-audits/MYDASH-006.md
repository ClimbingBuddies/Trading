# MYDASH-006 — Producer Evidence

**Gate:** MYDASH-006

**Role:** Producer

**Record status:** IN_REVIEW — PRODUCER CANDIDATE READY FOR INDEPENDENT AUDIT

**Date:** 6 September 2026

## Phase 1 — immutable capture foundation

The local candidate introduces the approved personal decision ledger without applying it to Supabase. It deliberately does not reuse `trading_test_runs` or `trading_decision_evaluations`: MYDASH-001 found those records describe strategy tests rather than owner decisions with forward clocks.

Implemented boundaries:

- AI-signal decisions derive instrument, normalized action, complete source snapshot and `decision_at` from a succeeded independent Market assessment and its owning run's authoritative `analysis_cutoff_time`;
- user-paper decisions use one server `clock_timestamp()` for both `source_cutoff` and `decision_at`, and never accept a client timestamp or arbitrary source snapshot;
- both persist the approved horizon, `NEXT_DAILY_CLOSE` entry rule, bounded fees/slippage/notional, currency identities, optional benchmark and `personal-forward-return-v1` calculation identity;
- decisions and events are owner-select-only, reject anonymous callers, deny browser table writes and reject UPDATE/DELETE through triggers;
- capture/event RPCs derive `owner_user_id` from `auth.uid()`, validate parent ownership and expose no broker, order, account or execution field;
- EXIT/CANCEL are append-only and limited to one terminal event; same-owner decision linkage is added to paper portfolio positions.

## Verification

- Focused migration contract: **5/5 passed**.
- Repository tests: **132/132 passed**.
- TypeScript: `npx tsc --noEmit` passed.
- Whitespace/error check: `git diff --check` passed.
- Database/RLS/RPC execution: deferred; migration intentionally remains unapplied and no hosted/private row was accessed.
- Browser verification: not applicable to this phase because no UI changed.

## Publication

Phase 1 and its delivery record are published through `17cc5b7c977f7d4662b48f5032960efa26b36ea6`; local and `origin/main` identities were confirmed equal before phase 2 began.

## Phase 2 — owner-scoped reads and lifecycle UI

The dashboard performs separate owner-filtered reads of immutable decisions and append-only events, validates their identities, chronology and approved enums before display, and keeps the whole Decision Lab result hidden if either response is malformed. Lifecycle is derived without guessing: terminal EXIT/CANCEL is completed, an exact paper-position link is open, and otherwise the decision is pending entry. AI assessment cutoff and user-paper server capture clocks remain visibly distinct. Entry price and returns remain unavailable rather than zero until MYDASH-007 produces forward evidence.

- Focused Decision Lab checks: **8/8 passed**.
- Repository tests: **135/135 passed**.
- TypeScript, palette and `git diff --check`: passed.
- Localhost desktop and 390 × 844: the selected Decision Lab tab remains responsive and exposes the existing authenticated private-data unavailable state because the candidate migration is intentionally unapplied; no browser console error appeared.
- No capture mutation was added in this phase. No database, hosted/private row, deployment, provider, broker or trading action occurred.
- Phase-2 functional/control commit `024bcfb0a8ee7c8b680b015a7f63fd41c47ff372` was pushed without force and independently confirmed as both local `HEAD` and `origin/main`.

## Phase 3 — constrained capture controls

Decision Lab now exposes two deliberately separate capture paths. The user-paper form sends only an active instrument, approved action, approved horizon and bounded optional note; the audited RPC derives owner identity, source snapshot and one trusted server clock. The AI path is offered only from persisted recommendation lineage whose source family is `MARKET_AI`; the RPC receives only that assessment identity and revalidates its succeeded independent run before deriving action, instrument, snapshot and original analysis cutoff.

Both paths make the fixed v1 paper assumptions visible: base-currency notional 1,000, zero fees/slippage, no benchmark and `NEXT_DAILY_CLOSE`. Browser table inserts remain absent. Technical, Opportunity and external-fact evidence cannot be promoted into an AI decision, and no broker, account, order or execution control was added.

- Focused decision migration/UI checks: **9/9 passed**.
- Repository tests: **136/136 passed**.
- TypeScript, palette and `git diff --check`: passed.
- Localhost desktop: authenticated Decision Lab rendered the user-paper fields, explicit assumptions, eligible-source empty state and unapplied-schema error state; the document had no horizontal overflow, Next.js error overlay or console warning/error.
- A fresh 390 × 844 viewport was unavailable in the current browser-control surface. The responsive CSS collapses both new grids/actions below 680 px, but this source inspection is not claimed as fresh narrow-screen execution evidence.
- No form was submitted during browser verification. No database, hosted/private row, deployment, provider, broker or trading action occurred.
- Phase-3 implementation/test/control commit `31616d681258f4b2597e0197cff93a782c66c88c` was pushed without force and confirmed as both local `HEAD` and `origin/main` before this publication record.

## Limitations and next phase

MYDASH-007 remains responsible for deterministic entry resolution and return snapshots. Available localhost success states plus isolated database policy/ACL/RPC execution remain deferred while the migration is unapplied; fresh narrow-screen execution also remains deferred.

## Whole-gate Producer regression and handoff

On 6 September 2026 at 12:52 Australia/Perth, the Producer re-ran the complete repository suite against the published phase-3 candidate. All **136/136** tests passed, including the nine focused decision migration/UI checks. `npx tsc --noEmit`, palette compliance and `git diff --check` also passed. A fresh fetch confirmed no divergence before the verification run.

No new implementation defect was found. No migration was applied, no private row or hosted environment was accessed, and no deployment, provider, broker, order or trading capability changed. Prior authenticated localhost desktop evidence remains applicable because the implementation did not change during this regression-only phase.

Handoff: `PRODUCER -> AUDITOR / MYDASH-006 IN_REVIEW / READY_FOR_INDEPENDENT_AUDIT`. The Auditor must review the exact published candidate independently and must not implement fixes while acting in that role.

## Independent audit — FAIL

On 6 September 2026 at 13:06 Australia/Perth, the Auditor reviewed the published implementation range `e9a0f60666b7093536bfd6cbd45bade3c111a009..31616d681258f4b2597e0197cff93a782c66c88c` and delivery-control commits through `f0c399e1b15c1e95f8ef2b25d0a6d746a762bb32`. The audit independently reproduced 136/136 repository tests, TypeScript, palette compliance and `git diff --check`. No implementation was changed while acting as Auditor.

The candidate fails the forward-evidence contract. `capture_personal_decision_v1` accepts any succeeded independent Market assessment whose `analysis_cutoff_time` is merely not in the future, then writes a newly captured AI decision with `decision_at` equal to that historical cutoff. A caller can therefore capture an old assessment after its outcome is known and create an apparent forward decision. The RPC also has no owner/source natural key or conflict handling, so direct or concurrent retries can create duplicate immutable decisions for the same owner and assessment. The UI's loaded-state disable is not an authorization or concurrency boundary.

Complete correction set:

1. Define and enforce one explicit forward AI-capture eligibility window from authoritative persisted assessment/run timestamps. Fail closed when the capture occurs outside that window; do not use client time or UI state as evidence. Preserve the original assessment cutoff as the AI evaluation clock only when capture is contemporaneously eligible.
2. Add an owner/source natural key for AI decisions and make identical retries idempotent. A conflicting non-identical immutable payload must fail without rewriting history. Concurrency must resolve at the database boundary.
3. Make the UI offer AI capture only for evidence meeting the same persisted eligibility contract, while retaining RPC revalidation as authoritative. Stale, missing, future, unsupported and already-captured evidence must remain unavailable.
4. Add executable regressions for historical/backdated direct RPC denial, future/missing timestamps, identical and concurrent retry idempotency, divergent-conflict denial, and UI eligibility. Retain owner isolation, anonymous denial, distinct user-paper server clocks, immutable events and the no-trade boundary.

Unavailable isolated database/RLS/RPC execution and fresh narrow-screen execution remain deferred evidence; they do not weaken this source-level failure.

    task_id: MYDASH-006
    handoff_from: AUDITOR
    handoff_to: PRODUCER
    handoff_status: REWORK_REQUIRED
    audit_record: documentation/my-dashboard-audits/MYDASH-006.md
    implementation_commit_or_range_reviewed: e9a0f60666b7093536bfd6cbd45bade3c111a009..31616d681258f4b2597e0197cff93a782c66c88c
    deployment_reviewed: none; migration remains unapplied and no deployment was authorised
    schema_and_rls_checks: static migration/RPC review; owner SELECT policies, anonymous denial, immutable triggers and browser table-write denial retained; isolated execution deferred
    calculation_reproduction: not applicable until MYDASH-007; forward-clock provenance inspected directly
    ui_checks: prior authenticated desktop/narrow evidence retained; source-level capture eligibility reviewed; no mutation submitted
    security_findings: P0 historical AI capture can backdate a newly created decision; P1 owner/source retry is not idempotent
    calculation_findings: AI evaluation clock is valid only if capture eligibility proves the decision existed before forward outcomes
    ux_findings: loaded-state duplicate disable is not authoritative and stale historical evidence can remain actionable
    required_corrections: enforce authoritative forward eligibility; database natural-key idempotency/conflict denial; mirror eligibility in UI; add direct/concurrent denial regressions
    residual_risks: isolated database execution and fresh narrow-screen success evidence remain deferred
    next_owner: PRODUCER
    exact_next_action: implement the complete forward-capture/idempotency correction set and return MYDASH-006 for independent re-audit

## Producer correction — forward eligibility and source idempotency

On 6 September 2026, the Producer completed the audit correction as one bounded phase. AI capture now opens only after a succeeded run has a persisted non-future completion consistent with its analysis cutoff and closes when the first later canonical Tiingo `1day` observation exists. Missing or ambiguous provider mappings and missing/future run clocks fail closed. The same predicate powers a permanent-user eligibility-list RPC; the capture RPC independently revalidates it.

A partial unique index on owner, source type, source table and assessment identity is the concurrency boundary. Identical retries return the already stored immutable decision, including after the forward window closes; different horizon, benchmark or simulation assumptions raise a conflict without update or duplication. User-paper capture, owner isolation, immutable events and the no-trade boundary are unchanged.

Verification passed: focused Decision Lab **11/11**, full repository **138/138**, TypeScript, palette and `git diff --check`. Authenticated localhost at **390 × 844** rendered the database-derived ineligible state with no horizontal overflow, framework overlay or browser warning/error; no form was submitted. Because the candidate migration remains intentionally unapplied, isolated database execution of direct/concurrent retries and RLS remains deferred evidence rather than claimed execution.

MYDASH-006 remains `IN_PROGRESS / PRODUCER` for one whole-gate reconciliation before independent re-audit.

The bounded correction implementation, regression and handoff evidence were published as `08dbdb1b0c8e254420c1b5e46092eb575a004999`; a fresh fetch confirmed local `main` and `origin/main` equal at that identity.

## Whole-gate Producer reconciliation and re-audit handoff

Whole-gate verification reproduced focused Decision Lab **11/11**, repository **138/138**, TypeScript, palette and `git diff --check` passes against functional candidate `08dbdb1b0c8e254420c1b5e46092eb575a004999`. The prior authenticated 390 × 844 evidence remains applicable because no functional code changed afterward. Isolated database/RLS/direct-concurrency execution remains deferred while the migration is intentionally unapplied.

MYDASH-006 is now `IN_REVIEW / AUDITOR`. The independent re-audit must reproduce forward eligibility, identical/concurrent retry idempotency, divergent-conflict denial, owner isolation, anonymous denial, distinct clocks, immutable events and the no-trade boundary against the exact published candidate.

The re-audit handoff is committed locally as `c1bc3af`. Publication of this internal plan/audit/journal payload was rejected by the execution safety review without fresh exact owner approval; audit work must wait until the handoff is published and remotely verified.

## Independent re-audit — PASS_WITH_ADVICE

On 6 September 2026 at 14:13 Australia/Perth, the Auditor first fetched and published the bounded re-audit handoff, then confirmed local `main` and `origin/main` at `89ce8e507b49b8cec220293f7a83d41026a4f588`. The audit reviewed functional candidate `08dbdb1b0c8e254420c1b5e46092eb575a004999` without changing implementation.

The prior failure is closed. AI capture is available only after a succeeded run's valid persisted completion and before the first later canonical Tiingo `1day` observation; missing or ambiguous provider mapping and invalid clocks fail closed. A partial owner/source unique index is the database concurrency boundary. Identical retries return the immutable decision even after eligibility closes, while any divergent horizon, benchmark or simulation assumptions raise without rewriting or duplicating history. The UI consumes only the advisory eligible-ID RPC and the capture RPC independently revalidates authority.

Independent verification passed: focused Decision Lab **11/11**, repository **138/138**, TypeScript, palette compliance and `git diff --check`. Owner-select RLS, anonymous denial, immutable decision/event triggers, browser table-write denial, distinct user-paper server clocks, same-owner linkage and the no-broker/no-order boundary remain intact.

Result: `PASS_WITH_ADVICE`. The migration remains intentionally unapplied, so isolated database execution of RLS, direct RPC denial and concurrent retry behavior remains deferred evidence and is not claimed. This advice does not reopen MYDASH-006 and grants no hosted-database, deployment, broker or trading authority. MYDASH-006 is `DONE`; MYDASH-007 is promoted to `NEXT / PRODUCER`.
