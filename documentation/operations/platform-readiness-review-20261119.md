# Platform readiness review — 19 November 2026

## Decisions and current boundaries

The existing architecture can continue to be repaired without replacing providers or changing analytical methodology. No purchase, account change, provider migration, new reader service, historical data deletion or automatic schedule was authorized by this review. Full unattended business acceptance remains open.

### Data providers

| Existing path | What the review established | Required decision/evidence |
| --- | --- | --- |
| Tiingo daily history and original measured outcomes | Current published terms distinguish transient Starter use, paid storage, reference inference and additional AI evaluation rights. | A licence covering the actual shared project and its measured AI outputs; do not assume a basic upgrade clears every gate. |
| Twelve Data current quotes | An ASX EOD/history product exists, with registration and exchange conditions. | Verify account tier, retention, authorised users, AI use and exchange approval before designing a replacement history adapter. |
| Yahoo ASX history | Source normalization and audit lineage are technical evidence, separate from permission for automated collection and persistent shared use. | Establish applicable permission; working public endpoints alone are insufficient evidence. |

The lowest implementation change is suitable terms for the existing Tiingo path. The individual Power page advertises $30/month but excludes sharing with another person or organisation. Published section 1.7(d)(iv)(B) separately addresses AI/ML evaluation under an Enterprise licence; section 1.6 addresses durable data and derived outputs. Do not treat Power backtesting language as sufficient proof for this platform's AI evaluation. Existing-account notice dates and negotiated agreements remain unverified. [Tiingo pricing](https://www.tiingo.com/pricing) · [Terms](https://www.tiingo.com/tos/)

Twelve Data Business Venture is advertised from $149/month; its ASX internal add-on is advertised from $120/year, subject to approval. These are starting prices, not a quote for this project. ASX history/EOD availability does not establish equivalent basic-quote/last-trade support. Storage is subject to subscription/exchange retention rules; the duration needed for immutable audits was not verified. [Business pricing](https://twelvedata.com/pricing-business) · [ASX coverage](https://support.twelvedata.com/en/articles/13001919-australian-equities-market-data) · [Usage](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage) · [Terms](https://twelvedata.com/terms)

Yahoo's current published terms address permission for automated collection. Technical access is not that permission. This is an unresolved provider-fit question, not a finding that the reviewed parser or stored historical evidence is defective. No additional runtime gate or deletion was installed by this review. [Yahoo terms](https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html)

Any provider scope decision should cover two contributors in one private hosted platform; US/ASX equities and ETFs; raw/adjusted daily history and four-hour quotes; backups and immutable snapshots; saved indicators/recommendations; no-training AI reference inference; evaluation against subsequent prices and ETF benchmarks; display/export scope; and retention after cancellation. Prepare exact terms and costs before requesting a purchase or migration decision. No external enquiry was sent.

### Research access

The scheduled task has demonstrated repository access, database writes and some source research. Durable receipts have not established full-byte HTTP/PDF reading capability. Public HTTP diagnostics can reach documents that the web reader cannot. A requested large page size may still return a paginated feed, and a homepage's latest-document link may be historical.

Collection contract 1.1 therefore records actual runtime reader observations and pagination limitations. It does not claim that the cloud task inherits desktop tools. If a genuine invocation confirms the necessary reader is missing, a hosted reader would need separate review for publisher permissions, authentication, bounded fetching, content hashes, extraction limits and truthful errors. Prompt changes cannot manufacture a missing runtime capability.

### Evaluation readiness

The configured original evaluator has an accepted release and valid pinned evidence; supported current price rows exist. Its latest successful observed manual evaluation predates this review, and newer scheduled attempts retain the provider gate. It should evaluate independently of new publication when its own prerequisites permit; do not run it simply to clear the monitoring screen while the gate remains unresolved.

An independent local reproduction also confirmed a receipt/monitor defect: a successful scheduled evaluation using a newer controller source SHA was counted as missing because monitoring compared that SHA to the approved evaluator revision. The repair preserves actual source provenance and adds a separate database-captured evaluator revision. It neither advances evaluator approval nor relabels historical runs. The focused reproduction exercises receipt/monitor behavior with synthetic calculator output; it is not evidence that the hosted price/provider gate has cleared.

The repair regression passed 13 scenarios / 107 assertions using the actual SQL runner, core monitor, guarded migration and recovery. It covers invalid/disabled approval, separate provenance, exact retries after approval changes, legacy-null compatibility, timing/origin gates, preserved privileges/history and Windows-line-ending rollback. The inner calculator is deliberately synthetic; pricing arithmetic and native competing-session contention are not claimed by this suite.

ASX currently supports independent research, convergence and research-only recommendations. Measured ASX outcomes additionally require an approved AUD benchmark, timestamped opens/closes and session mappings, provider-aware raw/adjusted source validation, and acceptance tests for costs, entry/exit timing, missing sessions and corporate actions. The existing date-only research calendar cannot satisfy these requirements. Do not relabel Yahoo data as Tiingo, use a USD benchmark for AUD returns or retrofit research-only records into measured calls. A configuration toggle alone is not a repair.

### Scheduled acceptance and the notes defect

The 19 November controller ran before the collection-recovery release. The subsequent tracker reported partial research/publication, blocked evaluation and fresh post-deadline ATTENTION. It correctly did not declare completion. A supplemental application-function diagnostic was safety-rejected; a distinct reviewed table-only diagnostic now provides lineage differences without executing application functions.

That diagnostic established a real implementation defect: operational `gpt_market_runs.notes` changed after successful convergence, causing otherwise identical envelopes to appear changed. The bounded migration excludes only that field from identity comparison, keeping historical envelopes and results intact. All analytical/lifecycle fields and pinned cutoff checks remain. See [ASX monitoring](../asx-alert-monitoring.md) for tests and guarded recovery.

ASX release: [PR #73](https://github.com/ClimbingBuddies/Trading/pull/73) merged at `f343d97d1480b5bd1a1bb201158e6d4201a16fdf`; hosted migration `fix_asx_admission_note_identity` is recorded as `20261119053200`. Exact deployed runner/health definitions match the independently reviewed source, existing history digests are unchanged, and helper execution remains service-only. Security advisory counts are unchanged. The new actual-SQL suite passed 29 scenarios / 197 assertions and the existing adapter suite passed 80 / 331. Native competing-session advisory-lock contention remains outside the single-backend tests. No frontend deployment or analytical replay was performed.

Next acceptance evidence must come from a genuine eligible scheduled run adopting the released source, with collection capability/coverage receipts, valid independent research and guarded publication. The next controller time after this review is 08:00 Perth on 20 November, and the tracker is due at 10:30. No duplicate run or follow-up schedule was created. Provider and ASX-measurement decisions can be prepared immediately; scheduled adoption cannot be asserted in advance.
