# Shared paper engine — mechanics checkpoint

Implemented 19 September 2026. This pure Node module performs no network requests or database writes. Fixtures are synthetic and never published as research or real results.

Run: `node --test tests/shared-paper-engine.test.mjs` from the Trading repository.

The evaluator accepts an explicit verified session calendar, prices with provider/currency/load timestamps, immutable AI events and prior pinned outcomes. A signal fills at the close of the first session whose opening is strictly after publication. This is a proposed shared methodology, deliberately independent of the legacy UTC-date evaluator; controller documentation must adopt/version it before live use.

The example enters at 100 and exits at 110, giving 9.7802197802% after 0.1% each side; the benchmark moves 200 to 204 (2% before costs). Missing intended entry data never shifts the intended session. Intermediate/exit gaps and corporate-action inconsistencies withhold subsequent returns. Previous measurements remain immutable; a data-gap event records a discovered revision. Unchanged repeated evaluations add no duplicate outcomes.

Closed journals return their pinned final results; a separate post-close revision audit is not implemented. The caller must supply a complete verified calendar (the module validates ordering but cannot discover omitted real sessions), validated source prices, fresh independent research and a database-verified input hash. This module does not authenticate research or verify whether a trading call is sensible. JavaScript floating-point comparisons use tolerances in tests; persisted calculations will require consistent numeric precision.

Before deployment: implement the trusted database adapter/publisher, map schema fields, enforce concurrent idempotency, bounded entry-evidence recovery, provider/benchmark readiness and calendar completeness, and integration-test the exact persistence path. No scheduled task or dashboard has been switched to this engine. Local object freezing is not a substitute for database immutability constraints.

Independent review checkpoint: evaluation now advances `evaluatedThrough`, including no-outcome evaluations. Persist that watermark atomically with outcomes. Earlier evaluation times and newly appended calls at/before evaluated history are rejected. Identical call retries remain valid. A supplied calendar cannot relocate a pinned entry; a Sell without its next session reports Calendar required. These guards prevent backdated Sell cancellation and future outcomes leaking into a rewound evaluation. Original 18 tests were supplemented with chronology regressions and independently authored adversarial tests.
