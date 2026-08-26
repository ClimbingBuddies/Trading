# Frontend Route Map

**Application:** Next.js App Router  
**Production:** https://discoverbouldersmarkets.vercel.app  
**Last reconciled:** 26 August 2026

The frontend is a presentation and owner-workspace layer over Supabase. It does not create analytical conclusions in the browser and does not use privileged credentials.

## Routes

| Route | Purpose | Primary persisted sources | Access |
|---|---|---|---|
| `/` | Redirect to the Admin operational dashboard | None | Public |
| `/admin` | Loader health, freshness, operational telemetry and performance monitoring | `sync_runs`, `instruments`, `market_observations`, Technical/Convergence/evaluator run telemetry | Operational dashboard |
| `/admin/loads/[id]` | Individual market-data load drill-through | `sync_runs`, related observations | Operational dashboard |
| `/markets` | Active instrument overview, search, filters and freshness | `instruments`, latest observations | Public read-only |
| `/markets/[symbol]` | Instrument history, current short-term result and relevant long-term themes | `market_observations`, `market_convergence_assessments`, Opportunity exposure mappings | Public read-only |
| `/assessments` | Published completed AI Market and Convergence summaries | Completed non-test Market runs, assessments and Convergence rows | Deliberately published read-only |
| `/assessments/[symbol]` | Instrument assessment detail and evidence | `gpt_market_assessments`, `gpt_market_evidence`, `market_convergence_assessments` | Deliberately published read-only |
| `/opportunities` | Long-term Opportunity themes and current assessment ranking | Opportunity themes, signals and assessments | Public read-only |
| `/opportunities/[theme]` | Theme detail, history, evidence, events and exposure | Opportunity signals, assessments, events, tracked/external mappings, Research documents/embeds | Public read-only |
| `/watchlists` | Create and maintain private instrument lists | `watchlists`, `watchlist_items` | Permanent authenticated owner |
| `/alerts` | Maintain private alert definitions and inspect event history | `alerts`, `alert_events` | Permanent authenticated owner |
| `/strategies` | Strategy laboratory summary and secure-session resolution | Strategy, test-run and evaluation tables | Authenticated owner |
| `/strategies/[id]` | Strategy definition and current evidence | `trading_strategies`, decision-tree metadata | Authenticated owner |
| `/strategies/[id]/tests/[runId]` | Immutable test-run metrics, provenance and review outcome | `trading_test_runs`, `trading_decision_evaluations`, decision path | Authenticated owner |
| `/help` | Render the canonical Trading Platform User Guide inside the app | `documentation/user-guide.md` and its referenced documentation screenshots | Public read-only |

## Analytical boundaries

- Technical Engine and ChatGPT Market Assessment are independently produced.
- Market Convergence is displayed only after both independent branches exist.
- Opportunity Assessment is a separate long-term system and does not consume short-term Market, Technical or Convergence conclusions.
- External opinion is provenance-bearing evidence within its approved Market research role; it is not counted twice.
- Strategy results are evidence, not permission to trade. The current outcome remains `continue_testing`.

## Interaction contract

- Navigation, cards, tabs and selectors must remain keyboard operable.
- Focus indicators and semantic status colours must remain visible across all supported palettes.
- Narrow screens use scrollable tab/table patterns without making controls unreadable.
- Loading, empty and error states must preserve the page structure and explain what is happening.
- Missing data stays explicit; the frontend must not infer or fabricate values.
- Owner workspaces resolve Supabase Auth before reading or mutating private rows.
- `/help` renders repository-authored Markdown from `documentation/user-guide.md`; generated public screenshot copies are build artifacts and are not a second editable guide source.
- Primary navigation exposes **Help** at `/help` using the same link and active-state behaviour as the other workspaces.

## Data and security contract

- Public routes use only approved read policies and column grants.
- Watchlist, alert and strategy rows are owner-scoped by RLS.
- Browser code uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` only.
- Service-role, provider and orchestration secrets must never appear in browser code.
