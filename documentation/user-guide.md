# Discover Boulders Markets — User Guide

**Production:** https://discoverbouldersmarkets.vercel.app  
**Audience:** first-time users with general market knowledge  
**Guide status:** structured for task-by-task completion under the User Guide project  
**Last production check:** 25 August 2026

## Before you begin

Discover Boulders Markets is a research and monitoring platform. It does **not** place live trades, and its dashboards are not personalised financial advice.

Keep these boundaries in mind:

- **Market Assessment** asks whether a tracked instrument appears attractive now.
- **Opportunity Assessment** asks what structural or technological themes could become important over months or years.
- **Technical Engine** and **AI Market Assessment** are produced independently.
- **Market Convergence** combines eligible Technical and AI results only after both exist.
- A long-term Opportunity score is not a Buy recommendation.
- Strategy results are test evidence, not permission to trade. The current reviewed strategy outcome is `VALIDATE_ROBUSTNESS / continue_testing`, with live execution disabled.

## Access at a glance

Most research dashboards are public and read-only. Personal monitoring and strategy evidence require a permanent Supabase Auth account.

| Workspace | Route | Access | What it is for |
|---|---|---|---|
| Admin | `/admin` | Public operational view | Loader health, data freshness and engine telemetry |
| Markets | `/markets` | Public read-only | Browse tracked instruments and current data status |
| Instrument detail | `/markets/[symbol]` | Public read-only | Review price history, latest Market result and linked Opportunity themes |
| Assessments | `/assessments` | Public read-only | Compare independent Technical and AI results with Market Convergence |
| Assessment detail | `/assessments/[symbol]` | Public read-only | Inspect scores, confidence, disagreement, lineage, catalysts, risks and evidence |
| Opportunities | `/opportunities` | Public read-only | Browse long-term themes and current Opportunity scores |
| Opportunity detail | `/opportunities/[theme]` | Public read-only | Review Structural, Technology and Opportunity Convergence evidence |
| Watchlists | `/watchlists` | Signed-in owner | Maintain private instrument lists |
| Alerts | `/alerts` | Signed-in owner | Maintain private alert definitions and inspect event history |
| Strategies | `/strategies` | Signed-in owner | Review private strategy definitions, tests and decision outcomes |

Opening the production root currently lands on the Admin dashboard. Use the persistent left navigation to move between workspaces.

## Recommended first visit

Use this order to understand the platform without mixing short- and long-term signals:

1. Open **Admin** and check loader health and data freshness.
2. Open **Markets** and choose a tracked instrument.
3. Use the instrument page to review current observations and any linked Opportunity themes.
4. Open **Assessments** and compare Technical, AI and Market Convergence results for that instrument.
5. Open **Opportunities** to research long-term themes separately.
6. Sign in only when you need private Watchlists, Alerts or Strategy evidence.
7. Treat every score as research evidence that still requires your own judgement.

## 1. Check platform and data health

**Primary routes:** `/`, `/admin`, `/admin/loads/[id]`

Use Admin before interpreting time-sensitive results. The dashboard exposes loader health, latest observations, instrument coverage, Technical Engine history and recent load runs.

What to look for:

- whether the loader is healthy;
- the timestamp and age of the latest market observation;
- failed or partial runs;
- whether an older equity/ETF observation is expected because the US market is closed;
- terminal Technical and Opportunity engine status.

Historical daily data must not be mistaken for a current quote. A successful load also does not guarantee that every individual instrument is current.

<!-- UGUIDE-004 adds the audited Admin procedure, status/empty-state explanations and screenshot. -->

## 2. Browse markets and open an instrument

**Primary routes:** `/markets`, `/markets/[symbol]`

Markets provides the tracked-instrument overview, search, asset-class filters, latest prices and session-aware freshness states. Selecting a symbol opens its price history, recent observations, current short-term assessment summary and any stored long-term Opportunity exposure.

Keep the displayed systems separate:

- a current Market result concerns the instrument now;
- an Opportunity exposure measures relevance to a long-term theme;
- exposure strength does not predict short-term return.

<!-- UGUIDE-002 adds the audited step sequence and Markets/instrument screenshots. -->

## 3. Compare Technical, AI and Market Convergence

**Primary routes:** `/assessments`, `/assessments/[symbol]`

The assessment overview summarises the latest independent AI assessment set and the persisted convergence population. An instrument detail page keeps three results visibly separate:

1. **Technical Engine** — reproducible market/indicator calculation; AI conclusions are not inputs.
2. **AI Market Assessment** — independent research result with evidence; Technical results are not inputs.
3. **Market Convergence** — a versioned combination of eligible persisted Technical and AI source snapshots.

Read the score and confidence together. Also inspect source dates, methodology versions, disagreement labels and evidence. A combined score must not hide a meaningful conflict between the independent branches.

<!-- UGUIDE-002 adds the audited interpretation procedure and assessment screenshot. -->

## 4. Research long-term Opportunities

**Primary routes:** `/opportunities`, `/opportunities/[theme]`

Opportunities is the long-term research system. Theme detail separates:

- **Structural Opportunity** — adoption, demand, investment, constraints and economics;
- **Technology Inflection** — bottleneck removal, evidence quality, maturity and commercialisation;
- **Opportunity Convergence** — the within-system combination of the two independent long-term signals.

The current detail tabs include Overview, Investment Case, Synergies, Exposure, Events and AI Recommendation. Exposure measures theme relevance/materiality; it is not a trading instruction. Review the independent current Market Assessment separately before making a market decision.

<!-- UGUIDE-002 adds the audited task sequence and Opportunity screenshot. -->

## 5. Maintain private Watchlists

**Primary route:** `/watchlists`  
**Access:** signed-in permanent owner account

Watchlists are private Supabase Auth workspaces protected by owner-scoped row-level security. The public Markets, Assessments and Opportunities dashboards remain available without signing in.

<!-- UGUIDE-003 adds authenticated creation/edit/removal steps, safe-use notes and screenshot. -->

## 6. Configure Alerts and review event history

**Primary route:** `/alerts`  
**Access:** signed-in permanent owner account

Alerts use the same permanent identity as Watchlists. Alert definitions and event history are private to their owner. An alert is a monitoring event, not an order and not a guarantee that a condition will remain true.

<!-- UGUIDE-003 adds authenticated alert lifecycle steps, event-history interpretation and screenshot. -->

## 7. Review Strategy evidence

**Primary routes:** `/strategies`, `/strategies/[id]`, `/strategies/[id]/tests/[runId]`  
**Access:** signed-in owner

The Strategy laboratory shows versioned strategy definitions, immutable test provenance, metrics and the persisted decision path. It does not execute live trades.

The current Daily Trend Pullback v1 baseline passes several review gates but fails the positive out-of-sample-return gate. Its persisted action remains `continue_testing`; the negative holdout must not be hidden by favourable total or in-sample results.

<!-- UGUIDE-004 adds the audited strategy-reading procedure and screenshot. -->

## 8. Understand freshness, statuses and empty states

A truthful dashboard may show older, missing or empty data. Do not substitute another interval or source merely to make a page appear current.

Interpret freshness in context:

- crypto and forex are normally continuously eligible;
- equities and ETFs can be older while their market is closed;
- current dashboards use the live quote path;
- Technical and long-term Opportunity workflows have separate source/freshness contracts;
- private pages show a sign-in state when no authenticated owner session exists;
- a genuine empty state is preferable to a fabricated row or score.

<!-- UGUIDE-004 adds the audited status glossary, troubleshooting flow and mobile guidance. -->

## Screenshot evidence manifest

The final guide will contain nine production screenshots. Every image must use real production-backed state, omit personal information, have meaningful alt text and include a concise explanatory caption.

| # | Planned filename | Gate | Route/state | Access | Intended teaching purpose |
|---|---|---|---|---|---|
| 1 | `markets-overview-desktop.png` | UGUIDE-002 | `/markets` | Public | Navigation, filters, instrument table and freshness |
| 2 | `instrument-detail-desktop.png` | UGUIDE-002 | Representative `/markets/[symbol]` | Public | Price history, current result and separate Opportunity exposure |
| 3 | `assessment-detail-desktop.png` | UGUIDE-002 | Representative `/assessments/[symbol]` | Public | Distinct Technical, AI and Market Convergence cards |
| 4 | `opportunity-detail-desktop.png` | UGUIDE-002 | Representative `/opportunities/[theme]` | Public | Structural, Technology and Opportunity Convergence separation |
| 5 | `watchlists-owner-desktop.png` | UGUIDE-003 | `/watchlists`, owner state | Authenticated owner | Private list creation and instrument membership |
| 6 | `alerts-owner-desktop.png` | UGUIDE-003 | `/alerts`, owner state | Authenticated owner | Private alert definition and event history |
| 7 | `strategy-result-desktop.png` | UGUIDE-004 | Representative strategy test result | Authenticated owner | Metrics, review path and `continue_testing` outcome |
| 8 | `admin-health-desktop.png` | UGUIDE-004 | `/admin` | Public | Loader health, freshness and run telemetry |
| 9 | `markets-overview-mobile.png` | UGUIDE-004 | `/markets` narrow viewport | Public | Mobile navigation and responsive market table pattern |

If an authorised owner session is unavailable for items 5–7, the affected gate must record `AUTH_REQUIRED` rather than use a sign-in form or invented private state as the final instructional screenshot.

## Section-to-source map

This map identifies the canonical evidence that controls each section. The final prose should remain task-focused; these technical sources are for verification and deeper reading.

| Guide section | Production routes | Canonical documentation |
|---|---|---|
| Orientation, navigation and access | `/`, all primary navigation routes | [Frontend route map](frontend-route-map.md), [Platform architecture](platform-architecture.md), [Assessment system overview](assessment-system-overview.md) |
| Admin and freshness | `/admin`, `/admin/loads/[id]` | [Operational runbook](operational-runbook.md), [Market data pipeline](pipelines/market-data-pipeline.md), [Technical Engine operations](pipelines/technical-engine-operations.md) |
| Markets and instrument detail | `/markets`, `/markets/[symbol]` | [Frontend route map](frontend-route-map.md), [Market data pipeline](pipelines/market-data-pipeline.md), [Assessment system overview](assessment-system-overview.md) |
| Technical, AI and Market Convergence | `/assessments`, `/assessments/[symbol]` | [Assessment system overview](assessment-system-overview.md), [Technical scoring specification](specifications/technical-market-scoring-specification.md), [Market Convergence specification](specifications/market-convergence-specification.md) |
| Long-term Opportunities | `/opportunities`, `/opportunities/[theme]` | [Assessment system overview](assessment-system-overview.md), [Opportunity pipeline](pipelines/opportunity-assessment-pipeline.md), [Daily Opportunity specification](../automation/daily-opportunity-assessment.md) |
| Watchlists | `/watchlists` | [Watchlist access model](security/watchlist-auth-model.md), [Watchlist activation](watchlist-activation.md) |
| Alerts and event history | `/alerts` | [Alert trigger specification](specifications/alert-trigger-specification.md), [Alert lifecycle](alert-lifecycle.md) |
| Strategies | `/strategies` and detail routes | [Strategy framework](strategy-framework.md), [Baseline result](backtests/daily-trend-pullback-v1-baseline-result.md), [Standard review](strategy-reviews/daily-trend-pullback-v1-standard-review.md) |

## Verification inventory for later gates

Production was observed at a 1363 × 936 CSS-pixel browser viewport with device-pixel ratio 1.

Verified public route examples:

- `/admin` — Admin / Data Load Monitoring;
- `/markets` and `/markets/amd`;
- `/assessments` and `/assessments/gld`;
- `/opportunities` and `/opportunities/ai_advanced_packaging`.

Verified signed-out states:

- `/watchlists` — “Sign in to use watchlists”;
- `/alerts` — “Sign in to use alerts”;
- `/strategies` — “Sign in to view strategy evidence”.

The final private-workspace instructions must be based on an already-authorised owner session, not the signed-out forms.
