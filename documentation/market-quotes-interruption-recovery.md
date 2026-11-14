# Interrupted quote worker recovery

## Incident and bounded change — 14 November 2026

The first genuine four-hour cycles on 11 November at 03:00 and 07:00 UTC each completed two batches and saved ten quotes. The 11:00 request returned HTTP 503 and left its eight-symbol receipt running. Five nearby quote observations were stored, while final receipt counters remained zero. The running gate then prevented later cycles. The platform's precise reason for the 503 is unconfirmed.

`scripts/market-quotes-interruption-recovery.sql` adds service-only `recover_twelve_data_interrupted_runs_v1(uuid)` and replaces the existing claim procedure. Under the same transaction advisory lock, recovery accepts only structurally valid version 2/3 running receipts, with exact canonical cycle keys, distinct UUID selections and consistent timestamps/counts. Both receipt timestamps must be more than ten minutes old. This exceeds the documented hosted Edge worker maximum of 400 seconds, checked 14 November against [Supabase limits](https://supabase.com/docs/guides/functions/limits). This expiry applies only to hosted quote executions; development coordination locks never expire automatically.

Recovery marks the receipt failed/interrupted and explicitly records unverified completion counts. It preserves original selections, recorded counters, prior error text, prices and history. Delayed database requests can outlive the worker; recovery does not certify final insert counts or erase their results. Malformed, recent and unknown legacy receipts remain blocking. The two previously reviewed exact legacy exceptions remain unchanged. Same-cycle selected IDs remain consumed; recovery adds a 60-second cooldown and does not permit retries to exceed the provider budget.

The worker uses 15-second database transport deadlines, records acknowledged progress after each provider request and requires one running receipt to be updated for progress/finalization. An uncertain database write stops the batch; a later run applies the recovery policy. Four-hour timing, eight-symbol batches, market eligibility, price timestamps, freshness thresholds and other scheduled jobs are unchanged.

## Deployment and evidence

1. Hold the development lock, review pending changes and verify Trading project `glvbqcplgjdfgjyknzsa`. Confirm the current worker, claim definition, `sync_runs.started_at` default `now()`, receipt state, grants and cron schedule. Capture an observation digest before recovery. Pause job 1; verify it is inactive, its HTTP queue is empty and the last possible old invocation started more than eight minutes ago. Deploy outside the refresh window.
2. Apply the reviewed SQL before deploying the corresponding worker. Keep JWT verification enabled and existing credentials unchanged. Verify deployed source and service-only grants. Run security advisors and compare existing findings.
3. Call the recovery RPC for the existing Twelve Data provider. It can run outside the refresh window without requesting provider data. Verify the interrupted receipt is failed with counts explicitly unverified, existing observations are unchanged and a repeat call makes no further recovery. Never manufacture a successful terminal receipt.
4. Resume job 1 with its exact existing schedule and unchanged command; verify saved activity and schedule. Observe a genuine subsequent scheduled cycle and reconcile selected IDs, statuses and stored quotes. A local fixture or outside-window skip is not proof of resumed scheduled coverage. Record the actual result in the evidence log.

## Recovery if deployment fails

Before any receipt has been recovered, explicitly or through a claim, the previous claim can be restored from `scripts/market-quotes-cycle-claim.sql` at `58aef864314e53b569f79c17afd05bde92a09824`; the previous worker is at that same commit. Once recovery has changed a receipt, preserve that audit history: do not revert it to running or rewrite its counters. If the new worker is faulty, stop new quote dispatch through a separately reviewed schedule change and prefer a forward correction. Restoring the old worker reintroduces unguarded receipt updates and is not an automatic database rollback. The new service-only recovery RPC can remain installed. Do not delete observations or replay historical cycles.

## Local verification

Run `node --test tests/twelve-data-cycle.test.mjs` and `node scripts/test-market-quotes-interruption-recovery.mjs` with `PGLITE_MODULE` pointing to the installed PGlite entry file URL. Keep the earlier claim/release harnesses as regression evidence. Tests use synthetic data and a local clock substitution; they do not prove actual hosted runtime behavior or real multi-session contention.
