# Security and Operational Notes

This document records Supabase access and operational findings first observed on 12 August 2026 and re-verified where noted on 19 August 2026.

No remediation in this document should be applied blindly. RLS changes can immediately change what the public dashboard can read.

The canonical Market Assessment public/private decision is now [Market Assessment Access Classification](security/market-assessment-access-classification.md).

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

## 5. Market Assessment access — re-verified 19 August 2026

The earlier RLS-disabled finding is resolved in live Supabase:

- RLS is enabled on `gpt_market_runs`, `gpt_market_assessments`, `gpt_market_evidence`, `market_assessment_queue` and `market_assessment_schedule_log`;
- `anon` and `authenticated` currently have read-only access to the three GPT output/run tables;
- queue and schedule-log client access is explicitly blocked;
- no client write grants exist on the five tables.

The formal access decision is recorded in [Market Assessment Access Classification](security/market-assessment-access-classification.md). It classifies terminal non-test assessment output and linked evidence as public read-only, while full run control, test/non-terminal state, queues, scheduler logs, writes and orchestration functions are internal.

`SEC-002` must narrow the current broad table reads to that approved publication boundary while preserving the public Assessments routes. It must also revoke client execution from the two legacy scheduler functions that remain callable by `anon` and `authenticated`.


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

## 9. Historical Market backlog — resolved

The earlier seven-row orphan queue backlog and stale 1 August test-run lifecycle were resolved non-destructively under `OPS-007`.

The test run is terminal at 30/30 from its persisted assessment rows. The seven unattempted queues are terminally superseded without replay or replacement GPT runs, and their schedule logs remain preserved. See `documentation/project-audits/OPS-007.md`.


## 10. Current GitHub configuration note

`lib/supabase.ts` contains fallback literals for the Supabase URL and publishable key.

The publishable key is intended for public client use, but storing environment-specific fallback values in source code makes project separation and key rotation harder.

Recommended direction:

- use `NEXT_PUBLIC_SUPABASE_URL`;
- use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
- remove environment-specific fallback values once deployment variables are confirmed.

## 11. Security review priority

Recommended order:

1. Apply the approved Market Assessment access classification under `SEC-002`, preserving public assessment reads while narrowing run/output access and revoking client orchestration-function execution.
2. Harden helper-function search paths under `SEC-003`.
3. Review the `pg_net` extension placement under `SEC-004`.
4. Move frontend Supabase configuration fully to environment variables under `SEC-005`.
5. Add policies only when corresponding watchlist/opinion/alert features are implemented.


## Operational principle

Do not weaken RLS simply to make a new dashboard page populate. Decide the feature's audience first, then create the narrowest read/write policy required for that audience.
