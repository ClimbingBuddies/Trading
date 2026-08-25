# Market Assessment access classification

**Project-plan item:** `SEC-001 — Define public/private Market Assessment access`  
**Decision date:** 19 August 2026  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Status:** Canonical access decision; implemented under SEC-002 and independently audited ([SEC-001 audit](../project-audits/SEC-001.md))

## Purpose

This document defines which Market Assessment data is publishable and which lifecycle/control capability is internal. It is the policy contract for `SEC-002`; it does not itself change database grants, RLS policies, functions, or frontend queries.

The public application currently has no user-specific Market Assessment feature. Therefore `authenticated` users receive the same published read surface as `anon` users. Authentication alone must not grant operational or administrative access.

## Access classes

### Public read-only output

A Market Assessment is publishable only when it belongs to a non-test run that has reached a truthful terminal result:

- run `analysis_mode` is not `test`;
- run status is `succeeded` or `partial`;
- the assessment is linked to that run;
- evidence is linked to that published assessment.

Public consumers may read the following output.

#### Published assessment result

Source: `public.gpt_market_assessments`, constrained to published runs.

Publishable fields:

- `assessment_id`
- `run_id` as a linkage identifier
- `instrument_id`
- `assessment_date`
- `rating`
- `confidence`
- `score`
- `summary`
- `bull_case`
- `bear_case`
- `technical_view`
- `macro_view`
- `valuation_view`
- `key_catalysts`
- `key_risks`
- `evidence_summary`
- `model_version`
- `methodology_version`
- `technical_engine_input_used`
- `created_at`

The related public instrument identity may be read from `public.instruments`.

#### Published supporting evidence

Source: `public.gpt_market_evidence`, constrained to evidence whose assessment is published.

Publishable fields:

- `evidence_id`
- `assessment_id`
- `evidence_type`
- `source_name`
- `source_url`
- `evidence_text`
- `relevance_score`
- `confidence`
- `created_at`

Source URLs and evidence text are intentionally part of the published research output. They must still be truthful, relevant, and free of privileged credentials or private operator notes.

#### Published run envelope

The public dashboard needs a small run envelope to identify the latest usable result and display its completion state. That public read model may expose only:

- `run_id`
- `started_at`
- `completed_at`
- `status`
- `analysis_cutoff_time`
- `tickers_requested`
- `tickers_completed`

It must filter out test and non-terminal runs. The full `public.gpt_market_runs` table is not the public contract.

### Internal operational data

The following are internal even if they are stored in the exposed `public` schema.

#### Full run-control record

`public.gpt_market_runs` is an operational control table. Its full record includes model/prompt metadata, analysis mode, working lifecycle state, notes, and test/history details. Direct client access to the whole table is not approved.

Internal-only fields include:

- `model_name`
- `prompt_version`
- `analysis_mode`
- `notes`
- non-terminal run state;
- test-run records;
- any future error, retry, task, or operator metadata.

Public access should use a constrained published-run view or equivalent API rather than direct table-wide `SELECT`.

#### Queue and scheduler records

These tables are internal-only:

- `public.market_assessment_queue`
- `public.market_assessment_schedule_log`

Their IDs, attempt counts, timestamps, run links, statuses, error messages, and notes are operational telemetry. They are not part of the public assessment product.

#### Orchestration functions

All functions that create, claim, progress, retry, or finalise Market Assessment work are internal-only, including:

- `prepare_chatgpt_market_assessment(date, text, text)`
- `finalize_chatgpt_market_assessment(bigint, uuid, text)`
- `claim_market_assessment_queue(text)`
- `begin_market_assessment_attempt(bigint)`
- `finalize_market_assessment_queue(bigint, text, uuid, text)`
- `queue_daily_market_assessment()`
- `process_market_assessment_queue()`

Execution is approved only for `service_role` or another future explicitly named trusted backend role. It is not approved for `PUBLIC`, `anon`, or `authenticated`.

### Write access

No browser/client role may insert, update, delete, truncate, or trigger writes on:

- `gpt_market_runs`
- `gpt_market_assessments`
- `gpt_market_evidence`
- `market_assessment_queue`
- `market_assessment_schedule_log`

Market Assessment writes are reserved for the trusted scheduled runner/backend using the service role. The service-role key must never be placed in frontend code or a `NEXT_PUBLIC_*` variable.

## Role matrix

| Resource/capability | `anon` | `authenticated` | trusted backend / `service_role` |
|---|---:|---:|---:|
| Published terminal non-test assessment results | SELECT | SELECT | Read/write as required |
| Published evidence linked to published assessments | SELECT | SELECT | Read/write as required |
| Constrained published run envelope | SELECT | SELECT | Read/write as required |
| Full `gpt_market_runs` records | No access | No access | Read/write |
| Test or non-terminal run state | No access | No access | Read/write |
| Queue and scheduler tables | No access | No access | Read/write |
| Orchestration functions | No execute | No execute | Execute |
| Assessment/output writes | No | No | Yes |

## SEC-002 live implementation — 19 August 2026

Migration `supabase/migrations/20260819055000_apply_deliberate_market_assessment_rls.sql` applies this classification without an RLS-bypassing view:

- `gpt_market_runs` uses a positive production-mode allowlist: only `analysis_mode = 'scheduled'`, terminal `succeeded`/`partial` rows with `completed_at` are client-visible;
- client column grants on `gpt_market_runs` expose only the seven-field run envelope; model, prompt, mode, notes and `created_at` remain internal;
- `gpt_market_assessments` and `gpt_market_evidence` use explicit current-column allowlists, so future columns remain private until deliberately granted;
- assessment policy membership is derived from the client-visible published-run set, and evidence membership is derived from the client-visible published-assessment set;
- all client write/table privileges remain absent;
- queue and schedule-log tables retain no client grants plus deny policies as defense in depth;
- all seven orchestration functions are non-executable by `PUBLIC`, `anon` and `authenticated`, with explicit `service_role` execution.

Builder verification as `anon` returned 1 published run, 30 assessments and 68 evidence rows. The two test runs, their 60 assessments and their 90 evidence rows were not visible. Selecting internal run columns returned PostgreSQL `42501 permission denied`.

The frontend now requests only the published run envelope; database policy, rather than browser-side filtering, determines which run is publishable.

## SEC-002 implementation and audit contract

`SEC-002 — Apply deliberate RLS policies` should:

1. preserve the unauthenticated `/assessments`, `/assessments/[symbol]`, and current Market summary reads;
2. provide a constrained public read model for terminal non-test runs;
3. constrain public assessments and evidence to that published run set;
4. revoke direct client access to the full `gpt_market_runs` table;
5. retain zero client writes across output and control tables;
6. retain zero client access to queue and schedule-log tables;
7. revoke orchestration-function execution from `PUBLIC`, `anon`, and `authenticated`;
8. grant only the minimum required read/execute privileges;
9. verify the public routes with a publishable key after the policy change.

If views are used, their ownership and `security_invoker` behaviour must be deliberate. A view must not accidentally bypass the intended underlying RLS boundary.

## Default rule for future fields and resources

New Market Assessment fields, tables, views, functions, and error/telemetry data are internal by default. They become public only after this document or a successor security decision explicitly classifies them and the public surface is verified not to expose credentials, private operator notes, or mutable control capability.

## SEC-002 strict-boundary completion — 20 August 2026

The temporary compatibility bridge created while Vercel served the legacy query has been removed. Migration `supabase/migrations/20260820013500_sec002_remove_legacy_frontend_compatibility.sql` revokes client access to `model_name`, `prompt_version`, `analysis_mode`, and `notes` after the corrected seven-field frontend query reached production.

Fresh Builder verification established:

- `anon` and `authenticated` can read exactly the approved seven-field run envelope;
- selecting the four internal legacy columns fails with PostgreSQL `42501`;
- the publication policies expose 2 of 4 runs, 60 of 120 assessments, and 128 of 218 evidence rows, exactly matching the current terminal `scheduled` set;
- client writes are absent across all five Market Assessment output/control tables;
- the queue and schedule-log tables remain client-inaccessible;
- all seven orchestration functions remain trusted-backend-only;
- production `/assessments`, `/assessments/NVDA`, and `/markets/NVDA` return HTTP 200 with real published data.

This dated Builder pre-flight evidence was independently reviewed and accepted under SEC-001; SEC-002 subsequently implemented the classified access boundary.
