# Decision Lab — controller project plan

Updated 4 October 2026. Authoritative build status; development controller owns updates. Source: approved playbook v3. This file does not imply an active background agent.

| ID | Workstream / deliverable | Dependencies | Status | Acceptance evidence / next action |
| --- | --- | --- | --- | --- |
| F0 | Shared database foundation | None | awaiting_review | Installed; rollback privacy and immutable-call checks passed. Independent implementation review remains. |
| C1 | Versioned mechanics/dashboard contract | F0 schema inspection | accepted | v1 saved in documentation/decision-lab-data-contract.md; reviewer found no-call blocker ambiguity, resolved with separate blockedItems, paging and counts. Contract accepted; authenticated read endpoints subsequently installed and rollback-tested. |
| ENG1 | Independent review of local mechanics | Existing engine | accepted | Independent tester: 21 repository + 7 adversarial tests passed. Reviewer verified chronology/calendar fixes at SHA256 F41783DD0C84F4240F704EE1F681E5627572149221A27CF949CB49017BF6FCA2. Local mechanics only; not DB integration. |
| ENG2 | Trusted publisher and persistence adapter | C1, ENG1 fixes | in_progress | Private hash-bound publisher/candidate functions installed; privilege/registry/missing-assessment checks pass. Review-version invalidation installed and rollback-tested. JS adapter independently accepted locally: 29 adapter tests plus 28 engine tests pass. Outcome writes gated until trusted calendar and atomic DB read/commit transports pass. |
| D1 | Approved dashboard table and drawer | C1 | awaiting_review | Shared UI built and signed-in empty state verified on localhost:3001. TypeScript/palette checks pass. Read API rollback tests pass; populated drawer and two-user browser acceptance remain. |
| DATA1 | Data/session/benchmark readiness | C1 | in_progress | Nasdaq calendar trust renewed through 6 October 2026; AVGO, BEAM, MRVL and NVDA enabled with verified Tiingo/QQQ configuration. ASX and cross-venue benchmarks remain blocked. |
| I1 | Dashboard + mechanics integration | ENG2, DATA1, D1 | in_progress | Authenticated read projections installed and tested; live page reconciles zero calls and seven pending shares. No genuine shared call or persisted outcome yet. |
| S1 | Scheduled trading integration | I1 | in_progress | Daily Trading Controller automation activated on 27 September and pinned to branch controller v1.5+. Evaluator enabled at revision 395b740 after 94 passing tests. First scheduled invocation and genuine publication remain to be verified. |
| A1 | Stage 1 acceptance | S1, independent test/review | queued | All required acceptance checks evidenced, at least one genuine shared call displayed, every watched share accounted for. |
| O1 | One-week observation | A1 | queued | Start/end dates recorded only after acceptance; no forced trades or invented results. |

## Milestone update record

For each update record: task ID, date/time, assigned agent, base revision/file hashes, owned paths, status, acceptance check IDs, test command/results, review findings, deployment state, blocker/next action. Append detailed evidence to `documentation/decision-lab-evidence-log.md`.

## Current bounded scope

C1/ENG1 accepted. D1 UI and authenticated read projections now integrated locally; database publication boundary installed. ENG2 remains partial: trusted calendar/outcome adapter, configured providers/benchmarks and publication acceptance required. Seven candidates need fresh published research; zero live shared calls/outcomes. Existing schedules unchanged. No observation week has started. Next bounded milestone: DATA1 plus verified evaluator persistence, then genuine shared call and populated-drawer acceptance before S1.


## Completion branch and controller

- Branch: `project/decision-lab-completion`, created from local main on 20 September 2026; existing modifications retained.
- Controller: `automation/decision-lab-development-controller.md`, executed by the lead in this task with bounded builder/tester/reviewer assignments.
- Immediate milestone: DATA1 / ENG2, validated inputs and trusted database outcome persistence. The daily trading schedule is not the development controller.
- UI follow-up: duplicate title, system-status panel and preview button removed; real legacy AVGO drawer simplified and browser-checked. Shared genuine-call browser acceptance remains outstanding.
- Counts recorded on 19 September are historical verification, not a current live database audit.
- Existing repository modifications include prerequisite personal-workflow and broader dashboard work. Scope and review those dependencies before release; a branch alone does not commit them.

20 September execution resumed: bounded ENG2 implementation and independent review/testing dispatched. This is active task execution, not an autonomous background schedule. Database review-version race fixed with migration shared_review_evaluation_version; rollback checks passed. Live read-only audit found no calendar/session tables in public/private; trusted calendar import remains a prerequisite.

Controller acceptance: local adapter checkpoint accepted at BD71025C7F47AAD315FFCDF0E61754137E9D3688E5777180F586229A316E5042; ENG2 overall remains in_progress. Next implement verified calendar storage/import and trusted database snapshot/atomic commit, then integration tests before removing gate.

## 20 September 2026 - guarded persistence checkpoint

ENG2 remains in_progress: database snapshot, independent SQL calculator, validator, atomic writer and audited runner are installed. Independent testing and review accepted the bounded persistence checkpoint; 94 local tests, 13 Node/Postgres parity cases and rollback SQL integration checks passed. Release remains disabled. See evidence log for exact scope.

DATA1 is partial: verified published Nasdaq calendar (review expires 21 September 2026 14:28:15 UTC) and five Tiingo input conventions installed. No publisher configurations or genuine shared calls. Missing source evidence is withheld. ASX and cross-venue support remain blocked.

Next: fresh published research and verified per-instrument publisher/benchmark configuration, independent release acceptance, adoption of the shared controller specification by the existing schedule, then one genuine scheduled run and populated browser verification. A1 remains queued; O1 has not started. No schedule or heartbeat changed.

## 27 September 2026 - live operation enabled

The missing Daily Trading Controller automation was created and activated for the saved Trading project, scheduled at 04:30–09:30 Australia/Perth. It is pinned to `project/decision-lab-completion` and rejects controller specifications older than v1.5. Verified Nasdaq/Tiingo/QQQ configuration is enabled for AVGO, BEAM, MRVL and NVDA; Nasdaq calendar trust is renewed through 6 October. The evaluator release is enabled at revision `395b740ebfb6a7022dd899acdb055716113e5caa`. A manual run correctly recorded `NO_SHARED_CALLS_TO_EVALUATE`; Stage 1 remains incomplete until a fresh scheduled Market Assessment produces a genuine shared call that reconciles in the dashboard.


## 4 October 2026 - reliability milestone

RELIABILITY1: database monitor, private stage receipts, per-stage retry budgets, authenticated status projection, compact dashboard/Alerts indicator and recovery runbook implemented. Independent Supabase watchdog checks every 15 minutes; morning enforcement begins 5 October at 10:15 Perth. Actual scheduled watchdog receipts must be distinguished from manual validation. Official Nasdaq schedule reverified across all 365 days; new immutable trust revision expires 11 October 2026.

Latest audit: zero shared calls/reviews/outcomes; latest research saved 17 September Perth; latest scheduled evaluator 28 September blocked NO_SHARED_CALLS_TO_EVALUATE. Supported configured names: AVGO, BEAM, MRVL, NVDA. 1AI, WA1 and FIG remain explicitly unsupported by current shared configuration. The active local controller begins 5 October at 04:30-09:30 Perth. Monday corresponds to a US non-session date; the first normal fresh US research/publication expectation is Tuesday 6 October morning.

A1 and O1 remain queued. Do not start the observation clock based on monitor installation. Required next evidence: actual source-revision-tagged controller invocation; fresh eligible assessment; genuine shared call/review; accepted evaluator receipt; rendered record reconciliation and private-note isolation. Dashboard alerts are implemented. A second external alert channel/destination is awaiting owner selection; delivery is UNVERIFIED. Code publication and production dashboard deployment must be recorded separately.

Next priorities: verify Tuesday's complete pipeline; test missing-run/recovery delivery; resolve unsupported coverage without blocking supported names; begin observation only after acceptance. Predictive-quality evaluation remains separate from operational completion and must include costs, matched benchmarks, losing calls and missing sessions.

RELIABILITY1 verification update: job 17 has two successful real scheduled watchdog receipts on 4 October. Saved missed-run deduplication/recovery passed rollback checks, with no test rows remaining. The isolated actual UI component passed desktop/mobile layout checks; the complete production dashboard remains unverified. Changes pushed to the existing completion branch, with Vercel sign-in complete and production publishing pending verification. Stage 1 remains incomplete; A1 and O1 remain queued.

Production reliability UI released: Vercel deployment dpl_61nBrMSd9vPynb9RZuVbfXUarjRK at source 04090387b6524f9f0fa5452e846e57545e280add is READY and aliased to discoverbouldersmarkets.vercel.app. Unauthenticated production smoke check passed; actual signed-in scheduled results remain the next acceptance milestone. Dashboard alert delivery is deployed. External notification delivery still awaits a specific channel/destination.

## 7 October 2026 — WA1/1AI research-only loop

The bounded research publication checkpoint is accepted locally and installed in Supabase. Reviewed migration `shared_asx_research_recommendations_v1` installs immutable research-only recommendations, private source receipts/evidence bundles, guarded publisher and permanent-user scoped reader. Manual run `545e307b-41e2-45fd-8af1-56145d6b982d` completed 2/2 independently researched ASX assessments at cutoff 2026-10-07 03:12:30.002497 UTC. WA1 WAIT `032f3d30-a7c5-4443-8b3c-5d6af69f45fd`; 1AI WAIT `2aeb6b05-bbbc-45e6-ae40-ef42db670f4f`. Both preserve original issuer report hashes and verification/publication dates, 60 frozen daily observations, omitted-row counts and unofficial Yahoo provenance. Full current-news/valuation coverage is not claimed.

Independent rollback SQL passed temporal proof, exact/divergent retries, immutability, owner filtering, auth rejection, history and later-measurable-call archival. Fixture cleanup verified zero remaining fake records. Static reviewer accepted SQL SHA256 `9CF0B357D12BF45457D1BAEB85BCE4B999CF37719EEC22B43DFCD96B875631BD`; follow-up UI/source-date checks recorded separately. Research remains NOT_MEASURABLE and does not change the four measured call/review events or eight horizon trials. ASX calendar/session attribution, provider mapping and AUD benchmark remain outstanding; no historical recommendation can be retroactively scored.

Controller v1.7 now specifies source receipts before frozen cutoff, guarded research-only publishing in the existing stage and separate counts. Source publication/deployment and first unattended adoption are distinct acceptance checks. Signed-in browser verification is UNVERIFIED because computer-use kernel initialization failed; SQL auth scope and real payload validation are available. No duplicate scheduler or broker orders.

Final independent verification: 32 UI boundary tests passed; genuine authenticated-role RPC returned both WAIT cards and passed the final component validator. Calls4/reviews0/events4/horizon rows8/research2 reconciled. Source availability precedes cutoff. Production build and palette checks passed. Computer-use rendering remains unverified; no second real user account was improvised.

Release verified: PR28 merged at `4285f035784e57301313fe0727e76207bbade4e0`. Vercel production `dpl_DMHrkpEgG7B9juZeB1mDXc515vAd` READY at that exact SHA; `discoverbouldersmarkets.vercel.app` alias verified, HTTP200 and deployed-ID smoke match. Final complete Node suite312/312 passed. Existing Daily Trading Controller updated in place to require v1.7 and research-only publication; ACTIVE status, prior UTC schedule and failed-runs-only notifications preserved and saved TOML verified. First unattended adoption remains pending. Signed-in browser retry failed `node_repl kernel exited unexpectedly` / Windows sandbox setup refresh; real UI hydration, navigation and second-account browser checks remain UNVERIFIED rather than inferred from HTTP or SQL.

## 7 October 2026 — complete watched AI recommendation coverage

Audit found seven active watched shares: six saved calls, FIG missing; Recommendations used scheduled-only table RLS and omitted published manual ASX research. Bounded coverage contract and owner reader now combine eligible completed scheduled assessments, immutable shared calls/reviews and published research-only records. Explicit action wins over rating; research never inherits paper timing. Static backend review accepted `F8D0182687AAC112552CB39DC3809D59159C4CE688580531DD86CA9225487B15`; UI review accepted `D1F6F83849D8F24218920835F1E77DDDB20FC2A9361D5BEDCD4C77C017D518E1`. Migration `watchlist_ai_recommendations_coverage_v1` installed.

Genuine FIG manual research run `53fbd037-6128-4818-9939-d0ab252d7593`, cutoff `2026-10-07T03:50:58.396573Z`, assessment `f5f54bf5-e7bf-4319-b3bb-bfe2f203e93b` completed1/1. WAIT research publication `ac263c1d-aaf2-48ce-9750-bf49699c145f`; receipt `e3745c04-ee0a-4771-8dc7-eb51b717f20f` verifies August5 SEC-filed Q2 release. Captured web-reader text hash `8d09fa462ba1f401ebb0ff3dbf545902291a4542d7d75376bf93c3017db71238` is not an original HTML-byte hash. HTTP downloads were denied; public web reader verified original source. FIG Tiingo prices latestOct6, 60 frozen/298available; dynamic NYSE/USD caveat avoids false Yahoo/ASX labels. Historical results/forward-looking guidance and incomplete latest-news/valuation coverage are explicit.

Coverage intended: AVGO BUY; NVDA BUY; BEAM, MRVL, WA1, 1AI, FIG WAIT. First four are shared calls; last three research-only, excluded performance. Existing4events/8horizon rows unchanged. Actual browser hydration and next scheduled v1.8 adoption remain UNVERIFIED pending evidence. Runtime tests/deployment appended after acceptance.

Final independent coverage acceptance: 22 UI runtime/transpilation tests and rollback SQL tests passed saved-action precedence, research-only plan exclusion for all actions/horizons, invalid/error/aborted-response suppression, owner/auth isolation, manual/incomplete exclusion and cutoff/publication/UUID tie order. Actual owner scopes returned1/0/6 items, union7 unique watched instruments; no cross-owner leakage. Rollback fixture cleanup verified0. Genuine research3; measured events4/horizon rows8 unchanged. Production build/palette passed; controller/guide static review passed.
