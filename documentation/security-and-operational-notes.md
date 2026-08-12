# Security and Operational Notes

This document records the current Supabase access model and known security/operational issues observed on 12 August 2026.

No remediation in this document should be applied blindly. RLS changes can immediately change what the public dashboard can read.

## 1. Frontend credential model

The Next.js frontend uses:

- the Supabase project URL;
- the Supabase publishable key.

It does **not** use:

- `SUPABASE_SERVICE_ROLE_KEY`;
- `TWELVE_DATA_API_KEY`.

The service-role key and Twelve Data API key are used only in Supabase Edge Functions.

The publishable key is not a privileged secret, but environment configuration should still be preferred over hard-coding environment-specific values in source code.

## 2. Edge Function authentication

Both active Trading Edge Functions currently have JWT verification enabled:

- `full-twelve-data-load`
- `test-twelve-data-load`

The scheduled market-data job calls `full-twelve-data-load` using the project publishable key stored in Supabase Vault.

## 3. Public dashboard read policies

The following RLS-enabled tables currently have explicit read policies for the public dashboard:

- `data_providers`
- `instruments`
- `provider_instruments`
- `market_observations`
- `sync_runs`

These policies allow `SELECT` to `anon` and `authenticated` roles.

This is why the unauthenticated public dashboard can display market and loader information.

The strategy decision-tree tables expose only the system template to anonymous users:

- `trading_decision_trees`
- `trading_decision_nodes`
- `trading_decision_edges`

## 4. Owner-specific strategy policies

The strategy layer is designed for authenticated user ownership.

Tables include:

- `trading_strategies`
- `trading_test_runs`
- `trading_decision_evaluations`

Owner-specific policies use `owner_user_id = auth.uid()`.

System decision-tree templates can be read by authenticated users, while user-owned trees/nodes/edges remain owner-specific.

## 5. Critical RLS issue: five public tables have RLS disabled

Supabase Security Advisor currently reports RLS disabled on:

- `market_assessment_schedule_log`
- `market_assessment_queue`
- `gpt_market_runs`
- `gpt_market_assessments`
- `gpt_market_evidence`

Because these tables are in the exposed `public` schema, Supabase flags this as an ERROR-level security issue.

Reference:

https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public

### Important caution

Do not simply enable RLS without first defining the intended policies.

The current public Assessments dashboard reads `gpt_market_runs`, `gpt_market_assessments` and `gpt_market_evidence`. Enabling RLS with no policies would immediately make these datasets disappear from the public application.

A deliberate access decision is required first:

- keep assessment results public read-only; or
- require authentication for assessments; or
- expose a constrained public view/API while protecting internal run/evidence tables.

The queue and scheduler log should normally not need public write access.

## 6. RLS enabled but no policies

Supabase Security Advisor reports RLS enabled with no policies on:

- `alert_events`
- `alerts`
- `app_settings`
- `instrument_opinion_consensus`
- `instrument_opinions`
- `opinion_reviews`
- `opinion_sources`
- `technical_indicators`
- `watchlist_items`
- `watchlists`

Reference:

https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

For the publishable-key frontend, these tables are effectively unavailable unless a service-role process writes/reads them or appropriate policies are deliberately added.

This is not necessarily wrong for scaffolded features, but it must be considered when implementing their UI.

## 7. Function search-path warnings

Supabase Security Advisor reports mutable `search_path` warnings for:

- `queue_daily_market_assessment()`
- `process_market_assessment_queue()`

Reference:

https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

These functions should eventually set an explicit safe search path and/or fully qualify referenced tables.

## 8. `pg_net` extension warning

Supabase Security Advisor reports that `pg_net` is installed in the public schema.

Reference:

https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public

This should be reviewed before production hardening.

## 9. Assessment pipeline operational issue

Seven daily assessment queue rows are currently pending and unprocessed.

The scheduler is creating work, but no active end-to-end consumer is finalising the queue.

The existing GPT test run is also inconsistent:

- 30 assessment rows exist;
- 30 evidence rows exist;
- the run is still `running`;
- `tickers_completed = 0`;
- `completed_at` is null.

This is a data-quality/operational issue rather than a frontend issue.

## 10. Current GitHub configuration note

`lib/supabase.ts` contains fallback literals for the Supabase URL and publishable key.

The publishable key is intended for public client use, but storing environment-specific fallback values in source code makes project separation and key rotation harder.

Recommended direction:

- use `NEXT_PUBLIC_SUPABASE_URL`;
- use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
- remove environment-specific fallback values once deployment variables are confirmed.

## 11. Security review priority

Recommended order:

1. Decide the intended public/authenticated access model for GPT assessments.
2. Enable RLS on the five exposed assessment/queue tables with deliberate policies.
3. Protect queue and scheduler tables from public mutation.
4. Add policies only when the corresponding watchlist/opinion/alert features are implemented.
5. Harden database function search paths.
6. Review the `pg_net` extension placement.
7. Move frontend Supabase configuration fully to environment variables.

## Operational principle

Do not weaken RLS simply to make a new dashboard page populate. Decide the feature's audience first, then create the narrowest read/write policy required for that audience.
