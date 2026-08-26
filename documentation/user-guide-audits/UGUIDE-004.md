# UGUIDE-004 — Producer evidence and independent audit

**Gate:** Document strategy, operations and support  
**Producer state:** READY_FOR_AUDIT  
**Partial functional implementation range:** `147a1be1454a73e974a0f6fe0a43dfcc11b91601..9764401109463ccb1835d295dc05e24255bbe7d7`  
**Data or schema effects:** none  
**Evidence timestamp:** 2026-08-26T10:18:42+08:00 (Australia/Perth)

## Scope completed

The canonical guide now documents the bounded UGUIDE-004 content that can be verified without inventing state:

- Admin loader-health logic, current-data freshness, instrument coverage, Opportunity/Technical telemetry and load-detail interpretation;
- Strategy result reading, including the immutable Daily Trend Pullback v1 metrics, decision path, negative holdout and `VALIDATE_ROBUSTNESS / continue_testing` boundary;
- freshness/session labels, status-colour semantics and valid empty states;
- a seven-step common troubleshooting flow;
- narrow-screen navigation, touch-target and table-scroll guidance from the current responsive contract;
- one genuine 390 × 844 production `/markets` screenshot showing the responsive mobile experience;
- a compact glossary;
- one current, privacy-safe production Admin screenshot with meaningful alt text and a concise caption;
- precise `AUTH_REQUIRED` for the Strategy owner route family.

No application source, Supabase schema/data/policy/function/schedule, Vercel configuration or production state was changed.

## Current production evidence

Production: https://discoverbouldersmarkets.vercel.app

Browser evidence at 1363 × 936 CSS pixels, device-pixel-ratio 1:

- `/` redirected to `/admin`;
- `/admin` rendered **Admin / Data Load Monitoring**, Loader Health **Healthy**, live KPI/freshness bands, Opportunity/Technical telemetry and run history;
- a real Recent Load link opened `/admin/loads/[id]` with a succeeded 3-request / 3-received / 3-inserted run and its three real observations;
- `/markets` rendered the current 30-instrument overview and source-backed status table;
- `/strategies` rendered the signed-out permanent-owner boundary and no authorised owner state.

The Admin screenshot was captured from the same live production session:

| File | Git blob | Format / dimensions | Decision |
|---|---|---|---|
| `documentation/images/user-guide/admin-health-desktop.jpg` | `783d916fa4a77a39d68a4052b32f3f94daf4962e` | JPEG, 1348 × 926 | useful, legible, non-repetitive, no private content |

Its local Git object hash matched the committed blob exactly; SHA-256 was `ff5c055d1ca4fec3db2f3ec1378b270dd961e786a2002f560107005a0725e352`.

## Read-only Supabase evidence

Project: `glvbqcplgjdfgjyknzsa`  
Checked: 26 August 2026, 07:05 Australia/Perth

Aggregate/current evidence only; no owner identifier or private row payload was reproduced:

- 30 active instruments;
- latest live quote observation at 07:00 AWST;
- coverage: 3 under 15 minutes, 7 at 15–60 minutes, 9 at 1–4 hours, 11 over 4 hours, 0 without an observation;
- latest loader run succeeded with 3 requested, 3 received and 3 inserted;
- latest Technical Engine run succeeded with 1,136 indicator rows, 71 score rows and 61 complete / 10 partial scores;
- latest Opportunity run succeeded with 10/10 themes and specification version 1.3;
- Daily Trend Pullback v1 remains `testing`, live execution disabled, 249 completed trades, 28.2199% total return, -8.2656% out-of-sample return, 1.3231 profit factor, 16.2900% maximum drawdown and persisted `VALIDATE_ROBUSTNESS / continue_testing`.

## GitHub/source evidence

| Evidence | Blob SHA |
|---|---|
| `documentation/user-guide.md` | `b3df3d60be3b600a7cf1177686467d9855cced73` |
| `app/admin/page.tsx` | `23e25a82b8e51d1388e07349af017a3596f28961` |
| `app/admin/loads/[id]/page.tsx` | `25cbd5b54f8babcfdab29f24d5eb1db10ef63cb4` |
| `components/StrategyResultsClient.tsx` | `c5617bb9fc3ea474294037806fff461e18014421` |
| `app/globals.css` | `84ded26f48d375b4d254d754130e3dc6e65ffdbd` |
| `app/markets/page.tsx` | `68a5eb1eba1b30e6b858dd2076d7eed14bec589d` |
| `lib/markets-data.ts` | `5aa465a96396b8436b81d5afce476528e29ba70d` |
| `lib/quality-critical.mjs` | `767837f528b271012644380f99780a81106ffbbd` |
| `documentation/operational-runbook.md` | `d740f5fde6bf0be009081d9c3a2461a74de554b2` |
| `documentation/strategy-framework.md` | `c92937bf966382582da554c8fc0f19997d7a104a` |
| `documentation/backtests/daily-trend-pullback-v1-baseline-result.md` | `91d0b482c84c206a078e48b2f8a80e38951e6c5c` |
| `documentation/strategy-reviews/daily-trend-pullback-v1-standard-review.md` | `95847c9e22cae1d3c7c6b5503197173cd91791fd` |
| `documentation/mobile-interaction-review.md` | `2cbf673f05a4cb940e34d542738aab8729b8ea9a` |
| `documentation/pipelines/market-data-pipeline.md` | `df32a282b8f445e770b7bd8b62b173ad780381ac` |
| `documentation/pipelines/technical-engine-operations.md` | `9f5d43191ad58f5b67d87f5bb38907d492e8b4fb` |

## Verification checks

- 17/17 unique Markdown link targets resolve on the default branch.
- All six images currently used in the guide resolve.
- The guide contains no email address, JWT, API key, token or secret pattern.
- The Admin image has unique meaningful alt text and a concise explanatory caption.
- The screenshot contains no email address, user ID, token, secret or private workspace content.
- Status-colour guidance matches current CSS and instructs users to rely on labels, timestamps and counts rather than colour alone.
- Admin and Strategy claims match current source, canonical contracts, production behaviour and read-only database evidence.
- No screenshot, route, row, metric, price, alert, performance result or owner state was fabricated.
- No obsolete guide draft, duplicate screenshot candidate or temporary repository note was created.

## Mobile production evidence

The prior mobile-evidence blocker is resolved. A GitHub-hosted Chromium session opened the live production `/markets` route only after a successful HTTP/route-content check and captured `documentation/images/user-guide/markets-overview-mobile.png` at exactly **390 × 844 CSS pixels**, device-pixel ratio 1. The capture is a direct narrow-browser render, not a desktop crop, resized bitmap, generated mock-up or relabelled image.

| File | Capture commit | Format / dimensions | SHA-256 | Decision |
|---|---|---|---|---|
| `documentation/images/user-guide/markets-overview-mobile.png` | `12e32b4c2d4ab89a956bd10e1b202679579c3232` | PNG, 390 × 844 | `d9bb379e62c8997e723e80c6d177bb24243dfd40a79a85d1d10f8323bc019c24` | accepted as genuine production narrow-viewport evidence |

The same live deployment returned **Markets / Instrument Overview**, **Instrument Overview** and **Search instruments** before capture. Its deployed stylesheet independently confirms the intended narrow behaviour: the side navigation becomes a horizontal overflow rail at ≤900 px, page headers stack at the smaller breakpoint, search becomes full width, the market table remains within its own horizontal scroller, and material controls retain a 44-pixel touch target. The committed PNG is 54253 bytes and passed the exact PNG signature/dimension checks.

## Additional limitation

`AUTH_REQUIRED` remains for `/strategies`, `/strategies/[id]` and `/strategies/[id]/tests/[runId]` because no already-authorised owner session was available. This follows the project screenshot policy and must not be replaced with invented private evidence.

## Exact next action

UGUIDE-004 is `IN REVIEW` with handoff owner AUDITOR. Independently audit the functional evidence set—Admin screenshot/content, Strategy/operations/support guide changes, mobile production screenshot commit `12e32b4c2d4ab89a956bd10e1b202679579c3232`, and guide integration commit `74b44fc6535305f3827c927eb764e6644d3faf32`—against the current plan and live production. The Producer must not promote UGUIDE-005.


## Independent Auditor decision

**Decision:** PASS_WITH_ADVICE  
**Audited at:** 2026-08-26T11:00:46+08:00 (Australia/Perth)  
**Functional implementation reviewed:** `aebabc269a990ae3aaf74fe1d3ebe6841cb2abdb`, `9764401109463ccb1835d295dc05e24255bbe7d7`, `12e32b4c2d4ab89a956bd10e1b202679579c3232`, `74b44fc6535305f3827c927eb764e6644d3faf32`  
**Independent browser evidence:** GitHub Actions run `32924695740`, job `98045110165` — SUCCESS  
**Data or schema effects:** none

### Independent checks performed

- Retrieved the current project plan, controller journal, complete Producer handoff, current guide and exact functional implementation commits fresh from GitHub.
- Re-fetched live production `/admin` and `/strategies`; production deployment `dpl_6WE7pr4DrPpU4qA1FR2eB7dVKmME` returned the current Admin dashboard and the permanent-owner Strategy sign-in boundary.
- Reproduced `/markets` independently in headless Chromium at exactly 390 × 844 CSS pixels, device-pixel ratio 1. The live page had no page-level horizontal overflow (`documentWidth` 375), a horizontally scrollable primary nav (350 client / 741 scroll width), 44-pixel nav items, a stacked page header, a horizontally scrollable market table (349 client / 855 scroll width), a 321-pixel search field and 44-pixel filter controls.
- Independently validated the committed mobile screenshot as PNG 390 × 844 and the Admin screenshot as JPEG 1348 × 926; both contained substantial non-blank visual variation.
- Confirmed the live mobile route contained Markets / Instrument Overview, Instrument Overview, Search instruments and Market Data Status Summary, with no email address exposed.
- Confirmed the live Admin route contained Loader Health, Data Freshness, Opportunity Engine, Technical Engine and Recent Load History, with no email address exposed.
- Confirmed the signed-out Strategy route resolves to `Sign in to view strategy evidence`, offers a secure email-link flow and states that real strategy tests/review outcomes are private to their owner.
- Queried Supabase production read-only for the immutable Daily Trend Pullback v1 baseline and decision: strategy remains `testing`, live execution is disabled, run is `succeeded`, 249 completed trades, 28.2199% total return, -8.2656% out-of-sample return, 1.3231 profit factor, 16.2900% maximum drawdown and persisted `VALIDATE_ROBUSTNESS / continue_testing`.
- Inspected production RLS policies: strategy definitions, test runs and decision evaluations are owner-scoped for authenticated reads; the Strategy frontend additionally filters by the authenticated owner ID.
- Verified the production freshness contract directly from `latest_market_status` and its functions: closed equity/ETF sessions return `market_closed`; active observations are Current through 90 minutes, Due through 120 minutes and Stale thereafter; missing observations are represented rather than fabricated.
- Confirmed the guide contains meaningful alt text and captions for the Admin and mobile images, a compact glossary, status/empty-state explanations and the required troubleshooting flow.

### Findings

- All UGUIDE-004 acceptance criteria pass.
- The strategy discussion preserves the negative holdout and correctly distinguishes `continue_testing` from promotion or live-trading authority.
- Admin, freshness/status, empty-state, troubleshooting and glossary guidance match current production/source behaviour.
- The previously blocked mobile evidence is genuine, current, useful and independently reproducible.
- The Strategy owner screenshot remains `AUTH_REQUIRED`, which is explicitly allowed by the project screenshot policy when no already-authorised permanent-owner session exists. No private state was fabricated.

### Advice for UGUIDE-005

- If an already-authorised permanent-owner session is available during final publication QA, capture the missing owner screenshots then; otherwise retain the explicit `AUTH_REQUIRED` disclosures rather than weakening the security boundary or inventing evidence.
- Reconcile the previously recorded stale root-route statement in `documentation/frontend-route-map.md` against production `/` → `/admin` as part of the final assembly/reconciliation gate.
- Re-check screenshot currency against the final production deployment before publication, as required by the project plan.

**Complete correction set:** none.  
**Next gate:** UGUIDE-005 — Final assembly and publication QA.
