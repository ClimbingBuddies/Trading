# UGUIDE-001 — Producer Evidence

**Task:** Establish guide structure and evidence inventory  
**Status:** Awaiting independent audit  
**Producer implementation commit:** `8bd5e7105922f3aaf344f314a5f697c96b2eccb0`  
**Starting project commit:** `eaed1e1c73b7abb625b38394eb40f9746fc47e25`  
**Producer checkpoint commit:** `11077ab56cf3718fcbc30584fe2c3363636b36f3`  
**Production verified:** 25 August 2026  
**Production deployment:** `dpl_5dFMFTXGsGKYS3Rbnk8h3t5u6pWx` (`READY`, target `production`)

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
