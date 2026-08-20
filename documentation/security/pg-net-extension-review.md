# pg_net extension review

**Project-plan item:** `SEC-004 — Review pg_net warning`  
**Review date:** 20 August 2026  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Builder decision:** Explicitly accept the current advisory with the bounded rationale below; do not relocate or reinstall the extension.

## Finding

Supabase Security Advisor reports `extension_in_public` because the installed `pg_net` row has `pg_extension.extnamespace = public`.

That catalog label does not correspond to application objects in the exposed `public` schema:

- Installed version: `0.20.4`.
- `extrelocatable = false`.
- Extension control metadata has no fixed installation schema.
- The extension owns the dedicated `net` schema.
- The extension has zero function, relation, type, or schema members in `public`.
- All inspected extension members are in `net`, including `net.http_post`, `net.http_get`, the request queue, and response table.

This matches pg_net's upstream design: enabling the extension creates its own `net` schema to avoid naming conflicts.

## Current application usage

Exactly one Trading application dependency was found outside the extension's own Supabase-managed grant hook:

- Active pg_cron job `trading-market-data-every-15-minutes`
- Schedule: `*/15 * * * *`
- Database role: `postgres`
- Operation: schema-qualified `net.http_post(...)`
- Target: the `full-twelve-data-load` Edge Function
- URL and publishable key: read from Supabase Vault at execution time

No repository file or application-owned database function was found that exposes arbitrary pg_net URLs or payloads.

The five most recent inspected cron executions succeeded. Matching `sync_runs` at 15-minute intervals also reached `succeeded`; the latest inspected run started at `2026-08-20 03:30:01+00`, completed at `03:30:03+00`, and persisted one requested/received/inserted observation.

## Decision and rationale

The warning is explicitly accepted for the current configuration.

A direct `ALTER EXTENSION pg_net SET SCHEMA ...` is unsupported because the installed extension is non-relocatable. Dropping and recreating pg_net merely to change its catalog namespace would interrupt an active production scheduler, discard transient unlogged request/response state, and recreate the same dedicated `net` object schema. That operational risk is not justified when there are no pg_net members in `public` and current usage follows Supabase's documented pg_cron + pg_net + Vault pattern.

The Builder deliberately did not:

- edit PostgreSQL system catalogs;
- drop or recreate pg_net;
- change Supabase-managed extension grants;
- alter the loader schedule or its Vault-backed request;
- suppress or misrepresent the remaining advisor notice.

The Security Advisor warning is expected to remain visible as an acknowledged catalog-placement finding.

## Revisit conditions

Re-open this decision if any of the following becomes true:

1. Supabase provides an official in-place relocation path for pg_net.
2. A future pg_net release becomes relocatable or changes its object layout.
3. Any pg_net extension member appears in `public`.
4. Application-owned functions begin accepting caller-controlled URLs, headers, or payloads for pg_net.
5. The loader no longer depends on the current pg_cron/pg_net path.
6. Supabase raises the advisor severity or publishes guidance specific to this catalog-placement case.

## Builder verification evidence

- Fresh `pg_extension` and `pg_available_extension_versions` inspection.
- Full extension-member namespace inventory.
- Live application-function and pg_cron caller search.
- Current schema/function privilege inspection.
- `net.check_worker_is_up()` completed without raising an exception.
- Five recent successful cron executions.
- Eight recent successful loader `sync_runs`.
- Fresh Supabase Security Advisor result, including the acknowledged warning.
- Fresh GitHub search for pg_net references.
- Prior independent audit record check: `documentation/project-audits/SEC-004.md` does not yet exist.

## Authoritative references

- Supabase pg_net documentation: https://supabase.com/docs/guides/database/extensions/pg_net
- Supabase scheduled Edge Function pattern: https://supabase.com/docs/guides/functions/schedule-functions
- Upstream pg_net repository: https://github.com/supabase/pg_net
- Advisor remediation page: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
