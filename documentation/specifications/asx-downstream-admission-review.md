# ASX downstream admission review — 17 November 2026

This is a review and implementation sequence, not approval to publish ASX performance or a deployed convergence methodology. The Technical extension is working; it does not by itself satisfy the downstream contracts. Preserve `market-convergence-v1` history and the independent AI boundary.

## Three distinct paths

| Path | Current dependency | ASX gap |
| --- | --- | --- |
| Market Convergence | Completed Technical score plus independent AI score | v1 only accepts `technical-score-v1`; new ASX scores use `technical-score-asx-v1`. Changing source eligibility requires a separate methodology version. |
| Shared recommendations | Fresh completed scheduled independent AI assessment, price evidence, verified provider/benchmark configuration and watched/open scope | This publisher does **not** consume Market Convergence. Configuration and fresh AI gates remain separate; research-only recommendations may remain explicitly non-measurable. |
| Measured shared outcomes | Locked publication, trusted exchange sessions, verified share/benchmark attribution, compatible currency/provider and accepted evaluator inputs | Installed evaluator admits Tiingo raw-price semantics only. No ASX calendar/input configuration or enabled ASX publication configuration was present at review. |

Do not wire Technical or convergence results into the independent AI assessment or shared decision input merely to complete a pipeline. Do not reinterpret old research-only recommendations as historical measurable calls.

## What the diagnostics establish

`scripts/market-convergence-readiness.sql` retains canonical v1 selection, date boundary, retry handling and executable SQL. When v1 Technical input is absent but an otherwise valid, cutoff-eligible ASX-method score exists, it now reports `ASX_TECHNICAL_VERSION_UNSUPPORTED` with no invocation. Missing, future or invalid scores do not become evidence of usable input. An eligible existing v1 score retains its existing behavior.

`scripts/asx-admission-review.sql` is an aggregate-only, read-only inventory. It checks the latest named ASX Technical and independent AI rows before quality flags, without falling back to older good rows. It reports Technical source consistency and Sydney calendar-age screening separately from AI independence, terminal-run state and New York date screening. A four-calendar-day screen is **not** session freshness or a verified exchange calendar. Source matches can be invalidated by later ingestion; they are not a transaction fence.

The inventory also counts calendar revisions/current trust windows, input configurations, enabled publication configurations and active AUD ASX ETF/index records. These counts do not validate either side's provider mapping, return basis, full price coverage, calendar contents, evaluator support or publication eligibility. No schema, grants, configuration, schedule or performance data is changed by either diagnostic.

Live review: 15 active ASX instruments passed Technical source/age screening; three independent AI inputs passed the terminal/age screen, three were stale and nine absent. There were zero ASX calendar revisions, verified ASX input mappings, enabled ASX publication configurations and active AUD ASX ETF/index candidates. These are point-in-time aggregate findings, not permission to expand research scope or buy a data feed.

## Implementation order

Operational priority discovered during this review: the 17 November controller completed only 3 of 59 requested Market assessments. It recorded unverified Tiingo usage entitlement and blocked shared publication/evaluation. Investigate that recorded gate and missing fresh research first; this review does not independently conclude that the provider contract prohibits use. Repository/configuration review can start immediately, with provider-account evidence needed only if the existing project records cannot establish the relevant entitlement. This priority does not relax the ASX steps below.

1. **ASX session and Yahoo timestamp contract — can start immediately.** Prepare a versioned, reviewed ASX calendar from official notices, including holidays, shortened sessions, Sydney DST and conservative daily-price availability. Verify Yahoo's session-date labels and actual availability against it; never infer a holiday calendar from weekdays or observed bars. Keep actual auction times, availability bounds and hypothetical fill semantics distinct. Test expiry, missing sessions and price revisions before importing anything.
2. **Separately versioned ASX convergence adapter — can start with fixtures now.** Define its Technical/AI version pair, logical date and freshness rules explicitly, preserve the existing equal-weight formula unless separately reviewed, pin source IDs and payloads, check immutable ASX source/cutoff lineage, reject later mutation and unfinished AI runs, and preserve bounded retries/idempotency. Define any calendar prerequisite from step 1. Provide fresh independent AI evidence only for the intended coverage scope. Do not widen the v1 filter or relabel Yahoo data as Tiingo. No AUD benchmark is needed merely to combine two scores.
3. **Benchmark and measured-outcome support — separate release.** Specify a suitable AUD benchmark and its return basis, verified provider mapping and usable history. Configure both instrument and benchmark session attribution, common provider/exchange/currency and forward coverage. Extend the Yahoo evaluator only with audit/quarantine lineage, decimal storage semantics and immutable price evidence. Review the publisher's current UTC-day cutoff and four-day freshness policy for Sydney before enabling any configuration. Preserve original publication time and prospective fills; later evidence cannot backdate a call.
4. **Release acceptance.** Independently test the exact contract/implementation, merge and deploy under the project lock, then verify real scheduled receipts and rendered lineage. Existing US paths and historical results must remain unchanged. Observation and performance claims wait for genuine eligible sessions and full acceptance.

## Official-source findings

ASX's [2026 trading-calendar notice](https://asxonline.com/content/asxonline/public/notices/2025/august/0922.25.08.html) is a starting source for the calendar build, not an installed calendar. Its current [cash-market hours](https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours) distinguish the opening auction, randomized transition to continuous trading, closing auction and post-close phase. A generic 10:00–16:00 session is therefore insufficient as an assumed daily-close availability/fill contract.

ASX also distinguishes [price and accumulation/total-return indices](https://www.asx.com.au/investors/learn-about-our-investment-solutions/indices/types/capitalisation-indices). Do not silently compare adjusted share returns with an incompatible price-only benchmark. No benchmark purchase, subscription, provider entitlement or instrument activation is authorized merely by this review.
