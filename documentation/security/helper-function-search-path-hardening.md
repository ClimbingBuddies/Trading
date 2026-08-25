# Helper-function search-path hardening

**Project-plan item:** `SEC-003 — Harden helper-function search paths`  
**Implementation date:** 20 August 2026  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Status:** Builder implementation complete; awaiting independent audit

## Security decision

All application-owned helper functions in the exposed `public` schema use an empty fixed `search_path`.

An empty path is preferred over `search_path = public` for these helpers because it prevents a caller's session path or future schemas from changing object resolution. PostgreSQL continues to resolve built-ins from `pg_catalog`; every application table and row-type reference in the current function bodies is explicitly qualified with `public.`.

Canonical migration:

`supabase/migrations/20260820023000_harden_helper_function_search_paths.sql`

## Functions hardened

- `public.begin_market_assessment_attempt(bigint)`
- `public.claim_market_assessment_queue(text)`
- `public.enforce_market_ai_independence_metadata()`
- `public.finalize_chatgpt_market_assessment(bigint, uuid, text)`
- `public.finalize_market_assessment_queue(bigint, text, uuid, text)`
- `public.prepare_chatgpt_market_assessment(date, text, text)`
- `public.process_market_assessment_queue()`
- `public.queue_daily_market_assessment()`
- `public.set_trading_updated_at()`

The migration changes only per-function configuration. It does not replace function bodies, change signatures, alter `SECURITY DEFINER` attributes, or modify execution grants.

## Builder verification

Fresh live verification after applying the migration established:

- all nine functions report exactly `search_path=""` in `pg_proc.proconfig`;
- the existing `SECURITY DEFINER` status remains limited to the prepare and ChatGPT finalisation helpers;
- all seven Market Assessment orchestration functions remain non-executable by `anon` and `authenticated`, and executable by `service_role`;
- the independence-metadata and updated-at trigger functions remain attached to their existing triggers;
- `prepare_chatgpt_market_assessment` successfully returned the existing completed 19 August run as `already_complete=true`, with 30 requested and 30 completed;
- `claim_market_assessment_queue` returned no row for a deliberately nonexistent process name without changing queue state;
- the begin and finalisation helpers reached their expected missing-row validation paths under the empty search path;
- fresh Supabase Security Advisor output contains no `function_search_path_mutable` finding;
- the live migration history contains `harden_helper_function_search_paths`.

The separate `pg_net` extension warning was reviewed and explicitly accepted under completed task SEC-004; see [pg-net-extension-review.md](pg-net-extension-review.md).
