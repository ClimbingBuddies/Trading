# Phase 2 Implementation Progress

This document tracks implementation against the [Trading Platform Functional Roadmap](functional-roadmap.md).

Last reviewed: 12 August 2026.

## Priority 1 — Complete daily market-assessment automation

**Current status: In progress — orchestration layer deployed, model execution not yet activated.**

### Completed in this phase

The assessment queue now has an explicit worker lifecycle.

Added to `market_assessment_queue`:

- `started_at`
- `updated_at`
- `attempt_count`
- `error_message`
- `gpt_run_id`

Added database functions:

- `claim_market_assessment_queue()` — atomically claims the oldest eligible pending/ready queue item using `FOR UPDATE SKIP LOCKED` and moves it to `processing`.
- `begin_market_assessment_attempt()` — records additional worker attempts for a processing queue item.
- `finalize_market_assessment_queue()` — finalises a processing item as `succeeded`, `partial` or `failed` and links it to the GPT run.

The existing scheduler functions were also recreated with an explicit `search_path = public`:

- `queue_daily_market_assessment()`
- `process_market_assessment_queue()`

This removes the mutable-search-path warning for those function definitions and makes table resolution explicit.

### New Edge Function

Deployed:

`daily-market-assessment-worker`

Authentication:

- JWT verification enabled.
- Database operations use the server-side Supabase service role inside the Edge Function.
- The service-role key is not exposed to the frontend.

The worker is designed to:

1. continue an existing `processing` queue item or atomically claim the oldest eligible pending item;
2. create and link a `gpt_market_runs` row;
3. identify which active instruments have not yet been assessed for that run;
4. process a small configurable batch per invocation;
5. read recent market observations plus available opinion/consensus data;
6. call the OpenAI Responses API with a strict structured-output schema;
7. write `gpt_market_assessments` and `gpt_market_evidence`;
8. update `tickers_completed` after every batch;
9. retry incomplete runs across later invocations;
10. finalise the GPT run and queue as `succeeded`, `partial` or `failed`.

Default worker controls:

- batch size: 3 instruments per invocation;
- maximum batch size: 5;
- maximum attempts: 12 by default;
- web search can be enabled/disabled by environment configuration.

### Safety behaviour

The worker checks its OpenAI configuration **before claiming queue work**.

Required Edge Function secrets/configuration:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`

Optional:

- `OPENAI_ENABLE_WEB_SEARCH` — defaults to `true` when the worker is activated.

If the required OpenAI configuration is missing, the function returns HTTP 503 and leaves the queue unchanged.

### Tests completed

#### Dry-run test

A dry-run invocation returned HTTP 200 and discovered all seven historical queue rows.

All seven were still:

- `status = pending`
- `attempt_count = 0`
- `gpt_run_id = null`

No queue item was claimed and no GPT run was created.

#### Activation-gate test

A normal invocation without the OpenAI configuration returned HTTP 503 with the expected configuration message.

A follow-up database check confirmed:

- 7 queue rows remain pending;
- no attempt counts were incremented;
- no historical work was consumed.

### Source control

The Supabase changes are now represented in GitHub:

- `supabase/migrations/20260812_phase2_assessment_queue_lifecycle.sql`
- `supabase/migrations/20260812_phase2_assessment_worker_attempts.sql`
- `supabase/functions/daily-market-assessment-worker/index.ts`
- `supabase/functions/daily-market-assessment-worker/deno.json`

This keeps GitHub and the live Supabase implementation aligned for collaboration.

## Remaining decisions before activation

### 1. OpenAI credential

The Trading project does not currently have an `OPENAI_API_KEY` available to this worker.

The key must be added as a Supabase Edge Function project secret before model execution can be tested.

### 2. Model selection

The worker deliberately does not hard-code a production model choice.

`OPENAI_MODEL` must be explicitly configured so model choice and cost are deliberate and can be changed without redeploying code.

### 3. Historical backlog

Seven historical queue requests currently exist.

Before a recurring worker schedule is enabled, decide whether to:

- replay all seven historical assessment dates;
- process only the most recent queue item and mark older ones as superseded/skipped; or
- clear/archive the old queue and start automation from the next scheduled business day.

No historical queue item has been changed during this implementation pass.

### 4. Worker schedule

The daily queue scheduler is already active, but the new Edge Function is **not yet attached to pg_cron**.

This is deliberate. Activating it before the OpenAI key/model and backlog policy are decided could create unnecessary API usage or replay historical jobs unintentionally.

## Suggested next implementation step

1. Decide how to handle the seven historical queue rows.
2. Add the OpenAI API key as a Supabase Edge Function secret.
3. Choose the initial `OPENAI_MODEL`.
4. Run one controlled queue item with a small batch size.
5. Inspect the first generated assessment/evidence records for quality and structure.
6. Complete one full 30-instrument run manually through repeated worker invocations.
7. Only after that succeeds, add a recurring pg_cron invocation for the worker.
8. Then move to Phase 2 Priority 2: assessment RLS/security hardening.

## Definition of done for Priority 1

Priority 1 is not complete until:

- a scheduled queue row is automatically claimed;
- all active instruments are assessed;
- evidence is persisted;
- the GPT run reaches a terminal status;
- `tickers_completed` is accurate;
- the queue item reaches a terminal status;
- partial failures are retained and retried safely;
- the recurring worker schedule is active;
- one full scheduled production-style run has been verified end-to-end.
