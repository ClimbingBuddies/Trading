# MYDASH-001 — Producer Evidence

**Gate:** MYDASH-001  
**Role:** Producer  
**Record status:** SECOND AUDIT REVISE — RETURNED TO PRODUCER  
**Candidate:** [My Dashboard contract v1](../specifications/my-dashboard-contract-v1.md)  
**Date:** 27 August 2026

This is a Producer handoff, not an audit decision. No production schema, data, job, route, UI or deployment change was made.

## Opening persisted state

    project_status: IN_PROGRESS
    active_gate: MYDASH-001
    active_gate_status: NEXT
    handoff_owner: PRODUCER
    handoff_status: AUTHORISED
    owner_review: NONE

The Controller selected PRODUCER exactly once and performed one bounded contract iteration.

## Source identities

Beginning-of-run repository commit: 19bfd8ea92459bedebf28d191461160aa3306df5

| Source | Blob identity |
|---|---|
| automation/my-dashboard-agentic-controller.md | aa7855a2d3f4246ffa4d5808eec12dcd1f313313 |
| documentation/my-dashboard-agentic-project-plan.md | 9df07b5ed2f85206ad9928e445c15059c447c48b |
| documentation/my-dashboard-controller-journal.md | 0d74c42a0fada79c9053cab3d9bf0f22f4d85c31 |
| documentation/development-workflow.md | e04dfa048b5b42767db4feb43d86f3738cd3c07c |
| documentation/platform-architecture.md | 4f9ee606554f14ee3ef4dd2ac6431fc00461e143 |
| documentation/frontend-route-map.md | a57db9b091f90ef6fac58bd9b37000f7f234e3e2 |
| documentation/supabase-data-model.md | 745b0b1c470437fba6427f54da0f354d33f400a0 |
| documentation/security/watchlist-auth-model.md | 38022b972872b15aba150c869524b4b47aee98a5 |
| documentation/strategy-framework.md | c92937bf966382582da554c8fc0f19997d7a104a |
| documentation/specifications/strategy-test-run-ingestion.md | e93f9ad408031981d1125d65cb371a3a0e428284 |
| documentation/pipelines/historical-market-data-backfill.md | 009cc1ccfba109f6b4243e6886dd5887be16dfec |
| documentation/pipelines/market-assessment-pipeline.md | 406b32cbc2298cc58ca3beae28be0fdab19b6703 |
| documentation/pipelines/opportunity-assessment-pipeline.md | 4042dfe36d1a12c9337faec749e282049814a2ba |

Relevant Markets, Opportunities, Watchlists and Strategies routes, AppNav, client components and Supabase helpers were also inspected fresh; their identities are recorded in the contract.

## Authoritative Supabase evidence

- Project: glvbqcplgjdfgjyknzsa
- Read-only schema/policy fingerprint: 63807c58a0ec0403ad060a49a70a11e8
- Observation time: 2026-08-27 04:06:20.748193+00.
- Latest migration: 20260827003047 repair_external_opinion_canonical_deduplication.
- Three permanent auth users and zero anonymous users.
- No proposed My Dashboard personal tables exist.
- Watchlists and watchlist_items have RLS enabled, explicit permanent-user checks and owner/parent-owner predicates; anonymous grants are absent.
- Strategy evidence tables have RLS and owner predicates, but are strategy-level test evidence rather than an immutable personal-decision ledger.
- Existing strategy evidence: one strategy, one backtest run and one evaluation.
- Market observations: 99,106 total; 90,318 daily and 8,788 quote observations.
- Latest cutoffs: Market Assessment 2026-08-21 00:56:48+00; Opportunity 2026-08-26 05:01:49+00; convergence 2026-08-22 05:55:00+00.
- Active jobs include the 06:30 AWST daily-close enqueue, two-minute history worker, 15-minute market-data loader, and 07:15/07:45 technical-engine jobs.

All Supabase inspection was read-only.

## Candidate and delivery controls

- Contract candidate commit: 4301bd9c2da904d08b3b08de644b9a537b1bab37
- Opening BUILD checkpoint: 80455338b7593b4673896bdb835d760f64a83975
- Documentation index: 02c138e629dfbdb5de38cf3dae9fdffdd2d36224
- Production effects: none.
- Vercel/browser verification: not applicable; this gate changed no UI or deployment.

## Acceptance-criteria evidence

| Required area | Candidate evidence |
|---|---|
| Personal route and information architecture | Sections 1–2 |
| Reuse versus new owner-scoped data | Sections 2–4 |
| RLS, grants and cross-user isolation | Section 5 |
| Recommendation rules and lineage | Section 6 |
| Portfolio Health dimensions and thresholds | Section 7 |
| Separate immutable AI/user clocks | Section 8 |
| Reproducible forward returns and benchmarks | Section 9 |
| Missing-data and quality states | Section 10 |
| Determinism and methodology versions | Section 11 |
| Gate-safe migration plan | Section 12 |
| Operational sequencing | Section 13 |
| Evidence, limitations and Auditor checklist | Sections 14–15 |

## Checks performed

- Reconciled proposed entities against production columns, constraints, RLS, grants, functions and jobs.
- Verified the watchlist permanent-user ownership model as the security template.
- Kept public research separate from owner-scoped personal data.
- Confirmed strategy-test tables cannot substitute for an immutable per-decision ledger.
- Defined separate AI/user source clocks, strict next-eligible-daily-close entry, and 5/20/60-observation horizons.
- Defined fees, slippage, FX, benchmark and drawdown treatment without inventing missing values.
- Required adjusted/total-return results to remain NULL / UNVERIFIED until corporate-action lineage is independently verified.
- Prohibited live trading, broker access, money movement, backdating and Opportunity-score-to-Buy conversion.

## Mandatory Producer handoff

    task_id: MYDASH-001
    handoff_from: PRODUCER
    handoff_to: AUDITOR
    handoff_status: READY_FOR_AUDIT
    implementation_commit_or_range: 4301bd9c2da904d08b3b08de644b9a537b1bab37
    delivery_control_commits: 80455338b7593b4673896bdb835d760f64a83975; 02c138e629dfbdb5de38cf3dae9fdffdd2d36224
    files_changed: documentation/specifications/my-dashboard-contract-v1.md; documentation/README.md
    migrations_and_schema_effects: None
    rls_and_permission_evidence: Watchlist policies/grants verified read-only; proposed permanent-user owner matrix is in section 5; full execution is deferred to MYDASH-002.
    source_data_and_cutoffs: Supabase fingerprint 63807c58a0ec0403ad060a49a70a11e8 at 2026-08-27 04:06:20.748193+00; cutoffs and coverage recorded above.
    calculation_or_methodology_version: my-dashboard-contract-v1; personal-forward-return-v1; portfolio-health-v1; personal-research-relevance-v1
    tests_and_checks: Fresh repository dependencies plus read-only production schema, policies, grants, functions, jobs, counts and cutoffs reconciled.
    routes_and_viewports_verified: Contract-only; existing route/auth boundaries inspected; browser and viewport verification not applicable.
    privacy_and_cross_user_evidence: Proposed matrix specified; actual watchlist policy template verified; full two-user/anonymous execution required at MYDASH-002.
    documentation_impact: New specification indexed; deployed architecture, model and route docs unchanged because production was unchanged.
    known_limitations: No implementation; adjusted/total-return lineage unverified; no historical personal decisions may be synthesized; incomplete FX/benchmark inputs remain explicit.
    acceptance_criteria_evidence: Contract sections 1–15 and the mapping above.
    exact_next_action: Independent Auditor validates this exact candidate, reproduces formula samples from persisted observations, then either passes it to Owner Review A or returns one complete correction set.

## Independent Auditor decision — REVISE

**Audited candidate:** `4301bd9c2da904d08b3b08de644b9a537b1bab37`  
**Auditor source journal:** `813addb6100c5a7a2b414d9f7bc190776a32a123`  
**Production observation time:** `2026-08-27 05:00:18.320386+00`  
**Decision:** `REVISE`

The contract is directionally sound and preserves the project's privacy, independence, clock separation, missing-data and no-live-trading boundaries. It is not yet deterministic enough to authorise a migration.

### Independently reproduced evidence

Read-only production inspection confirmed:

- three permanent users, zero anonymous users and zero proposed My Dashboard personal tables;
- Watchlist RLS includes permanent-user and owner/parent-owner checks;
- 90,318 daily observations and 8,797 quote observations; no current adjusted_close gaps;
- the exact Market, Opportunity and Convergence run cutoffs cited by the candidate;
- the candidate commit creates documentation only.

A representative read-only calculation used NVDA raw daily closes with a synthetic audit cutoff of `2026-04-30 23:59:59+00`, exact-date QQQ and AUD/USD observations, AUD conversion by `1 / AUDUSD`, a 1,000-unit notional, 10 bps fees and 5 bps slippage on each side:

| Checkpoint | Entry / exit observation | Price return | AUD-base return | QQQ return | Excess | Net simulated | Max drawdown |
|---|---|---:|---:|---:|---:|---:|---:|
| 5th later session | 6894 / 6899 | 8.4404% | 7.7761% | 5.5003% | 2.9402% | 8.1155% | -0.9976% |
| 20th later session | 6894 / 6914 | 13.0562% | 13.6653% | 10.1743% | 2.8819% | 12.7174% | -10.4352% |
| 60th later session | 6894 / 6954 | -4.2530% | -0.8958% | -1.8423% | -2.4106% | -4.5399% | -19.3985% |

This verifies the formulas when the Auditor explicitly applies `decimal_rate = bps / 10000` and exact timestamp matches. Those implementation choices are not currently stated in the candidate.

### Complete correction set

1. **P0 — Make observation selection deterministic.** Define the canonical daily observation when more than one provider/row exists for an instrument and session, define the session key and provider precedence, count distinct eligible sessions rather than raw rows, and persist the selected provider/observation identity. State the exact FX and benchmark alignment rule, inverse-pair rule, permitted gap (if any), and the precise missing-data outcome when alignment fails. This must prevent duplicate rows or provider ordering from changing entry or checkpoint selection.

2. **P0 — Reconcile basis-point storage with decimal formulae.** State exactly that each stored fee/slippage bps value is divided by 10,000 before calculation; define allowed ranges, numeric precision and where presentation-only rounding occurs. Add a worked example matching the independent result above.

3. **P0 — Make the proposed data dictionary migration-ready.** Replace shorthand such as “owner”, “instrument”, “timestamps”, “source table/ID/hash/cutoff”, “state”, “unit/notional basis”, “methodology” and “evaluation cutoff” with exact column names, types, nullability, defaults, CHECK/FK/UNIQUE constraints and referenced tables. Include the currently implied but unnamed `evaluation_cutoff` used by the return-snapshot unique key. Specify source-type invariants, parent-owner constraints and how immutability is enforced.

4. **P1 — Define recommendation independence and freshness exactly.** Provide an evidence-family dependency matrix so a Market assessment and a Convergence row containing that same assessment cannot count as two independent families. Define family-specific freshness windows or an exact versioned lookup rule for each supported horizon. Preserve canonical-source/URL deduplication for sourced facts.

5. **P1 — Define derived-write authority and quality-state precedence.** Name the constrained capture/evaluator interfaces or state that they are internal-only, specify EXECUTE grants and ownership validation, and define the primary quality-state precedence when multiple conditions coexist while retaining all reasons.

### Auditor handoff

    task_id: MYDASH-001
    handoff_from: AUDITOR
    handoff_to: PRODUCER
    handoff_status: REWORK_REQUIRED
    audit_decision: REVISE
    audited_candidate: 4301bd9c2da904d08b3b08de644b9a537b1bab37
    production_effects: None
    source_evidence: GitHub blobs recorded above; Supabase read-only observation at 2026-08-27 05:00:18.320386+00
    formula_evidence: NVDA observation 6894 with 5/20/60 exits 6899/6914/6954; QQQ and AUD/USD exact-date observations; results recorded above
    exact_next_action: Producer revises only MYDASH-001 against the complete five-item correction set, preserves all accepted boundaries, writes a new exact candidate identity and returns it for independent audit.

## Producer correction response

**Role:** Producer only  
**Prior audit:** REVISE  
**Revised candidate identity:** `eb145922543a065e48b3fd4daf324dc989f9de1d`  
**Production effects:** none

The Producer addressed the complete correction set without changing schema, data, jobs, UI or deployment:

1. Canonical v1 daily observations now require the sole active Tiingo provider, a persisted instrument/observed_at session key, distinct-session counting and no provider fallback. FX and benchmark require exact timestamp alignment; direct/inverse semantics and missing states are explicit.
2. Stored fee/slippage bps now convert by `bps / 10000`, with ranges, precision rules and the independently reproduced NVDA example.
3. Section 3 is migration-ready: exact names, types, nullability, defaults, FK/CHECK/UNIQUE constraints, source invariants, parent ownership and immutability rules are specified.
4. Recommendation dependency groups, shared Convergence-input collapse, URL-first fact deduplication and 5/20/60-horizon freshness windows are explicit.
5. Browser capture RPCs, internal evaluators, EXECUTE grants, permanent-user/owner checks and quality-status precedence are explicit.

Fresh read-only verification at `2026-08-27 06:02:04.335310+00` confirmed:

- production schema/policy fingerprint: `83f71532822fd3b614238b95b3e34180`;
- proposed personal table count: zero;
- active Tiingo provider count: one;
- 90,318 daily and 8,804 quote observations;
- NVDA observation 6894 still resolves to 5/20/60 exits 6899/6914/6954;
- price returns: 8.4404132023%, 13.0561854371%, -4.2529604434%;
- net returns with 10 bps fees and 5 bps slippage each side: 8.1154712603%, 12.7174123232%, -4.5398666628%.

### Revised Producer handoff

    task_id: MYDASH-001
    handoff_from: PRODUCER
    handoff_to: AUDITOR
    handoff_status: READY_FOR_AUDIT
    implementation_commit_or_range: e0ca61a1ec2dc66954c4189f07bc74273399911c through eb145922543a065e48b3fd4daf324dc989f9de1d
    delivery_control_commits: 81ea1124514ffbe6fb84b2d8540f47f53c73f72e
    files_changed: documentation/specifications/my-dashboard-contract-v1.md
    migrations_and_schema_effects: None
    rls_and_permission_evidence: Exact table/RPC grant and owner-isolation contract in sections 3 and 5; existing Watchlist template unchanged; production personal table count remains zero.
    source_data_and_cutoffs: Supabase fingerprint 83f71532822fd3b614238b95b3e34180 at 2026-08-27 06:02:04.335310+00; one active Tiingo provider; sample observation identities above.
    calculation_or_methodology_version: my-dashboard-contract-v1; personal-forward-return-v1; portfolio-health-v1; personal-research-relevance-v1
    tests_and_checks: All five audit corrections mapped to exact contract clauses; read-only provider uniqueness, observation counts and 5/20/60 bps-converted formula sample reproduced.
    routes_and_viewports_verified: Contract-only; browser and viewport verification not applicable because no UI changed.
    privacy_and_cross_user_evidence: Exact permanent-user predicates, table/RPC grants and two-user/anonymous test matrix specified; execution deferred to MYDASH-002.
    documentation_impact: Contract only; deployed architecture/data-model/route documentation remains unchanged because production remains unchanged.
    known_limitations: No implementation exists; corporate-action total-return semantics remain unverified; no historical decisions, provider fallback, FX carry-forward or broker capability is authorised.
    acceptance_criteria_evidence: Revised contract sections 1–14, especially sections 3, 5, 6, 9 and 10.
    exact_next_action: Independent Auditor reviews revised candidate eb145922543a065e48b3fd4daf324dc989f9de1d against the persisted five-item correction set and either routes a pass to Owner Review A or returns one complete correction set.

## Independent Auditor re-audit — REVISE

**Audited revised candidate:** `eb145922543a065e48b3fd4daf324dc989f9de1d`  
**Auditor opening journal:** `70be89259b1cbb5df6be2097b0a8c6a2b0bdaafd`  
**Production observation time:** `2026-08-27 07:02:17.713272+00`  
**Decision:** `REVISE`

The five prior correction areas were independently rechecked. Canonical Tiingo selection, distinct session counting, exact FX/benchmark rules, bps conversion, the exact table/RPC inventory, evidence-dependency collapse, freshness windows and quality precedence now satisfy the prior correction set. The NVDA 5/20/60 sample reproduced byte-equivalent source values and no production personal tables exist.

### Remaining complete correction set

1. **P0 — Resolve decision immutability versus mutable status.** The dictionary stores `personal_decisions.decision_status` with transitions from `PENDING_ENTRY` to `OPEN`, `COMPLETE`, `CANCELLED` or `ERROR`, while the same contract withholds UPDATE and says internal writers may INSERT only. Choose one exact model:
   - preferred: remove mutable `decision_status` and derive lifecycle from immutable decision events and return snapshots; or
   - explicitly permit a named internal transition helper to update only `decision_status`, with an allowed transition graph and trigger/constraint evidence that immutable clock, source, action, instrument and assumption fields cannot change.
   
   Also replace “reruns upsert” with the exact idempotence action: `INSERT ... ON CONFLICT DO NOTHING` for immutable snapshots, or explicitly name any narrowly permitted update fields. The result must preserve immutable AI/user clocks and source snapshots.

2. **P0 — Correct the UUID default rule.** “All UUID primary keys default to gen_random_uuid()” conflicts with `user_market_preferences.owner_user_id` being the natural PK/FK. State that generated surrogate `id` primary keys default to `gen_random_uuid()`, while `owner_user_id` never receives a generated default and is derived from the permanent authenticated owner.

No other correction from this audit is outstanding. JSON payload schemas may be finalised in their implementing gates under the named methodology versions, provided they do not weaken the exact relational, ownership or calculation invariants already approved.

### Re-audit evidence

- Active Tiingo provider count: one.
- Proposed personal table count: zero.
- Daily observations: 90,318.
- NVDA entry 6894 and exits 6899/6914/6954 reproduced price returns 8.4404132023%, 13.0561854371%, -4.2529604434%.
- With 10 bps fee and 5 bps slippage per side, net returns reproduced as 8.1154712603%, 12.7174123232%, -4.5398666628%.
- Existing Watchlist RLS still enforces permanent-user and owner/parent-owner access.
- Production schema/data/jobs/UI/deployment effects: none; browser/Vercel checks remain not applicable to this contract-only gate.

### Auditor handoff

    task_id: MYDASH-001
    handoff_from: AUDITOR
    handoff_to: PRODUCER
    handoff_status: REWORK_REQUIRED
    audit_decision: REVISE
    audited_candidate: eb145922543a065e48b3fd4daf324dc989f9de1d
    accepted_corrections: canonical observations; bps conversion; exact relational dictionary/RPC authority; recommendation independence/freshness; quality precedence
    remaining_correction_set: decision lifecycle immutability/idempotence; UUID natural-key default exception
    production_effects: None
    exact_next_action: Producer revises only the two remaining contract inconsistencies, preserves every accepted clause, writes a new exact candidate identity and returns it for independent audit.
