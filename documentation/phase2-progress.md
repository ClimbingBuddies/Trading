# Phase 2 Implementation Progress

This document tracks implementation against the [Trading Platform Functional Roadmap](functional-roadmap.md).

Last reviewed: 12 August 2026.

## Priority 1 — Complete daily market-assessment automation

**Current status: In progress — ChatGPT Scheduled Task architecture prepared; first scheduled run not yet created.**

## Architecture decision

The daily assessment intelligence layer will run as a **ChatGPT Scheduled Task with access to the connected Supabase app**.

Supabase remains responsible for:

- market-data ingestion;
- persistent market observations;
- queue/run lifecycle state;
- assessment/evidence storage;
- dashboard data.

ChatGPT is responsible for:

- the daily assessment schedule;
- reading the current Trading data from Supabase;
- performing the research/assessment;
- writing assessment/evidence rows back to Supabase;
- finalising the run and reporting the outcome.

This means the Trading project does not require an OpenAI API key for the primary assessment path.

## Current target flow

```text
ChatGPT Scheduled Task (weekday evening, America/New_York)
        |
        v
check market-data freshness
        |
        v
prepare_chatgpt_market_assessment()
        |
        +--> create/resume market_assessment_queue row
        +--> create/resume gpt_market_runs row
        |
        v
read 30 active instruments + market history + available research context
        |
        v
ChatGPT assessment/research
        |
        +--> gpt_market_assessments
        +--> gpt_market_evidence
        |
        v
finalize_chatgpt_market_assessment()
        |
        +--> tickers_completed
        +--> completed_at
        +--> succeeded / partial / failed
        |
        v
notify user with run summary
```

## Supabase changes completed

The assessment queue has an explicit lifecycle with:

- `started_at`
- `updated_at`
- `attempt_count`
- `error_message`
- `gpt_run_id`

Existing lifecycle helpers remain available:

- `claim_market_assessment_queue()`
- `begin_market_assessment_attempt()`
- `finalize_market_assessment_queue()`

Two ChatGPT-task-specific helpers have now been added:

### `prepare_chatgpt_market_assessment()`

- defaults to the current `America/New_York` date;
- creates today's queue row if one does not exist;
- resumes the existing queue/run on retries;
- creates one `gpt_market_runs` record if required;
- records the active-instrument count in `tickers_requested`;
- returns immediately with `already_complete = true` if the date already succeeded;
- moves unfinished work to `processing` and increments `attempt_count`.

### `finalize_chatgpt_market_assessment()`

- counts actual `gpt_market_assessments` rows for the run;
- updates `tickers_completed`;
- sets `completed_at`;
- derives `succeeded`, `partial` or `failed` from actual completed rows;
- finalises the linked queue row with the same status.

Both helpers are server/admin operations and are not exposed to anonymous or authenticated Data API roles.

## Scheduling change

The former Supabase pg_cron job `daily_market_assessment` has been **unscheduled**.

Reason: ChatGPT Scheduled Tasks now own daily assessment scheduling. Keeping both schedulers would risk duplicate orchestration.

The **market-data** pg_cron schedule remains unchanged and continues to call `full-twelve-data-load` every 15 minutes.

## Historical backlog

Seven historical queue requests from 3–11 August 2026 remain untouched.

The ChatGPT Scheduled Task should operate on the **current New York date only** and must not use the older `claim oldest queue item` path. This prevents stale historical assessments being replayed accidentally.

A later cleanup can mark those legacy rows as superseded/archived once the new scheduled path is proven.

## Previous Edge Function experiment

`daily-market-assessment-worker` remains deployed but is **not the primary architecture**.

It has:

- no recurring pg_cron schedule;
- no OpenAI API key configured;
- an activation gate that returns 503 before claiming work when configuration is missing.

It should be treated as an inactive fallback/prototype unless the platform later moves from ChatGPT Scheduled Tasks to direct OpenAI API orchestration.

## Source control

Relevant source-controlled changes include:

- `supabase/migrations/20260812_phase2_assessment_queue_lifecycle.sql`
- `supabase/migrations/20260812_phase2_assessment_worker_attempts.sql`
- `supabase/migrations/20260812_phase2_chatgpt_task_helpers.sql`
- `supabase/migrations/20260812_disable_supabase_daily_assessment_cron.sql`
- `supabase/functions/daily-market-assessment-worker/` (inactive fallback/prototype)

## Next controlled test

1. Create the ChatGPT Scheduled Task.
2. Set it for a weekday after US market close (recommended 6:15 pm `America/New_York`).
3. On each run, check that today's market data is sufficiently fresh before creating an assessment run.
4. Call `prepare_chatgpt_market_assessment()` for today's New York date.
5. If `already_complete = true`, stop without writing anything.
6. Assess only instruments missing from that `run_id` so retries are idempotent.
7. Upsert assessment rows using the existing unique `(run_id, instrument_id)` constraint.
8. Persist supporting evidence.
9. Call `finalize_chatgpt_market_assessment()`.
10. Report requested/completed/final status to the user.

## Definition of done for Priority 1

Priority 1 is complete when:

- a ChatGPT Scheduled Task runs unattended;
- it reads the connected Trading Supabase project successfully;
- the correct current-date queue/run is created or resumed;
- all active instruments are assessed;
- evidence is persisted;
- retries do not duplicate assessments;
- `tickers_completed` is accurate;
- the GPT run and queue row reach a terminal status;
- the user receives a completion summary;
- at least one complete scheduled production-style run is verified end-to-end.
