# UGUIDE-004 — Producer implementation evidence

**Gate:** Document strategy, operations and support  
**Producer state:** BLOCKED — NOT_READY_FOR_AUDIT  
**Partial functional implementation range:** `147a1be1454a73e974a0f6fe0a43dfcc11b91601..9764401109463ccb1835d295dc05e24255bbe7d7`  
**Data or schema effects:** none  
**Evidence timestamp:** 26 August 2026, 07:06 Australia/Perth

## Scope completed

The canonical guide now documents the bounded UGUIDE-004 content that can be verified without inventing state:

- Admin loader-health logic, current-data freshness, instrument coverage, Opportunity/Technical telemetry and load-detail interpretation;
- Strategy result reading, including the immutable Daily Trend Pullback v1 metrics, decision path, negative holdout and `VALIDATE_ROBUSTNESS / continue_testing` boundary;
- freshness/session labels, status-colour semantics and valid empty states;
- a seven-step common troubleshooting flow;
- narrow-screen navigation, touch-target and table-scroll guidance from the current responsive contract;
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
- All five images currently used in the guide resolve.
- The guide contains no email address, JWT, API key, token or secret pattern.
- The Admin image has unique meaningful alt text and a concise explanatory caption.
- The screenshot contains no email address, user ID, token, secret or private workspace content.
- Status-colour guidance matches current CSS and instructs users to rely on labels, timestamps and counts rather than colour alone.
- Admin and Strategy claims match current source, canonical contracts, production behaviour and read-only database evidence.
- No screenshot, route, row, metric, price, alert, performance result or owner state was fabricated.
- No obsolete guide draft, duplicate screenshot candidate or temporary repository note was created.

## Mandatory blocker

UGUIDE-004 is not ready for independent audit because its Definition of Done requires one representative mobile screenshot.

The available controlled production browser exposes only a fixed 1363 × 936 CSS-pixel viewport and advertises no viewport/device-emulation capability. A direct narrow capture could not be produced. Repository evidence confirms `documentation/images/user-guide/markets-overview-mobile.png` does not exist.

Required resolution:

1. provide a supported browser/session capable of a genuine narrow production viewport, recommended 390 × 844 CSS pixels;
2. open the current production `/markets` route;
3. verify horizontal mobile navigation, stacked header, readable controls and deliberate table scrolling;
4. capture and inspect `documentation/images/user-guide/markets-overview-mobile.png`;
5. confirm it is current, legible, privacy-safe, non-repetitive, correctly captioned and has meaningful alt text;
6. re-run all gate checks before moving UGUIDE-004 to `IN REVIEW`.

A desktop crop, resized desktop bitmap, sign-in form, generated mock-up or relabelled image is not acceptable.

## Additional limitation

`AUTH_REQUIRED` remains for `/strategies`, `/strategies/[id]` and `/strategies/[id]/tests/[runId]` because no already-authorised owner session was available. This follows the project screenshot policy and must not be replaced with invented private evidence.

## Exact next action

Keep UGUIDE-004 `IN PROGRESS` with handoff owner PRODUCER. Resume only after a genuine narrow production viewport becomes available; capture the mobile image, update this evidence, verify the complete gate, then submit the mandatory full Producer handoff. The Auditor must not audit or promote UGUIDE-005 while the gate remains blocked.
