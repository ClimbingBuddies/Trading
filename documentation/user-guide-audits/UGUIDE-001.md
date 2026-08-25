# UGUIDE-001 — Producer Evidence

**Task:** Establish guide structure and evidence inventory  
**Status:** PASS WITH ADVICE — independently audited  
**Authoritative implementation audit target:** `8bd5e7105922f3aaf344f314a5f697c96b2eccb0`  
**Starting project commit:** `eaed1e1c73b7abb625b38394eb40f9746fc47e25`  
**Producer checkpoint commit:** `11077ab56cf3718fcbc30584fe2c3363636b36f3`  
**Production verified:** 25 August 2026  
**Production deployment:** `dpl_5dFMFTXGsGKYS3Rbnk8h3t5u6pWx` (`READY`, target `production`)

## Handoff identity reconciliation

The sole implementation audit target is commit `8bd5e7105922f3aaf344f314a5f697c96b2eccb0`, which created the UGUIDE-001 deliverable `documentation/user-guide.md`.

The earlier handoff incorrectly mixed implementation with later delivery-control records. These commits are deliberately excluded from the implementation audit target:

- `11077ab56cf3718fcbc30584fe2c3363636b36f3` — Producer start checkpoint;
- `d14d17ca6454dbf38876b115c4085a427371b40c` — Producer evidence record;
- `9733d1b9b210bc5a2e1db8993b70a27871284c81` — project-plan transition to review;
- `37124559cf05917cd48db172b6b1c587d91fb845` — initial journal handoff metadata;
- `74161ce4779ce613b7cb34770fea7d2faa8c198d` and `9d5252203015a4db50fae33b7c3e62239ac0e320` — Auditor query/control records;
- subsequent query-answer, plan and journal commits — corrected control metadata only.

The Auditor should inspect commit `8bd5e7105922f3aaf344f314a5f697c96b2eccb0` for the guide implementation, then read the latest plan, journal and this evidence record separately as current control state. This avoids the self-referential impossibility of including the commit that stores a handoff inside the implementation target named by that same handoff.

## Implemented scope

Created `documentation/user-guide.md` as the canonical task-based guide skeleton with:

- first-time-user audience and non-advice/live-trading boundaries;
- a public-versus-owner-authenticated access table;
- an ordered first-visit task sequence;
- section scaffolding for Admin, Markets, Assessments, Opportunities, Watchlists, Alerts, Strategies, freshness and troubleshooting;
- a nine-image screenshot manifest that stays within the authorised seven-to-nine deliverable;
- per-image gate, route/state, access requirement and teaching purpose;
- a section-to-route and section-to-canonical-document evidence map;
- explicit authenticated-session requirements for private screenshots;
- a live route verification inventory.

No prior `documentation/user-guide.md` existed at the start of the gate, so there was no superseded canonical draft to delete. No screenshot file was created in this structure-only gate.

## GitHub evidence

The new guide contains 22 Markdown link occurrences resolving to 17 unique repository targets. All 17 targets were fetched successfully from the default branch:

- `documentation/frontend-route-map.md`
- `documentation/platform-architecture.md`
- `documentation/assessment-system-overview.md`
- `documentation/operational-runbook.md`
- `documentation/pipelines/market-data-pipeline.md`
- `documentation/pipelines/technical-engine-operations.md`
- `documentation/specifications/technical-market-scoring-specification.md`
- `documentation/specifications/market-convergence-specification.md`
- `documentation/pipelines/opportunity-assessment-pipeline.md`
- `automation/daily-opportunity-assessment.md`
- `documentation/security/watchlist-auth-model.md`
- `documentation/watchlist-activation.md`
- `documentation/specifications/alert-trigger-specification.md`
- `documentation/alert-lifecycle.md`
- `documentation/strategy-framework.md`
- `documentation/backtests/daily-trend-pullback-v1-baseline-result.md`
- `documentation/strategy-reviews/daily-trend-pullback-v1-standard-review.md`

## Production/browser evidence

Observed with the connected production browser at 1363 × 936 CSS pixels, device-pixel ratio 1.

| Route | Observed state |
|---|---|
| `/` | Redirected to `/admin` |
| `/admin` | “Admin / Data Load Monitoring”; live loader/freshness and engine telemetry |
| `/markets` | “Markets / Instrument Overview”; 30 active instruments |
| `/markets/amd` | AMD instrument history, current assessment and two stored long-term themes |
| `/assessments` | “Assessments / Market Overview”; distinct Technical, AI and Convergence populations |
| `/assessments/gld` | Separate Technical, AI Market and Market Convergence cards with methodology/input boundaries |
| `/opportunities` | “Opportunity Assessment”; long-term/non-Buy-Sell boundary visible |
| `/opportunities/ai_advanced_packaging` | Separate Structural, Technology and Opportunity Convergence panels |
| `/watchlists` | Signed-out “Sign in to use watchlists” state |
| `/alerts` | Signed-out “Sign in to use alerts” state |
| `/strategies` | Signed-out “Sign in to view strategy evidence” state |

All ten explicit non-root routes above also returned successfully through the connected Vercel fetch path.

## Read-only production-data evidence

The production Supabase table inventory confirmed the data sources mapped by the guide, including:

- `instruments`, `market_observations`, `market_scores`;
- `gpt_market_assessments`, `gpt_market_evidence`, `market_convergence_assessments`;
- `opportunity_themes`, signals, assessments, events and exposure mappings;
- owner-scoped `watchlists`, `watchlist_items`, `alerts`, `alert_events`;
- strategy definitions, test runs and decision evaluations.

The inspection was read-only. No schema, policy, function, schedule or row was changed.

## Acceptance-criteria trace

| Criterion | Producer evidence |
|---|---|
| Guide skeleton | Canonical `documentation/user-guide.md` created with eight task sections and recommended first-visit sequence |
| Audience and boundaries | First-time-user audience; live-trading, non-advice, system-independence and `continue_testing` boundaries are prominent |
| Route mapping | Access table, per-section primary routes and verified representative route inventory |
| Canonical-document mapping | Section-to-source table; 17/17 unique linked targets fetched |
| Public/authenticated needs | Public and owner access explicitly mapped; signed-out private routes observed; AUTH_REQUIRED rule recorded for final private screenshots |
| Screenshot manifest | Exactly nine planned images, with filename, gate, route/state, access and teaching purpose |
| Superseded canonical draft | Pre-gate fetch returned 404; no prior canonical guide existed |
| Documentation-only boundary | No application, Supabase, Vercel or production mutation |

## Known limitation for Auditor review

Current production redirects `/` to `/admin`, while `documentation/frontend-route-map.md` currently describes `/` as redirecting to `/markets`. The guide follows observed production truth and records Admin as the current landing page. UGUIDE-001 does not authorise unrelated canonical-document reconciliation; the Auditor should decide whether this is non-blocking advice or must be corrected within the user-guide project.

## Independent audit instructions

The Auditor should:

1. compare the implementation against UGUIDE-001 in `documentation/user-guide-project-plan.md`;
2. re-fetch the guide and all mapped sources;
3. reproduce representative public and signed-out private route observations;
4. verify the screenshot count is exactly nine and every access dependency is explicit;
5. verify the guide does not imply live trading or investment advice;
6. issue PASS, PASS WITH ADVICE or one complete REWORK correction set without editing Producer work.


## Independent Auditor decision — 26 August 2026

**Decision:** PASS WITH ADVICE  
**Implementation commit reviewed:** `8bd5e7105922f3aaf344f314a5f697c96b2eccb0`  
**Audit scope:** UGUIDE-001 only  
**Data or schema effects:** none

### Evidence independently checked

- Validated the corrected Producer handoff and the explicit `HANDOFF_ANSWER`; the plan, journal and this audit record now consistently identify `8bd5e7105922f3aaf344f314a5f697c96b2eccb0` as the sole implementation target.
- Inspected the exact commit: it adds only `documentation/user-guide.md` (206 lines) and no application, schema, policy, schedule, deployment or production-data changes.
- Compared the guide at the implementation commit with the current default branch; both resolve to blob `066e05f8648eb06e0c195f75e44e6d50fc6869a2` and are byte-for-byte identical.
- Re-fetched all 17 unique canonical documentation targets linked by the guide; 17/17 resolved.
- Independently inspected the current production UI at a stable 1363 × 936 CSS-pixel viewport, device-pixel ratio 1: root redirect plus `/admin`, `/markets`, `/markets/amd`, `/assessments`, `/assessments/gld`, `/opportunities`, `/opportunities/ai_advanced_packaging`, and the signed-out states of `/watchlists`, `/alerts` and `/strategies`.
- Confirmed the guide's public-versus-authenticated access descriptions against visible production behaviour.
- Confirmed the nine-row screenshot manifest has a unique, descriptive filename, responsible gate, route/state, access requirement and teaching purpose for each image. UGUIDE-001 appropriately adds no screenshots; image, alt-text, caption and privacy QA remains assigned to the gates that capture them.
- Confirmed the guide contains prominent boundaries for no live-trade placement, non-personalised financial advice, short-term Market versus long-term Opportunity assessment, Technical/AI independence and `VALIDATE_ROBUSTNESS` / `continue_testing`.
- Used read-only production evidence to corroborate current visible populations: 30 active instruments, 30 Market Convergence rows and 10 active/watch Opportunity themes. The current strategy decision is `VALIDATE_ROBUSTNESS` with `continue_testing`, and live execution is disabled.
- Scanned the guide for email addresses and common token/secret patterns; none were found. No screenshots or private owner data were introduced by this gate.
- Confirmed no superseded canonical guide existed before the implementation commit and no duplicate image or temporary guide artifact was introduced.

### Findings

1. The complete UGUIDE-001 Definition of Done is satisfied.
2. The guide is truthful to the observed production landing behaviour: `/` redirects to `/admin`.
3. Non-blocking advice: `documentation/frontend-route-map.md` still says `/` redirects to `/markets`. Reconcile that canonical route-map statement during final publication QA (UGUIDE-005), unless it is corrected earlier under separate authority. Do not change the accurate guide to match the stale statement.
4. Authenticated owner screenshots are not evidence required by UGUIDE-001 and remain correctly deferred to UGUIDE-003/UGUIDE-004 under the recorded `AUTH_REQUIRED` rule.

### Decision trace

| Definition-of-Done item | Auditor result |
|---|---|
| Guide skeleton, audience and boundaries | PASS |
| Task sequence and section scaffolding | PASS |
| Current routes and canonical-document map | PASS WITH ADVICE — one stale root-redirect statement exists in the older route map |
| Public/authenticated access requirements | PASS |
| Exactly nine planned screenshots with responsibilities | PASS |
| Superseded canonical draft cleanup | PASS — none existed |
| Documentation-only scope | PASS |

**Complete correction set:** none; no rework is required for UGUIDE-001.  
**Successor authorised:** UGUIDE-002 — Document public navigation and assessment dashboards.  
**Exact next action:** Producer begins only UGUIDE-002 after reading the updated plan and controller journal; UGUIDE-001 must not be reopened unless new contradictory primary evidence appears.
