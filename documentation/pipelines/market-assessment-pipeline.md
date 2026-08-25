# Market Assessment Pipeline

## Purpose

The market-assessment layer creates a recurring research assessment for the tracked instrument universe and persists both the assessment output and supporting evidence.

The primary orchestration model is now a **ChatGPT Scheduled Task with access to the connected Trading Supabase project**.

## Current architecture

```text
Supabase pg_cron
   |
   +--> full-twelve-data-load every 15 minutes
           |
           +--> market_observations
           +--> sync_runs

ChatGPT Scheduled Task
   |
   +--> check current New York date and market-data freshness
   |
   +--> prepare_chatgpt_market_assessment()
   |       |
   |       +--> market_assessment_queue
   |       +--> gpt_market_runs
   |
   +--> read instruments / observations / available research context
   |
   +--> perform assessment/research
   |
   +--> gpt_market_assessments
   |       |
   |       +--> gpt_market_evidence
   |
   +--> finalize_chatgpt_market_assessment()
           |
           +--> finalise gpt_market_runs
           +--> finalise market_assessment_queue
```

## Scheduling ownership

The old Supabase pg_cron job `daily_market_assessment` has been removed from the live scheduler.

Daily assessment scheduling is owned by ChatGPT Scheduled Tasks instead.

This avoids two independent schedulers trying to create or consume the same work.

The Twelve Data market-data schedule remains in Supabase and continues to operate independently.

## Recommended schedule

Run the ChatGPT task on weekdays after US market close, preferably around **6:15 pm `America/New_York`**.

The task should check the latest Supabase market observations before creating an assessment run. If the data is stale or there is clearly no valid market session to assess, it should stop and report the reason rather than manufacture a completed run.

## Queue and run lifecycle

The queue exists as an audit/control ledger rather than as the scheduler itself.

Lifecycle:

```text
pending -> processing -> succeeded
                      -> partial
                      -> failed
```

`market_assessment_queue` tracks:

- run date
- process name
- attempt count
- started/updated/processed timestamps
- error message
- linked GPT run ID

## Function: `prepare_chatgpt_market_assessment()`

Purpose: safely create or resume the current assessment run.

Behaviour:

1. Defaults to the current date in `America/New_York`.
2. Creates the queue row if one does not exist.
3. Reuses the existing queue/run on retries.
4. Creates one `gpt_market_runs` record when needed.
5. Sets `tickers_requested` from the current active-instrument count.
6. Returns `already_complete = true` when that date has already succeeded.
7. Otherwise moves the queue to `processing` and increments the attempt count.

This is the main idempotency control for the scheduled task.

## Assessment writes

The scheduled task assesses only instruments that do not yet have a row for the current `run_id`.

The database already enforces:

```text
UNIQUE (run_id, instrument_id)
```

Assessment rows contain:

- rating
- confidence
- score
- summary
- bull case
- bear case
- technical view
- macro view
- valuation view
- catalysts
- risks
- evidence summary
- model/version label

Evidence rows can capture:

- evidence type
- source name
- source URL
- evidence text
- relevance score
- confidence

Where current external information is needed, the ChatGPT task can use web research and should persist concise supporting evidence rather than unsupported conclusions.

## Function: `finalize_chatgpt_market_assessment()`

Purpose: finish the run from the rows actually written.

Behaviour:

- counts assessment rows for the `run_id`;
- updates `tickers_completed`;
- sets `completed_at`;
- derives final status:
  - all requested completed -> `succeeded`
  - some completed -> `partial`
  - none completed -> `failed`
- applies the same final status to the linked queue row.

## Retry behaviour

A retry must not create another run for the same date.

The retry path:

1. calls `prepare_chatgpt_market_assessment()`;
2. reuses the returned `run_id`;
3. queries which active instruments are still missing from that run;
4. assesses only the missing instruments;
5. finalises again when finished.

This lets an interrupted scheduled run resume safely.

## Historical queue and test rows — resolved

OPS-007 terminally superseded the seven unattempted legacy queue requests from 3–11 August 2026 without replaying them or creating replacement GPT runs. Their original schedule logs remain preserved.

The earlier 1 August test dataset remains preserved with its original assessment/evidence content. OPS-007 truthfully finalised its lifecycle from the persisted rows rather than treating it as a new unattended production run.

The current Scheduled Task uses the current New York assessment date and does not automatically claim historical backlog.

## Inactive fallback/prototype

The Supabase Edge Function `daily-market-assessment-worker` remains deployed but is not scheduled and has no OpenAI API credential configured.

It is retained as a fallback/prototype only. The primary architecture does not require an OpenAI API key because ChatGPT Scheduled Tasks provide the reasoning layer directly.

## Operational definition of done

This pipeline is considered operational when one real scheduled task run:

- executes without the user being online;
- reads current Supabase market data;
- prepares the correct date/run;
- assesses all active instruments;
- writes assessment/evidence rows;
- finalises both run and queue correctly;
- can be retried without duplicates;
- reports its final status to the user.
