# Daily Trading reliability and recovery

Version 2, 7 October 2026. Applies to the single existing local trading controller.

## Independent monitor

Supabase cron `trading-pipeline-watchdog-v1` reconciles durable records every 15 minutes even if the local computer is off. A morning is due by 10:15 Australia/Perth, following the single 08:00 Perth controller run and its 90-minute operating budget. Enforcement begins 5 October 2026. Opportunity remains daily; US shared research is due only for the applicable New York trading day. Missing or expired calendar trust raises a blocker rather than manufacturing a holiday skip.

`private.trading_pipeline_mornings` saves each day's latest reconciliation. `private.trading_pipeline_incidents` retains deduplicated per-day failures and recovery timestamps. Unresolved previous mornings remain visible; a successful later morning does not erase them. The monitor does not generate research, rewrite calls, evaluate hypothetical trades or access private notes.

The authenticated `trading_pipeline_status_v1` projection provides shared operational counts and sanitized blocker codes only. Monitoring tables and mutation functions are inaccessible to anonymous users, authenticated users and the service role. The privileged controller uses the private SQL boundary.

## Controller receipts and budgets

Before executing the selected stage, commit `select private.claim_trading_stage_v1('[STAGE]','[EXACT_GITHUB_COMMIT_SHA]');` and retain its returned UUID. After inspecting the subsystem's saved receipt, commit `select private.finish_trading_stage_v1('[ATTEMPT_UUID]','[completed|partial|blocked|failed]','[SANITIZED_REASON_OR_NULL]');`. Start and finish must use separate committed transactions so crashes leave visible evidence. Do not record secrets, source text or private notes in a reason code.

Stages: opportunity, external, market, publication, evaluation; preflight records an invocation with no eligible analytical stage. At most two attempts per analytical stage per Perth morning, or six preflight receipts. Recent running attempts block overlapping work. After 45 minutes inspect the real task and subsystem before retrying; age alone is not permission to race work or change a frozen cutoff. Record unfinished attempts truthfully, never fabricate completion.

If an independent earlier stage exhausts its retry budget, preserve its blocker and move to the next independently eligible stage. Never bypass actual External Opinion/Market Assessment prerequisites. Supported instruments can publish from a truthful terminal partial research run while unsupported symbols retain explicit coverage blockers.

## What completion means

The monitor verifies a successful complete Opportunity receipt; terminal scheduled external research; fresh independent scheduled Market Assessments for the target NY date; assessment usage in the immutable shared publication registry; and successful per-call evaluation receipts from the accepted scheduled evaluator revision after publication. It does not trust the task's active setting or a completion message. WAIT is a valid published call. Zero new BUY calls can be healthy.

Coverage limitations remain PARTIAL, never COMPLETE. Calendar expiry warnings begin 48 hours before expiry. The browser warns if monitor evidence is missing, malformed, from the future or more than 30 minutes old. Local research still depends on the computer/app, tools, quota and correct Trading project folder; the cloud monitor detects resulting silence but does not remove that dependency.

## Recovery

1. Inspect the incident, invocation UUID, source SHA and actual subsystem records.
2. Classify missing invocation, stalled worker, missing prices, missing research, unpublished assessment, unevaluated call or unsupported instrument.
3. Restore the failed dependency; queue only missing daily bars through the existing history queue. Verify the exchange calendar from official sources before importing a new immutable revision.
4. Resume the existing same-session lifecycle where permitted. Respect publication idempotency and SERIALIZABLE evaluation. Do not backdate missed decisions, shift entry dates, overwrite costs/benchmarks or force Buy/Sell calls.
5. Rerun reconciliation. Same-day incidents resolve only when their saved evidence recovers. Older incidents remain historical failures pending administrator review; do not backfill completion claims.

## Acceptance checks

- Missing invocation after 10:15 creates a controller-not-seen blocker.
- Before the deadline no overdue-research incident is claimed.
- Perth/NY dates, weekends, holidays and DST are handled explicitly.
- Overlapping claims fail and retry budgets are enforced.
- Repeated monitoring does not duplicate incident identities.
- Anonymous access and private mutation access are rejected; no private notes are exposed.
- Monitor execution leaves calls, outcomes and private notes unchanged.
- Browser shows saved counts and stale-monitor warnings without sample results.
- Genuine scheduled run and populated dashboard reconcile before Stage 1 acceptance.
- External notification delivery is tested after the owner selects a channel and destination.

The first eight checks can be tested now using local or rollback-only fixtures. The genuine scheduled-flow check remains UNVERIFIED until an actual run exists. Dashboard alerts are implemented; external delivery must not be claimed before configured and tested. Observation and prediction-quality scoring begin only after Stage 1 acceptance.

## Single daily unattended run

Run once daily at 08:00 Australia/Perth, scoped only to Trading. Execute eligible stages sequentially, each with a separate claim and terminal receipt; the database's two-attempt budget is a safety ceiling, not an instruction to schedule retries. Inspect overlap before any work and do not race an active worker. Do not wait indefinitely for approval, prices or a failed tool. Stop new work after 90 minutes, finalize safe receipts and report partial/blocked outcomes. An unreturned write requires durable-state inspection before replay. Permission failures do not authorize bypassing access controls. The 10:15 watchdog deadline and cloud monitor frequency remain unchanged.
