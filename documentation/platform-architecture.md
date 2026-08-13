# Platform Architecture

## Purpose

Discover Boulders Markets is a Supabase-backed trading research and monitoring platform with a Next.js presentation layer.

The architecture is deliberately split so that:

- **Supabase** owns persistent data, scheduled market-data jobs, Edge Functions and system-of-record assessment data.
- **ChatGPT Scheduled Tasks** perform independent research/assessment workflows using canonical GitHub specifications and write results to Supabase.
- **GitHub** owns application source and canonical assessment methodology specifications.
- **Next.js** owns dashboards, research views and drill-through navigation.
- **Vercel** hosts the Next.js application.
- **Twelve Data** is the active market-data provider.

## Canonical deployment path

- GitHub repository: `ClimbingBuddies/Trading`
- Production branch: `main`
- Vercel project: `boulders-market`
- Public URL: `https://discoverbouldersmarkets.vercel.app`

Intended deployment flow:

```text
ClimbingBuddies/Trading
        |
        | main
        v
Vercel project: boulders-market
        |
        v
https://discoverbouldersmarkets.vercel.app
```

The Git-to-Vercel project association is configured in Vercel. Repository source alone does not select the Vercel project.

## High-level architecture

```text
                         TWELVE DATA
                              |
                              v
                Supabase full-twelve-data-load
                              |
                 +------------+-------------+
                 |                          |
                 v                          v
             sync_runs              market_observations
                                            |
                                            v
                                       instruments


SHORT-TERM MARKET ASSESSMENT

market_observations / market data
          |
          v
   Technical Engine ----------------------+
   market_scores                          |
                                          v
                               market_convergence_assessments
                                          ^
                                          |
ChatGPT Scheduled Market Assessment ------+
   gpt_market_runs
   gpt_market_assessments
   gpt_market_evidence

The Technical Engine and ChatGPT Market Assessment are deliberately independent before convergence.


LONG-TERM OPPORTUNITY ASSESSMENT

real-world research
       |
       +--> structural_opportunity_signals --------+
       |                                           |
       +--> technology_inflection_signals ---------+--> opportunity_assessments
                    |                              |
                    +--> technology_inflection_events
                                                   |
                                                   +--> opportunity_theme_instruments
                                                   +--> assessment_research_documents
                                                   +--> assessment_research_embeds
```

## Platform layers

### 1. Market reference and provider layer

Core tables:

- `data_providers`
- `instruments`
- `provider_instruments`

This layer defines what is tracked and how internal instruments map to an external provider.

### 2. Market-data ingestion and operational monitoring

Core tables:

- `market_observations`
- `sync_runs`

Server-side components:

- Edge Function `full-twelve-data-load`
- Edge Function `test-twelve-data-load`
- pg_cron job `trading-market-data-every-15-minutes`

Market data is the most mature end-to-end automated pipeline.

### 3. Technical / market scoring layer

Core tables include:

- `technical_indicators`
- `market_scores`

This is the systematic/technical side of the short-term Market Assessment. It should remain independent from the ChatGPT Market Assessment before convergence.

### 4. ChatGPT Market Assessment layer

Core tables:

- `market_assessment_schedule_log`
- `market_assessment_queue`
- `gpt_market_runs`
- `gpt_market_assessments`
- `gpt_market_evidence`

The primary orchestration model is **ChatGPT Scheduled Task + connected Supabase app**. The canonical methodology should live in GitHub and the Scheduled Task should retrieve it at run time.

The legacy OpenAI-API Edge Function worker path is fallback/experimental rather than the governing architecture.

### 5. Market Convergence layer

Core table:

- `market_convergence_assessments`

This combines the independent Technical Signal and independent ChatGPT Market Signal only after both have been produced.

### 6. Opportunity Assessment layer

Core tables:

- `opportunity_themes`
- `opportunity_theme_instruments`
- `structural_opportunity_signals`
- `technology_inflection_signals`
- `technology_inflection_events`
- `opportunity_assessments`

Canonical scheduled-task specification:

- `automation/daily-opportunity-assessment.md`

The Opportunity Assessment is a long-term discovery system and is deliberately independent of short-term technical signals and Buy/Hold/Sell market assessments.

Its two independent inputs are:

1. **Structural Opportunity Signal** — demand, adoption, capital investment, capacity constraints and economics.
2. **Technology Inflection Signal** — bottleneck unlock, evidence quality, commercialisation and potential impact.

Only after those two signals are produced does the platform calculate Opportunity Convergence.

### 7. Research & Evidence layer

Core tables:

- `assessment_research_documents`
- `assessment_research_embeds`

The document stores TipTap/ProseMirror-compatible JSON and searchable plain text. Embeds support articles, external links, charts, indicators, images, internal links, evidence and callouts.

The structured assessment tables remain the system of record for scores; the Research & Evidence document is the explanatory research layer around them.

### 8. External opinions, watchlists and alerts

Core tables include:

- `opinion_sources`
- `opinion_reviews`
- `instrument_opinions`
- `instrument_opinion_consensus`
- `watchlists`
- `watchlist_items`
- `alerts`
- `alert_events`

These areas are partial/scaffolded and should not yet be described as complete production workflows.

### 9. Strategy laboratory

Core tables:

- `trading_strategies`
- `trading_test_runs`
- `trading_decision_trees`
- `trading_decision_nodes`
- `trading_decision_edges`
- `trading_decision_evaluations`

A system decision-tree template exists; strategy execution/testing remains a later-stage workflow.

## Frontend application

The Next.js application uses the App Router and reads Supabase through:

- `lib/supabase.ts`
- `lib/dashboard.ts`
- `lib/opportunities.ts`

Current top-level areas:

- Admin
- Markets
- Assessments
- Opportunities
- Strategies

The Opportunity area is implemented in GitHub with:

- `/opportunities`
- `/opportunities/[theme]`

The drill-through includes Structural Opportunity, Technology Inflection, history, events, instrument exposure and Research & Evidence rendering.

## Design principle

Supabase is the system of record. Frontend pages may calculate presentation metrics from Supabase data but must not invent production values to fill empty areas.

GitHub is the system of record for source code and canonical assessment methodology. Vercel should deploy the `main` branch of `ClimbingBuddies/Trading` through the single `boulders-market` project.
