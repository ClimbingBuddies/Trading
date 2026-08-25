# Discover Boulders Markets — User Guide

**Production:** https://discoverbouldersmarkets.vercel.app  
**Audience:** first-time users with general market knowledge  
**Guide status:** public research and private monitoring workflows documented; operations section remains in progress  
**Last production check:** 26 August 2026

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
**Access:** public and read-only

Use the left navigation on any page to open **Markets**. The active workspace is highlighted, and the same navigation takes you to Assessments and Opportunities without requiring sign-in.

### Find an instrument

1. Check **Latest market observation** before using any displayed price.
2. Use an asset-class filter—All, Equities, ETFs, Forex or Crypto—or enter a symbol/name in **Search instruments**.
3. Read the row across: symbol, asset class, exchange, latest price, observation time, market state, data status and provider.
4. Treat **Market Closed** as different from **Stale**. A closed US equity/ETF session can legitimately have an older observation; stale data during an active session needs caution.
5. Select the symbol to open its detail page.

![Markets dashboard with the persistent navigation, asset-class filters, search field, instrument rows and freshness status](images/user-guide/markets-overview-desktop.png)

*The Markets overview is the public starting point for choosing an instrument and checking whether its latest observation is current enough to interpret.*

### Read the instrument page

Read from the top down:

1. **Latest price**, **Latest observation** and **Loaded at** establish what the displayed market value is and when it entered the platform.
2. **Assessment** is the latest short-term AI Market rating and confidence available for the instrument. Use **View latest assessment** to inspect its sources and the separate Technical and Convergence results.
3. **Long-term Opportunity Themes** lists only stored thematic exposures. Read **Exposure** as relevance/materiality to the theme and **Opportunity** as the theme's long-term score; neither predicts the instrument's near-term return.
4. Use the period controls above **Price History** to change the visible history window.
5. Use **Recent Observations** to inspect the timestamped underlying rows rather than assuming the chart is a live quote.

![AMD instrument detail showing observation timestamps, current Market result, separate Opportunity theme exposures and the price-history chart](images/user-guide/instrument-detail-desktop.png)

*The instrument page deliberately presents the current Market result separately from long-term Opportunity exposure; one must not be used as a substitute for the other.*

## 3. Read a Market Assessment: Technical, AI and Market Convergence

**Primary routes:** `/assessments`, `/assessments/[symbol]`  
**Access:** public and read-only

Open **Assessments** from the left navigation. The overview first reports three distinct persisted populations—Technical Engine source snapshots, AI Market Assessments and Market Convergence results—then shows the latest assessment set, rating distribution and a row-by-row comparison. Select an instrument to inspect its exact source dates, methodology and evidence.

On the detail page, read the three cards in this order:

1. **Technical Engine** — a deterministic 0–100 score derived from eligible persisted market indicators. Its confidence measures intended input coverage, not the probability of a future return. The card identifies the immutable source row and states that the AI result was not used.
2. **AI Market Assessment** — an independent research rating, 0–100 score and confidence supported by its own market evidence, catalysts and risks. The card states that the Technical result was not used.
3. **Market Convergence** — the versioned downstream combination produced only when both eligible branches exist. The current methodology gives the two scores equal weight, snapshots their lineage and reduces/caps confidence when the branches disagree.

Do not read only the combined number. Compare:

- assessment and source dates;
- the two independent scores and confidence values;
- methodology versions and source IDs;
- the disagreement label and score gap in the Convergence summary;
- the AI bull case, bear case, evidence and risks.

If an eligible source branch is missing or stale under the convergence contract, the system must not invent a neutral value or copy the available branch. A **Mixed** or **Conflict** result is useful evidence of disagreement, not an error to ignore.

![GLD assessment detail with separate Technical Engine, AI Market Assessment and Market Convergence cards plus their source boundaries](images/user-guide/assessment-detail-desktop.png)

*The assessment detail keeps the two independent inputs and their downstream Convergence result visible together, including dates, confidence, methodology and disagreement context.*

## 4. Research long-term Opportunities

**Primary routes:** `/opportunities`, `/opportunities/[theme]`  
**Access:** public and read-only

Open **Opportunities** for multi-month and multi-year research. The overview shows the latest run status, assessed-theme coverage, score changes, newly recorded events and one card per active/watch theme. A theme card includes its current Opportunity score/level, latest-update state, short description and highest stored public-market exposures.

Select **Open opportunity** to read a theme. The detail page separates six views:

- **Overview** — independent Structural, Technology and Opportunity Convergence cards plus the current profile;
- **Investment Case** — the longer-form thesis and risk context;
- **Synergies** — relationships with other themes;
- **Exposure** — tracked and external listed entities ranked by theme relevance;
- **Events** — material Technology Inflection evidence;
- **AI Recommendation** — the persisted long-term research conclusion and supporting explanation.

Read the Overview cards independently:

1. **Structural Opportunity** evaluates demand, adoption, capital investment, capacity constraints and economics.
2. **Technology Inflection** evaluates bottleneck removal, evidence quality, commercialisation and impact, including the maturity stage.
3. **Opportunity Convergence** combines the completed Structural and Technology scores. Confidence is assessed separately and must account for disagreement, freshness and evidence independence.

![Advanced Packaging for AI Compute detail showing separate Structural Opportunity, Technology Inflection and Opportunity Convergence cards](images/user-guide/opportunity-detail-desktop.png)

*The Opportunity detail presents the two independent long-term signals before their combined score, with confidence, readiness and time horizon shown separately.*

A high Opportunity score means the theme deserves long-term research attention. It is not a Buy/Sell signal. An exposure score means an instrument or external listing is relevant to the theme; it is not expected return or short-term conviction. Return to **Markets** or **Assessments** when you need the independent current instrument view.

## 5. Maintain private Watchlists

**Primary route:** `/watchlists`  
**Access:** signed-in permanent owner account

Watchlists are private Supabase Auth workspaces protected by owner-scoped row-level security. The public Markets, Assessments and Opportunities dashboards remain available without signing in.

### Sign in safely

1. Open **Watchlists**, enter the email address for your permanent account and choose **Send secure sign-in link**.
2. Open the link only from the inbox for that account. Do not share the link, a session, or account credentials.
3. Return to `/watchlists`. A signed-in workspace shows your own lists and a **Sign out** control. An anonymous session is not accepted as an owner.

Watchlist names, descriptions, private notes, order and instrument membership belong to the signed-in owner. V1 has no shared, team or public watchlists, and another account cannot read or change them.

### Create and maintain a list

1. Under **Create a watchlist**, enter a required name and an optional description, then choose **Create watchlist**. Your first list becomes the default automatically.
2. Choose a list under **Your lists**. Use **List details** and **Save details** to rename it or change the description.
3. For a non-default list, choose **Make default** when you want it selected first.
4. Under **Add an instrument**, choose an active tracked instrument and select **Add**. An instrument can appear only once in the same list.
5. Add or revise **Private notes**; leaving the field saves a changed note. Use the up/down controls to change display order or **Remove** to remove only that instrument.
6. Choose **Delete list** only when the confirmation is intentional: the list and all of its items are removed.

An empty list or an account with no lists is a valid state. A Watchlist organises monitoring; its membership or notes do not create an alert, place a trade, or express a platform recommendation.

> **AUTH_REQUIRED — owner screenshot:** On 26 August 2026 the current production browser had no already-authorised permanent-owner session. The signed-out `/watchlists` boundary was verified, but `watchlists-owner-desktop.png` was not captured. The owner workflow above was verified against current application source, the implemented access contract and read-only production RLS evidence; no private row or identity was exposed.

## 6. Configure Alerts and review event history

**Primary route:** `/alerts`  
**Access:** signed-in permanent owner account

Alerts use the same permanent identity as Watchlists. Alert definitions and event history are private to their owner. An alert is a monitoring event, not an order and not a guarantee that a condition will remain true.

### Create an alert

1. Open **Alerts**. If signed out, use **Send secure sign-in link** with the same permanent account used for Watchlists.
2. Enter a name and choose an alert type.
3. Choose the permitted target: an instrument or one of your Watchlists for short-term types, or an Opportunity theme for **Opportunity Assessment**.
4. Complete the condition shown for that type. Score-based conditions use a threshold and **Crosses above/below**; state or label conditions use **Enters** or **Any change**. Assessment types can also require a minimum confidence.
5. Choose **Create alert**. The evaluator first establishes a baseline, so a condition that was already true before creation does not produce historical events.

The six available types have deliberately separate meanings:

- **Price threshold** — a stored price crosses the configured value in the instrument currency.
- **Market-data freshness** — eligible data enters Due, Stale or No observation; a closed US equity/ETF session is not treated as stale merely because its last observation is older.
- **Market Assessment** — the independent AI rating changes/enters a selected value, or its score crosses a threshold.
- **Opportunity Assessment** — a long-term theme's level, score or commercial-readiness state changes as configured.
- **Market Convergence** — the persisted combined Technical/AI label changes/enters a selected value, or its score crosses a threshold.
- **Technical score** — a completed independent Technical metric crosses a threshold.

### Maintain definitions

- Choose **Edit**, change the definition and save it when the target or condition needs revision.
- Use **Disable** to stop evaluation without deleting the definition. Re-enabling establishes a fresh baseline.
- Choose **Delete** only after checking the confirmation; deletion also removes that alert's event history.
- A Watchlist-target alert can use only a list owned by the same signed-in account.

Crossing and entry alerts fire on a new transition, not on every later observation while the condition remains true. They re-arm only after the source crosses back or leaves the selected state. Retrying the same source transition cannot create a duplicate event.

### Read event history

**Event history** is read-only, system-generated evidence. Each visible entry identifies the related alert, trigger time, message or event key, the numeric/current value when applicable, notification status and source table. Use the source and timestamp to understand why it fired; do not treat the event as a current quote.

V1 records events before any outbound delivery and normally shows `not_requested`. That status means no email, SMS or push delivery was requested—it is not proof that a notification was sent. **No alert events have fired yet** is a valid empty state.

> **AUTH_REQUIRED — owner screenshot:** On 26 August 2026 the current production browser had no already-authorised permanent-owner session. The signed-out `/alerts` boundary was verified, but `alerts-owner-desktop.png` was not captured. The definition and event-history workflow above was verified against current application source, the alert lifecycle contract and read-only production RLS/schema evidence; no alert, event, private identity or invented state was shown.

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

The final guide targets seven to nine production screenshots. Every image must use real production-backed state, omit personal information, have meaningful alt text and include a concise explanatory caption. Items 5 and 6 remain reserved but are currently blocked by `AUTH_REQUIRED`; they are not present in the repository and must not be counted as delivered images.

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

If an authorised owner session is unavailable for items 5–7, the affected gate must record `AUTH_REQUIRED` rather than use a sign-in form or invented private state as the final instructional screenshot. UGUIDE-003 recorded `AUTH_REQUIRED` for `/watchlists` and `/alerts` on 26 August 2026; no files exist at the two reserved owner-image paths.

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

The signed-out forms verify only the access boundary. UGUIDE-003 owner-state screenshots remain `AUTH_REQUIRED`; its task instructions are source-, contract- and RLS-verified and do not claim that an authenticated UI session was observed.
