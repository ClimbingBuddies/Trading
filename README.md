# Discover Boulders Markets

Trading dashboard application backed by Supabase and deployed to Vercel.

## Canonical deployment

Use only the following Vercel project for this repository:

- Vercel project: `discoverbouldersmarkets`
- Public URL: `https://discoverbouldersmarkets.vercel.app`

Do not use the historical duplicate Vercel projects `trading` or `trading-admin-monitor` for this application.

## Architecture

- GitHub: `ClimbingBuddies/Trading`
- Supabase project: `Trading`
- Supabase project ref: `glvbqcplgjdfgjyknzsa`
- Frontend: Next.js App Router with TypeScript
- Deployment: Vercel project `discoverbouldersmarkets`

Supabase owns scheduled market-data loading, persistence and Edge Functions. The Next.js application is the dashboard and drill-through presentation layer.

## Current dashboard

The first implemented area is Admin — Data Load Monitoring.

Routes:

- `/admin` — loading health, KPIs, daily observation volumes and recent sync history
- `/admin/loads/[id]` — drill-through to a specific sync run and observations loaded around that run

Future areas may include Markets, Assessments and Strategies, but they should remain within the same `discoverbouldersmarkets` Vercel application.

## Deployment rule

All future production dashboard changes from this repository should be deployed to `discoverbouldersmarkets`. Do not create a new Vercel project for individual pages or features unless this architecture is deliberately changed and documented here first.
