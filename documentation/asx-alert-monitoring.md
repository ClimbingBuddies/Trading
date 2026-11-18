# ASX convergence alerts and current monitoring

Controller 1.16 and migration `20261118054201_integrate_asx_alerts_and_monitoring.sql` connect immutable ASX results to in-app alert evaluation and independent current-health reporting. No analytical job or new cron is added. The existing 15-minute watchdog remains the operational entrypoint.

## Alert processing

A successful ASX run atomically queues its public assessment once in `private.asx_convergence_alert_queue`. Identity is the immutable assessment, not the run: later successful receipts can reuse a result. Installation marks existing results `baseline_no_replay`; it does not invent historical notifications.

Each watchdog invocation processes at most ten due queue rows, each with at most fifty applicable enabled rules. Latest-only coalescing records older/inactive results as `superseded`, not delivered. Evaluation pins the exact queued result and scopes the instrument loop, including watchlist alerts. The existing evaluator entrypoint and scoped evaluator share a per-alert transaction lock. A delayed result cannot regress a newer source baseline; a changed rule or newly added membership cannot generate a pre-configuration crossing. Switching methodologies establishes a new baseline.

First observation establishes state without an event, as before. Actual condition crossings retain unique `(alert_id,event_key)` deduplication and owner-scoped event visibility. Each batch's event/state updates are atomic. If any rule fails, that batch rolls back and its failed evaluator receipt remains. Queue retries wait at least fifteen minutes and stop after three actual attempts; queue or rule-row lock contention does not consume an attempt. Queued evaluations acquire the rule row without waiting and defer fifteen minutes on contention; legacy evaluation retains ordinary waiting. A sanitized failed receipt records the deferred check. The legacy rule loop uses deterministic ID ordering. Failure codes are sanitized. `evaluated` means checks ran; it does not mean an event crossed. `no_rules`, `baseline_no_replay`, `superseded`, `pending`, `failed` and `exhausted` are distinct outcomes.

Events remain `notification_status=not_requested`. This release implements in-app events only; email/push delivery is not configured or verified. No rules are automatically created or enabled. With zero applicable rules, the correct outcome is `no_rules`, not "delivered".

## Current health is separate from morning history

`private.asx_convergence_health_v1` checks all active ASX instruments using the adapter's authoritative admission, selected inputs and immutable result/receipt lineage. It reports current matches, missing/stale/source/calendar blockers, ready-but-unprocessed pairs, changed current admission, and failed/running processing. Counts and sanitized symbol/reason pairs are returned; raw private envelopes and owner-specific rule/event details are excluded.

The original morning snapshot implementation is preserved as `private.trading_pipeline_core_snapshot_v1`. Its morning state, completion history and incident policy are unchanged. The wrapper adds separately timestamped `asxConvergence` evidence. Three historical successes cannot certify current coverage, and later input/calendar changes do not retroactively invalidate an earlier completed morning.

Current ASX dispatch attention is due from 10:15 Australia/Perth until the Sydney date rolls over (21:00 Perth during this calendar's daylight-saving period). Before the window the state is `NOT_DUE`; after it, `DEFERRED`. Actual blockers remain visible outside the window. ASX health is independent of the US `marketDue` flag. Calendar trust expiration is a blocker and the warning window begins 48 hours before expiry.

`private.asx_convergence_monitor_state` retains a separate current-health incident. A fresh due-window attention check opens/reopens it; only a fresh healthy due-window check resolves it. Outside-window checks preserve its unresolved state. This records present recovery without claiming a previous morning was completed. Dispatcher/ASX-monitor failures cannot prevent the ordinary watchdog reconciliation; unavailable/stale ASX evidence remains unverified.

Alert processing continues throughout the day. Failed/exhausted alert attempts warn independently of the coverage due window, and dispatch errors are unverified. A coverage deferral never hides a delivery failure.

The authenticated existing status RPC exposes only the saved safe summary. The UI rejects missing, malformed, future, stale (>30 minutes) or contradictory ASX evidence. It shows current coverage, alert queue failures, calendar expiry and whether any ASX rules are configured, with a link to Alerts.

## Security, recovery and acceptance

New tables have RLS enabled, no client policies and no public/authenticated/service-role grants. Background functions remain privileged SQL operations; the internal enqueue trigger is SECURITY DEFINER only to cross from the service-owned convergence update into the private queue. It is not client-executable. The scoped evaluator is also private and the existing owner-scoped alert-event policies are unchanged. All evaluator calls serialize on the same rule lock.

Recovery: under the development lock, inspect current definitions before running `scripts/rollback-asx-alert-monitoring.sql`. It removes only the enqueue trigger and restores the exact prior evaluator/snapshot/watchdog definitions. Queue tables, run receipts, events, results and history remain intact. The new frontend will correctly report ASX monitoring unverified after rollback. Do not delete evidence or replay baseline rows.

Local tests must cover real alert conditions, mixed watchlists, delayed/configured baselines, duplicate receipts, retry exhaustion and atomic failure, old evaluator compatibility, security and current-health timing. Production with no rules can verify monitoring and no-rule/baseline classification, but cannot prove a real user-configured crossing. Genuine unattended controller adoption and configured crossing acceptance remain separate observations.
