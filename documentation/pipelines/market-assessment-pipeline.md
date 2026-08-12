# Market Assessment Pipeline

## Purpose

The market-assessment layer is designed to create a scheduled daily research assessment for the tracked instrument universe and persist both the assessment output and supporting evidence.

The database model is substantially built, but the current end-to-end automation is incomplete.

## Current architecture

```text
pg_cron
   |
   v
queue_daily_market_assessment()
   |
   +--> market_assessment_queue
   +--> market_assessment_schedule_log

market_assessment_queue
   |
   v
[analysis consumer / worker not yet connected end-to-end]
   |
   v
gpt_market_runs
   |
   +--> gpt_market_assessments
             |
             +--> gpt_market_evidence
```

## Daily scheduler

pg_cron job:

- name: `daily_market_assessment`
- schedule: `0 22,23 * * 1-5`
- active: true

The two UTC trigger hours exist to cover New York daylight-saving and standard-time changes.

The scheduled command is:

```sql
SELECT queue_daily_market_assessment();
```

## Function: `queue_daily_market_assessment()`

Purpose: create one daily assessment request at 6:00 pm New York time.

Behaviour:

1. Converts the current time to `America/New_York`.
2. Returns immediately unless the New York hour is 18.
3. Inserts a row into `market_assessment_queue` for the New York business date.
4. Uses `(run_date, process_name)` conflict protection to prevent duplicate daily queue rows.
5. Adds an audit row to `market_assessment_schedule_log`.

The queue record uses:

- `status = 'pending'`
- `process_name = 'daily_market_assessment'`

## Function: `process_market_assessment_queue()`

Purpose: move the current day's pending queue request to an analysis-ready state.

Behaviour:

- changes today's `pending` queue rows to `ready_for_analysis`;
- writes a `ready` audit record to `market_assessment_schedule_log`.

Important: no active pg_cron job currently calls this function, and the live queue rows remain `pending`.

## Current queue state

As reviewed on 12 August 2026, seven scheduled requests existed for business dates from 3 August through 11 August 2026.

All seven remained:

- `status = 'pending'`
- `processed_at = null`

This confirms that queue creation is working but downstream queue consumption is not operating.

## GPT run model

### `gpt_market_runs`

One current test run exists.

Observed values:

- analysis mode: `test`
- prompt version: `v1.0`
- model name: `gpt-5.4-thinking-mini`
- tickers requested: 30
- status: `running`
- tickers completed: 0
- completed_at: null

The notes identify this as a test run intended to validate the independent GPT market-assessment pipeline.

## GPT assessment model

### `gpt_market_assessments`

There are 30 current assessment rows, matching the 30 active instruments.

Each assessment can store:

- rating
- score
- confidence
- summary
- bull case
- bear case
- technical view
- macro view
- valuation view
- catalysts
- risks
- evidence summary
- model version

These rows are currently used by the Assessments dashboard and by Markets instrument drill-through.

## Evidence model

### `gpt_market_evidence`

There are 30 current evidence rows.

Evidence records support an assessment with:

- evidence type
- source name
- source URL
- evidence text
- relevance score
- confidence

The frontend assessment detail page queries these rows by `assessment_id`.

## Current inconsistency

The database currently contains:

- 30 assessment rows;
- 30 evidence rows;
- one GPT run still marked `running`;
- `tickers_completed = 0`;
- no `completed_at` value.

This means the assessment records were successfully created, but run-finalisation metadata was not updated.

The frontend deliberately surfaces this as a data-quality warning instead of silently treating the run as complete.

## Missing end-to-end pieces

The following linkages are not currently operational:

1. A scheduled process that calls `process_market_assessment_queue()` or otherwise claims pending queue work.
2. An analysis worker or Edge Function that converts a queue item into a `gpt_market_runs` record and executes the assessment process.
3. Finalisation logic that updates `tickers_completed`, `completed_at` and the run status.
4. Queue completion logic that updates `market_assessment_queue.processed_at` and final status.
5. Error/retry handling for partial assessment runs.

## Recommended future state

```text
6:00 pm New York
      |
      v
queue_daily_market_assessment()
      |
      v
pending queue row
      |
      v
assessment worker claims row
      |
      +--> queue status = processing
      +--> create gpt_market_run
      |
      v
analyse active instrument universe
      |
      +--> gpt_market_assessments
      +--> gpt_market_evidence
      |
      v
finalise run
      |
      +--> tickers_completed
      +--> completed_at
      +--> succeeded / partial / failed
      |
      v
finalise queue row
```

## Documentation rule

The current 30 assessment records should be described as a successful **test dataset**, not as proof that the daily scheduled assessment pipeline is fully automated.
