# Frontend Route Map and Design Behaviour

**Last verified:** 22 August 2026  
**Application:** Discover Boulders Markets  
**Production:** `https://discoverbouldersmarkets.vercel.app`  
**Vercel project:** `boulders-market`

## Application structure

The frontend is a Next.js App Router application using TypeScript.

Supabase access is centralised through modules including:

- `lib/supabase.ts`
- `lib/dashboard.ts`
- `lib/opportunities.ts`
- `lib/opportunity-cache.ts`
- `lib/opportunity-daily-summary.ts`

Shared presentation and interaction components include:

- `components/AppNav.tsx`
- `components/LoadChart.tsx`
- `components/MarketsTable.tsx`
- `components/AssessmentDonut.tsx`
- `components/PriceHistoryChart.tsx`
- `components/OpportunityHistoryChart.tsx`
- `components/ResearchDocument.tsx`
- `components/OpportunityCarousel.tsx`
- `components/OpportunityThemeSelect.tsx`
- `components/OpportunityExposurePanel.tsx`
- `components/ThemePaletteSelector.tsx`

The root layout imports the shared theme layers plus the Opportunity-specific responsive and exposure-inspector styles.

---

## Root route

### `/`

Purpose: entry point.

Current behaviour: redirects or routes into the Admin dashboard.

---

## Admin

### `/admin`

Purpose: operational market-data monitoring.

Primary Supabase sources:

- `sync_runs`
- `market_observations`
- `instruments`

Implementation entry point:

- `getAdminDashboardData()` in `lib/dashboard.ts`

### `/admin/loads/[id]`

Purpose: load-run drill-through.

Implementation entry point:

- `getLoadDetail(id)`

---

## Markets

### `/markets`

Purpose: current instrument universe, latest prices and data freshness.

Primary Supabase sources:

- `instruments`
- `provider_instruments`
- `data_providers`
- `market_observations`

Implementation entry point:

- `getMarketsData()`

### `/markets/[symbol]`

Purpose: instrument detail, price history and database-driven cross-reference to relevant long-term Opportunity themes.

Primary Supabase sources:

- `instruments`
- `market_observations`
- latest `gpt_market_assessments` record for the instrument
- tracked rows from `opportunity_theme_all_exposures`
- active/watch `opportunity_themes`
- latest `opportunity_assessments` row for each mapped theme

Implementation entry point:

- `getMarketDetail(symbol)`

For each tracked instrument, the page shows active mapped Opportunity themes, the stored exposure score/type/rationale, and the latest long-term Opportunity score, level, confidence, horizon, date and methodology when available. Theme cards link back to the relevant Opportunity Exposure view. An explicit empty state is shown when no active theme maps to the instrument.

This is a read-only cross-system presentation. Opportunity exposure does not alter Technical, AI or Market Convergence calculations, and Market results do not alter the Opportunity exposure score. External Opportunity exposures are excluded because this route represents an internally tracked instrument. Symbols containing `/` are normalised to `-` in route slugs.

---

## Market Assessments

### `/assessments`

Purpose: compare the latest persisted Technical Engine, AI Market Assessment and Market Convergence results without collapsing them into one recommendation.

Primary Supabase sources:

- `gpt_market_assessments`
- `gpt_market_runs`
- `market_convergence_assessments`
- joined `instruments`

Current features include:

- latest assessment date
- instruments assessed
- rating distribution
- average confidence
- highest-conviction instruments
- lowest-conviction instruments
- current run status
- explicit source/coverage cards for Technical, AI and Convergence
- a recent signal-comparison table with separate score, confidence, source date and result labels

Implementation entry point:

- `getAssessmentsData()`

### `/assessments/[symbol]`

Purpose: instrument-level comparison of independent Technical and AI results with their downstream Market Convergence output.

Primary Supabase sources:

- `instruments`
- latest `gpt_market_assessments` row
- latest `market_convergence_assessments` row
- associated `gpt_market_evidence`

The page renders three visually distinct result cards:

1. **Technical Engine** — the immutable Technical score, signal, confidence and source-record ID captured by the Convergence row. Direct `market_scores` reads remain behind their existing authenticated-only RLS policy.
2. **AI Market Assessment** — rating, score, confidence, source date and methodology version; the research brief and evidence stay explicitly AI-owned.
3. **Market Convergence** — label, score, confidence, assessment date, methodology version and the Technical/AI source-score snapshot used by the combined result.

Missing sources remain explicit instead of being inferred. The ChatGPT Market Assessment remains analytically independent from the Technical Engine before Market Convergence is calculated; UI proximity does not change that boundary.

---

# Opportunity Assessments

## `/opportunities`

Purpose: long-term Opportunity Assessment overview.

Implementation entry points:

- `app/opportunities/page.tsx`
- `getCachedOpportunityOverview()`
- `getOpportunityDailySummary()`
- `components/OpportunityCarousel.tsx`

Primary Supabase-backed data includes:

- Opportunity Themes
- latest Opportunity Assessments
- mapped exposure
- latest Opportunity Assessment execution/run state
- current-vs-previous assessment changes used for the daily status treatment

### Current overview presentation

The overview is a dashboard of Opportunity Theme cards rather than a horizontal carousel despite the historical `OpportunityCarousel` component name.

The page currently shows:

- breadcrumb and `Opportunity Assessment` heading
- average Opportunity Score and level
- last assessment time in Australia/Perth
- a latest-daily-run status strip when execution data exists
- themes assessed vs requested
- score-change count
- new Technology Inflection Event count
- evidence-refresh count
- completion time
- one card per active/watch Opportunity Theme
- Opportunity score and level per theme
- latest daily score delta/update state where available
- up to four top tracked exposed tickers per card
- direct card navigation into the theme dashboard

The overview preserves the product boundary that an Opportunity score is a long-term discovery/research measure, not a Buy/Sell signal.

### Overview responsive behaviour

`app/opportunity-carousel-responsive.css` governs the card grid:

- desktop: **3 columns**
- `<= 1050px`: **2 columns**
- `<= 649px`: **1 column**

On desktop screens at least 700px high, the first two rows are sized against the visible viewport so six cards can form the primary above-the-fold dashboard area while later themes continue below.

Cards remain keyboard accessible and can be opened with Enter/Space as well as pointer input.

---

## `/opportunities/[theme]`

Purpose: long-term Opportunity Theme drill-through using stable `theme_code` routing.

Implementation entry points:

- `app/opportunities/[theme]/page.tsx`
- `getCachedOpportunityDetail(themeCode)`
- `components/OpportunityThemeSelect.tsx`

The route normalises the theme code to lower-case for navigation while Supabase remains the source of the canonical theme record.

### Current detail navigation

The detail page has six query-string views:

| Tab | Query value | Purpose |
|---|---|---|
| Overview | default / `overview` | Structural, Technology and Opportunity Convergence summary plus current profile. |
| Investment Case | `investment-case` | Thesis, key drivers, key risks, time horizon and commercial readiness. |
| Synergies | `synergies` | Related Opportunity Themes derived from shared tracked-instrument exposure. |
| Exposure | `exposure` | Ranked mapped instruments plus exposure context and market-trend inspection. |
| Events | `events` | Technology Inflection Events and supporting evidence chronology. |
| AI Recommendation | `ai-recommendation` | Long-term Opportunity interpretation derived from the persisted Opportunity Assessment, not a short-term trade signal. |

The tab strip is horizontally scrollable so all six views remain reachable on narrow screens without shrinking the labels into unreadable controls.

### Overview tab

The Overview tab presents three independent/combined signal cards:

1. Structural Opportunity
2. Technology Inflection
3. Opportunity Convergence

It also shows plain-language `Why this matters` context and a current-profile card containing confidence, commercial readiness/maturity and time horizon.

### Investment Case tab

The Investment Case tab presents:

- Investment Thesis
- Key Drivers
- Key Risks
- Time Horizon
- Commercial Readiness

The page uses stored assessment/evidence content and does not invent missing drivers or risks.

### Synergies tab

The Synergies tab identifies related active Opportunity Themes through **shared tracked instrument exposure**. It is a real-data relationship view rather than a manually curated theme map.

Shared ticker chips show which tracked instruments connect the themes.

### Exposure tab

The Exposure tab combines ranked Opportunity exposure with independently completed current Market context.

Each mapped instrument row keeps the systems distinct:

- **Opportunity Exposure** — the long-term theme-relevance score and exposure type from the Opportunity system;
- **Current Market Result** — the latest persisted Market Convergence label, score, confidence and dated link to the independent Market detail;
- **Exposure Rationale** — the stored reason the instrument is relevant to the theme.

Tracked instruments without a completed Market Convergence result show `Not available`. External instruments show `Not tracked`; the UI does not manufacture a Market result or add them to the tracked universe. The Market result is read only after the exposure exists and does not adjust the exposure score. Opportunity exposure is not used to adjust Technical, AI or Market Convergence results.

Primary cross-system sources:

- `opportunity_theme_all_exposures`
- `market_convergence_assessments`

Current desktop layout uses approximately **3/5 width for mapped instruments and 2/5 for the context inspector**.

The inspector contains two tabs:

- **Exposure Takeaway** — the stored thematic exposure interpretation.
- **Ticker Trend** — internal market history for the selected tracked instrument.

Ticker Trend supports:

- `1D`
- `5D`
- `1M`
- `1Y`
- `5Y`
- `MAX`

Selecting an exposure switches to Ticker Trend and resets its period to **1Y**.

For tracked instruments, the panel can show latest internal price, change, open/high/low/volume and an internal trend chart, with a link to the full `/markets/[symbol]` route.

If an exposure is not tracked internally, the panel explicitly states that internal market data is unavailable and offers an external Yahoo Finance quote link. An external Opportunity exposure does not create an internal market-data subscription.

### Events tab

The Events tab surfaces persisted Technology Inflection Events and their source/evidence context. Events are research evidence supporting the long-term Opportunity system; they are not short-term Market Assessment inputs.

### AI Recommendation tab

The AI Recommendation view interprets the persisted long-term Opportunity Assessment and its confidence/readiness profile. It must not be presented as an automatic trading recommendation and remains independent from the short-term Market Assessment.

---

# Opportunity responsive behaviour

The Opportunity detail surface is designed to progressively collapse rather than hide core analysis.

## Main detail layout

`app/opportunities/opportunities.module.css` includes breakpoints at approximately:

- `1280px`
- `1000px`
- `760px`

Examples of current behaviour:

- three-signal summary grids collapse to a single column on narrower desktop/tablet widths;
- three-column Investment Case content reduces to two columns, with the first card spanning the row where appropriate;
- overview content, Exposure layout and Events layout become single-column at `<= 1000px`;
- hero/header areas stack vertically on mobile;
- horizontal tab navigation remains scrollable;
- Research & Evidence embed grids become single-column at mobile widths.

## Exposure inspector

`app/opportunity-exposure-inspector.css` uses a specialised responsive model:

- wide desktop: **3:2** instrument-list/context-inspector split;
- `<= 1380px`: the 3:2 relationship is retained with a narrower inspector minimum;
- `<= 1180px`: instrument list and inspector stack into **one column**;
- `<= 760px`: exposure rows simplify to a two-column arrangement, inspector tab type is reduced, trend price/change stacks vertically and chart height is reduced.

The inspector is injected by `components/OpportunityExposurePanel.tsx` only for an Opportunity detail route with `?view=exposure`.

---

# Palette and theme system

## Global palette selector

The root layout renders `ThemePaletteSelector` in the global top bar.

The current selectable palettes are:

1. **Midnight Blue** — `midnight-blue`
2. **Original Green** — `original-green`
3. **Copper Ember** — `copper-ember`
4. **Plum Night** — `plum-night`
5. **Stone Paper** — `stone-paper`

The selected palette is persisted in browser local storage using:

`discover-boulders-market-palette`

The application defaults to `midnight-blue`. Historical `alpine-light` storage values are migrated to `stone-paper`.

The selected palette is applied through `html[data-theme='<palette>']` before the application body renders to reduce theme flash/hydration mismatch.

## Theme CSS layers

The root layout currently imports:

- `app/globals.css`
- `app/theme.css`
- `app/theme-v2.css`
- `app/theme-light.css`
- `app/theme-compliance.css`
- `app/opportunity-carousel-responsive.css`
- `app/opportunity-exposure-inspector.css`

The global theme system uses semantic tokens such as background, panel, border, text, accent, success, warning and danger variables. `theme-compliance.css` also defines palette-specific chart tokens (`--chart-1` through `--chart-6` and `--chart-grid`) so Recharts can remain visually consistent with the selected palette.

## Current Opportunity palette limitation

The Opportunity dashboard currently defines its own scoped dark tokens in `app/opportunities/opportunities.module.css`, including:

- `--opp-bg`
- `--opp-panel`
- `--opp-panel-2`
- `--opp-border`
- `--opp-text`
- `--opp-muted`
- Opportunity blue/green/purple/cyan/orange/red accents

The Exposure inspector also contains fixed dark-surface colours.

Therefore, the **global five-palette system is operational, but the current Opportunity surface is intentionally documented as a specialised dark design rather than being claimed as fully palette-semantic**. Full semantic palette compliance for new/current components remains governed by the later project-plan item `UX-004`.

---

# Data-access and product-boundary rules

The frontend creates a Supabase client using the Trading project URL and publishable key.

The public frontend must not use the service-role key, Twelve Data API key or other privileged secrets.

Database RLS policies determine what browser/server-rendered dashboard queries can read.

Opportunity Assessment and Market Assessment may be cross-linked in the UI only after each has independently produced its own result. UI proximity must not be confused with analytical input.

When adding or changing a dashboard surface, identify:

1. the Supabase table/query that owns the data;
2. whether the dataset is public, authenticated or service-only;
3. whether the supporting workflow is Operational, Partial or Scaffolded;
4. how empty states behave;
5. whether the displayed measure is an independent input or a convergence output;
6. how the component behaves at desktop, tablet and mobile breakpoints;
7. whether it consumes semantic palette tokens or is an explicitly documented specialised surface.

A dashboard must not imply that a pipeline is operational merely because a route, table or visual component exists.
