# Automated Market History Maintenance

**Status:** Production active  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Historical provider:** Tiingo  
**Worker:** `market-history-maintenance-worker`

## Purpose

Automatically maintain daily Tiingo history and derived technical trend data for:

- active Trading-universe instruments;
- instruments added to a Watch List; and
- uniquely resolved Opportunity exposure tickers.

The Watch List and Opportunity business tables remain separate. Both resolve into the canonical `public.instruments` and `public.market_observations` data layer.

## Components

- `public.market_history_jobs`: service-only durable queue.
- `market_history.enqueue_job`: deduplicated queue insertion.
- `watchlist_item_enqueue_history`: trigger on `public.watchlist_items`.
- `opportunity_ticker_enqueue_history`: trigger on active `public.opportunity_theme_external_instruments`.
- `market_history.enqueue_daily_jobs`: builds the deduplicated daily eligible universe.
- `public.claim_market_history_job`: service-role-only atomic claim using `FOR UPDATE SKIP LOCKED`.
- `market-history-maintenance-worker`: processes exactly one provider request per execution.
- `public.refresh_market_trends_for_instrument`: recalculates existing Technical Engine indicators and market scores for the updated instrument.

## Initial history

When a Watch List or Opportunity ticker is added:

1. the database trigger creates a deduplicated `initial_backfill` job;
2. the worker verifies the canonical instrument and active Tiingo mapping;
3. if no Tiingo daily history exists, the worker invokes the proven `backfill-market-history` function for up to five years;
4. if history already exists, the worker requests only dates after the latest stored day;
5. observations are upserted on the canonical provider/date key;
6. trend indicators and market scores are refreshed immediately.

Opportunity-only instruments may remain inactive. The worker does not add them to the active Market Assessment universe.

## Daily close maintenance

At 22:30 UTC each day, Supabase Cron calls `market_history.enqueue_daily_jobs()`.

The eligible set is the union of:

- `instruments.is_active = true`;
- `watchlist_items.instrument_id`; and
- active Opportunity exposure symbols that resolve uniquely to `instruments`.

The union is deduplicated by instrument. The worker runs every two minutes and processes one job per tick, maintaining the existing conservative Tiingo pacing.

For each instrument, the request begins on the day after its latest Tiingo `1day` observation and ends on the current UTC date. Weekends and market holidays may legitimately return zero new rows and are treated as a successful no-data update.

## Mapping exceptions

An Opportunity exposure that does not resolve to exactly one canonical instrument is recorded as `mapping_required`. No provider symbol is guessed and no Tiingo request is made. Once its canonical instrument and active Tiingo provider mapping are established, it can be requeued.

## Statuses

- `pending`
- `running`
- `succeeded`
- `already_complete`
- `mapping_required`
- `validation_required`
- `failed`

Temporary failures are retried up to three total attempts with a delayed retry. Every provider request creates or reuses the existing `sync_runs` audit trail.

## Security

The queue has RLS enabled and no client policy. Client roles have no direct table access. Claiming and per-instrument trend refresh RPCs are executable only by `service_role`. The Edge Function requires a valid JWT, and provider/admin credentials remain Supabase secrets.

## Cron jobs

- `market-history-maintenance-worker-every-2-minutes`: invokes one queue-worker iteration.
- `market-history-daily-close-enqueue`: creates the daily incremental queue at 22:30 UTC.

## Verification evidence — 26 August 2026

- The authenticated Edge Function invocation returned HTTP 200.
- AMD and QQQ initial Watch List reconciliation succeeded.
- The corrected incremental branch processed CHKP using five new daily rows rather than downloading five years again.
- The existing Technical Engine was confirmed to source every instrument with Tiingo `1day` history, so Watch List and Opportunity instruments receive the same indicator and market-score methodology.
