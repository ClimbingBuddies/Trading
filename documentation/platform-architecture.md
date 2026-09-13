# Platform Architecture

**Repository:** `ClimbingBuddies/Trading`  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Vercel project:** `boulders-market`  
**Last reconciled:** 25 August 2026

## System ownership

| Layer | Responsibility |
|---|---|
| Supabase Postgres | Persisted market data, assessments, research, operational telemetry, private owner data and strategy evidence |
| Supabase Auth and RLS | Permanent-user identity, owner isolation and deliberate public/private boundaries |
| Supabase functions, triggers and cron | Market loading, deterministic Technical/Convergence work, alert evaluation and bounded operational retries |
| ChatGPT scheduled tasks | Independent AI Market and Opportunity research workflows defined by canonical GitHub specifications |
| GitHub | Application source, methodology, specifications, documentation, migrations and audit evidence |
| Next.js | Public dashboards, drill-through views and authenticated owner workspaces |
| Vercel | Production build and hosting of the Next.js application |

## Assessment architecture

### Short-term Market Assessment

The short-term system answers: **Is this instrument attractive now?**

```text
market_observations
      |
      +--> Technical Engine -------------------+
      |     technical_indicators               |
      |     market_scores                      v
      |                          market_convergence_assessments
      |                                        ^
      +--> Independent ChatGPT Market ---------+
            gpt_market_runs
            gpt_market_assessments
            gpt_market_evidence
```

The Technical Engine cannot read GPT conclusions. The ChatGPT branch records that Technical inputs were not used. Convergence combines the two only after each has independently completed and persists source lineage, cutoff and methodology.

### Long-term Opportunity Assessment

The long-term system answers: **What could become important next?**

```text
real-world research
      |
      +--> Structural Opportunity Signal ------+
      |                                        |
      +--> Technology Inflection Signal -------+--> Opportunity Assessment
                     |                         |
                     +--> Technology Events    +--> Exposure mapping
                                               +--> Research & Evidence
```

Opportunity Assessment does not consume short-term Market ratings, Technical scores or Market Convergence. A high Opportunity score is not a Buy recommendation.

## Operational subsystems

- **Market data:** provider mappings, scheduled observations, run monitoring and historical backfill.
- **External opinion:** approved sources, provenance, deduplication, atomic observations and consensus lineage.
- **Watchlists:** permanent authenticated owners maintain private lists through owner-scoped RLS.
- **Alerts:** private definitions are evaluated from approved source families; state, runs and event history are persisted and idempotent.
- **Strategy laboratory:** private versioned strategy definitions, immutable test-run provenance, standard decision trees and persisted review outcomes.
- **Research documents:** TipTap-compatible JSON and structured embeds explain persisted assessments without replacing the structured score tables.

## Security boundaries

- Completed non-test Market output is deliberately published through explicit row and column boundaries.
- Control queues, orchestration state and trusted write functions remain internal.
- Public tables in exposed schemas use RLS and deliberate grants.
- Watchlist, alert and strategy workspaces require permanent authenticated ownership.
- Trusted calculation and orchestration functions are not browser APIs.
- Browser configuration contains no service-role or provider secret.
- Helper functions use safe search paths and qualified references.
- The non-relocatable `pg_net` extension remains isolated in its supported `net` schema with an accepted documented rationale.

## Deployment

`main` in `ClimbingBuddies/Trading` deploys to the single Vercel project `boulders-market`. The canonical public URL is https://discoverbouldersmarkets.vercel.app. Production-dependent claims require deployment and browser evidence, not only a successful source commit.

## AI-selected recommendation timing — 13 September 2026

The Daily Trading Controller now runs the Personal Recommendations stage after Market Assessment. The model chooses session entry/holding values; PostgreSQL validates and freezes evidence and computes future outcomes. Generation and evaluation are separate: the existing 15-minute database ledger evaluates only, while automatic fixed-rule publication is disabled. See automation/daily-personal-recommendations.md.

## Decision history and outcome tracking — v3

New recommendations are permanent decision journals: original root, linked AI updates and separately labelled personal notes, then append-only observations. The controller uses publish_decision_v3; the 15-minute job evaluates v3 alongside unchanged legacy records. Session forecasts v2 are retired for new publication, not deleted.
