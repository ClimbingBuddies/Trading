# External Opinion Pipeline

**Task:** RES-002 — Operationalise approved opinion sources  
**Contract:** `documentation/specifications/external-opinion-model.md` (`external-opinion-v1`)  
**Scheduled runner:** `automation/daily-external-opinion-review.md` v1.0  
**Supabase project:** `glvbqcplgjdfgjyknzsa`  
**Date implemented:** 24 August 2026

## Purpose

The external-opinion pipeline collects attributable current analyst/opinion, financial-news, issuer, regulatory and specialist-research context for the active Trading universe and persists it as a deduplicated evidence layer for the independent AI Market Assessment.

It does **not** produce the Trading Market rating, does not feed the Technical Engine, does not become a third Market Convergence branch, and does not feed long-term Opportunity Assessment.

## Scheduling and ownership

The recurring task **External Opinion Review** is enabled Monday–Friday at **5:00 pm America/New_York**. It runs before the existing evening Daily Trading Market Assessment so current external-opinion context is available to that independent AI branch.

The scheduled task is a thin runner. On every execution it retrieves `automation/daily-external-opinion-review.md` fresh from GitHub and follows the current `external-opinion-v1` contract.

Review identity is deterministic by:

- New York `review_date`;
- `methodology_version = 'external-opinion-v1'`;
- `triggered_by = 'scheduled-external-opinion-review'`.

`external_opinion.prepare_review_v1` returns an existing successful review as `already_complete = true`, so an automation retry cannot create a second same-date review.

## Approved source registry

`public.opinion_sources` is the live configuration registry. It records collection method, approved static domains where appropriate, lookback, per-instrument item cap, trust tier and collection guidance.

Current v1 source families are:

| Source key | Collection rule | Static domain boundary | Lookback |
|---|---|---|---:|
| `analyst_consensus` | current visible analyst consensus/target context | `stockanalysis.com` | 720 h |
| `financial_news` | material current financial reporting | `reuters.com` | 168 h |
| `official_company` | verified issuer/fund official IR or press page | dynamic official issuer domain | 720 h |
| `regulatory` | official regulatory filing/announcement | `sec.gov` | 720 h |
| `research` | authoritative specialist/macro research when materially relevant | IEA, Federal Reserve, IMF, World Bank | 720 h |

A configured source family can legitimately produce zero opinion rows. Zero coverage is not converted into neutral evidence.

## Trusted persistence boundary

The write/orchestration schema is `external_opinion`. It is service-only.

Normal `anon` and `authenticated` clients:

- have no table grants on the opinion model/control tables;
- have no execute privilege on `external_opinion` functions;
- are covered by explicit deny RLS policies.

The historical broad scaffold grants, including `TRUNCATE`, were revoked during RES-002.

The scheduled workflow must use the trusted helpers rather than inserting directly.

### Run lifecycle

`external_opinion.prepare_review_v1(review_date, triggered_by)`

- creates or resumes the deterministic review;
- increments an attempt for a non-terminal retry;
- returns `already_complete` for a successful same-date retry;
- initialises one source-result row per active source family.

`external_opinion.record_source_result_v1(...)`

- persists terminal per-source outcome and counts;
- retains source-specific error/metadata.

`external_opinion.finalize_review_v1(...)`

- rebuilds deduplicated consensus;
- calculates coverage;
- persists terminal `succeeded`, `partial` or `failed` state;
- leaves no started review without a terminal outcome when the runner reaches finalisation.

## Canonical identity and idempotent ingestion

`external_opinion.ingest_opinion_v1(...)` is the only approved scheduled ingestion path.

The helper:

1. requires a running `external-opinion-v1` review;
2. resolves an active instrument and active source family;
3. validates configured static domains where present;
4. normalises the source URL;
5. calculates a canonical source key and claim hash;
6. calculates a deterministic observation key;
7. inserts only when `(instrument_id, observation_key)` is new;
8. returns `inserted = false` for an exact retry rather than creating another opinion row.

Canonical source identity prioritises:

1. normalised canonical source URL;
2. source + external reference;
3. content hash;
4. deterministic source/date/claim fallback.

Common tracking parameters and fragments do not create a second canonical URL.

## Consensus and lineage

`instrument_opinion_consensus` is a derived summary only. It is never a second evidentiary vote.

`external_opinion.rebuild_consensus_v1`:

- uses only active-source observations inside the source-specific lookback;
- deduplicates to the latest row per instrument + canonical source + claim family;
- calculates a deterministic stance/score from the retained atomic rows;
- persists one consensus row per instrument/date;
- records exact members in `opinion_consensus_members`;
- records `source_family_count`, `fresh_through` and coverage status.

The consensus model is deliberately descriptive. The independent AI Market Assessment remains responsible for its own rating, score and confidence.

## Market Assessment evidence lineage

`gpt_market_evidence` now has:

- `instrument_opinion_id` lineage;
- `canonical_source_key`.

For `evidence_type = 'external_opinion'`, a trigger verifies that an explicitly linked opinion belongs to the same instrument as the Market Assessment and copies its canonical source identity.

A partial unique index on `(assessment_id, canonical_source_key)` prevents the same underlying external-opinion source from being persisted twice for one Market Assessment.

This makes the RES-001 non-double-counting rule machine-verifiable at the assessment evidence boundary.

## Coverage monitoring

`public.external_opinion_coverage_v1` is a service-only monitoring view for all active instruments. It reports:

- `current` — at least one active-source observation is within that source's configured lookback;
- `stale` — historical opinion exists but none is currently eligible;
- `none` — no opinion has ever been captured for that active instrument.

`none` and `stale` are coverage states, not investment stances.

`opinion_reviews` persists run totals including instruments checked, sources checked/failures, opinions seen/inserted, duplicate skips, consensus rows and current/stale/none coverage.

`opinion_source_review_results` persists source-family monitoring and errors.

## Builder verification — 24 August 2026

### Rollback-only lifecycle matrix

A service-role rollback test verified:

- deterministic review preparation;
- one accepted observation on first insert;
- exact retry returned `inserted = false`;
- one duplicate was counted rather than persisted;
- consensus rebuilt successfully;
- finalisation reached `succeeded`;
- coverage was `1 current / 29 none` inside the rollback test.

Two implementation ambiguities exposed by this test were fixed before handoff in follow-up migrations. The final rollback lifecycle passes end to end.

### Market-evidence lineage matrix

A rollback-only test verified:

- linking an NVDA Market evidence row to an NVDA atomic opinion automatically persisted the canonical source key;
- a second representation of the same canonical source for that assessment was rejected by uniqueness;
- attempting to link that NVDA opinion to an AMD Market Assessment was rejected as an instrument-lineage mismatch.

No rollback test rows were retained.

### Real current review

The same production contract was then executed for New York review date **24 August 2026** using real public evidence.

Persisted review:

- status: `succeeded`;
- active instruments checked: 30;
- source families checked: 5;
- source failures: 0;
- opinions seen/inserted: 4 / 4;
- duplicates skipped: 0;
- consensus rows: 2;
- coverage: 2 current, 0 stale, 28 none.

Real observations persisted:

- NVDA analyst-consensus context from StockAnalysis, as of 20 August 2026;
- NVDA current market commentary from Reuters, published 22 August 2026;
- NVDA official Q2 FY2027 results event from NVIDIA Investor Relations;
- AMD 4 August 2026 Form 8-K from SEC EDGAR.

The research source family was successfully checked but produced no item inside its configured 720-hour materiality/lookback boundary, so it persisted a zero-item successful source result rather than a fabricated opinion.

A same-date `prepare_review_v1` retry after completion returned the same review with `already_complete = true` and attempt count 1.

### Security verification

After hardening:

- `anon`/`authenticated` table grants on all opinion/control tables: zero;
- all six opinion/control tables have explicit deny policies for browser roles;
- every function in the private `external_opinion` schema is non-executable by `anon` and `authenticated` and executable by `service_role`;
- only the trusted service path can write the model.

Supabase Security Adviser reported no new RES-002 opinion-model security finding. Existing unrelated project warnings remain outside RES-002.

### Adviser cleanup

The first post-DDL performance check identified two new unindexed foreign keys. RES-002 added indexes for:

- `instrument_opinion_consensus.review_id`;
- `opinion_source_review_results.source_id`.

New opinion-model indexes may initially appear as unused immediately after creation; that is expected until sufficient runtime traffic accumulates and is not treated as evidence to remove required identity/lineage indexes.

## Source files

Database implementation:

- `supabase/migrations/20260824143000_operationalise_external_opinion_v1.sql`
- `supabase/migrations/20260824143500_fix_external_opinion_function_ambiguities.sql`
- `supabase/migrations/20260824144000_fix_external_opinion_consensus_ambiguities.sql`
- `supabase/migrations/20260824144500_index_external_opinion_foreign_keys.sql`

Execution:

- `automation/daily-external-opinion-review.md`

Model contract:

- `documentation/specifications/external-opinion-model.md`
- `automation/daily-market-assessment.md` v1.1

## Auditor handoff

The independent Auditor should re-establish from primary evidence:

- schedule enabled at the declared weekday New York cadence;
- live schema/migration parity;
- no `anon`/`authenticated` opinion-table grants or function execution;
- canonical URL/source identity behaviour;
- exact-retry idempotency;
- per-source terminal telemetry;
- consensus membership deduplication/lineage;
- same-source Market-evidence uniqueness and cross-instrument lineage rejection;
- persisted 24 August review and coverage values;
- absence of writes from this subsystem into Technical Engine, Market Convergence or Opportunity outputs.