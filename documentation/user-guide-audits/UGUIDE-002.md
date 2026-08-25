# UGUIDE-002 — Producer Evidence

**Task:** Document public navigation and assessment dashboards  
**Status:** Awaiting independent audit  
**Authoritative implementation range:** `41b8f433f4302fb755566f02d336374a3df8b0b4^..9d405c7bb519c1ef203821d079e8f77bcdc74c6d`  
**Functional base/checkpoint:** `8746c0e6de55b23825ea1f339a6c4093e605a096`  
**Production verified:** 2026-08-26T03:13:26+08:00  
**Production:** https://discoverbouldersmarkets.vercel.app

## Implemented scope

Updated `documentation/user-guide.md` with task-based public instructions for:

- persistent navigation and public/read-only access;
- Markets search, asset-class filters, row interpretation and freshness checks;
- instrument detail, observation lineage, price history, current Market result and separate Opportunity exposure;
- the Market Assessment overview and detail workflow;
- independent Technical Engine and AI Market Assessment interpretation;
- downstream Market Convergence, disagreement and confidence interpretation;
- Opportunity overview, theme detail tabs, Structural Opportunity, Technology Inflection and Opportunity Convergence;
- the boundary between long-term theme/exposure scores and short-term Market decisions.

Added exactly the four production screenshots assigned to UGUIDE-002. No private workspace, strategy or Admin procedure was implemented.

## Exact changed files

Final diff from `8746c0e6de55b23825ea1f339a6c4093e605a096` to `9d405c7bb519c1ef203821d079e8f77bcdc74c6d` contains only:

- `documentation/user-guide.md`
- `documentation/images/user-guide/markets-overview-desktop.png`
- `documentation/images/user-guide/instrument-detail-desktop.png`
- `documentation/images/user-guide/assessment-detail-desktop.png`
- `documentation/images/user-guide/opportunity-detail-desktop.png`

The range contains three functional commits: initial screenshot blobs, correction to true PNG encoding, and the guide integration. The final state is authoritative.

## Production/browser verification

All routes were inspected in the current production UI through the same desktop browser session at a stable 1363 × 936 CSS-pixel viewport, device-pixel ratio 1:

| Route | Verified visible behaviour |
|---|---|
| `/markets` | persistent navigation, five asset-class filters, search, 30 instrument rows, observation/session/status/provider columns |
| `/markets/amd` | latest price/observation/load time, current Hold result, two separate Opportunity exposures, history controls and recent observations |
| `/assessments` | three distinct source populations, latest assessment set, rating distribution and row-by-row comparison |
| `/assessments/gld` | separate Technical, AI and Market Convergence cards with dates, methodology, confidence, lineage and input boundaries |
| `/opportunities` | long-term/non-Buy-Sell boundary, latest-run summary and 10 current theme cards |
| `/opportunities/ai_advanced_packaging` | Overview plus Investment Case, Synergies, Exposure, Events and AI Recommendation tabs; distinct Structural, Technology and Convergence cards |

No authenticated session was needed or used for this public-only gate.

## Screenshot evidence

| File | Final Git blob | Raster | Route | Privacy and instructional check |
|---|---|---|---|---|
| `markets-overview-desktop.png` | `221139f8bc4bc797c00f3189a42548951a648ffe` | 1348 × 926 PNG | `/markets` | legible navigation, filters, rows and freshness; no personal data |
| `instrument-detail-desktop.png` | `b0984fa5fde5cdbaca7dde9de6b80c81cba76cfe` | 1348 × 926 PNG | `/markets/amd` | shows current result and separate theme exposure; no personal data |
| `assessment-detail-desktop.png` | `7ebfe5489aba0046bab983d42d266bb4d4ef989b` | 1348 × 926 PNG | `/assessments/gld` | shows all three Market branches and source boundaries; no personal data |
| `opportunity-detail-desktop.png` | `9513fcb8833a05bf3016660f053e3907bbd67cdd` | 1363 × 936 PNG | `/opportunities/ai_advanced_packaging` | shows all three long-term branches; no personal data |

Each image is referenced once in the guide with unique meaningful alt text and a concise explanatory caption. The final Git tree contains these four images only in `documentation/images/user-guide/`; no duplicate candidate remains.

## GitHub source and canonical-document verification

Fetched and checked the current implementation source:

- `app/markets/page.tsx` — blob `68a5eb1eba1b30e6b858dd2076d7eed14bec589d`
- `app/markets/[symbol]/page.tsx` — blob `b9f1fd19db6069429d687535c616b4963a4ecf4c`
- `app/assessments/page.tsx` — blob `41a658182b8b4c2e8be75bb3b502aef68f196139`
- `app/assessments/[symbol]/page.tsx` — blob `d83ed8a8f6b2b0619642133810ffca209e035232`
- `app/opportunities/page.tsx` — blob `d66cf2d0ffc77743f1074d5ff8eb6b86d39c54c8`
- `app/opportunities/[theme]/page.tsx` — blob `dc31ea8af6035229a4499090ab1e01ebd1e79bd3`
- supporting market/dashboard/Opportunity query modules.

Fetched the current canonical route, architecture and methodology documents, including the frontend route map, assessment-system overview, market-data pipeline, Technical scoring specification, Market Convergence specification, Opportunity pipeline and daily Opportunity specification.

## Read-only persisted evidence

A read-only Supabase check corroborated the visible representative states at verification time:

- 30 active instruments and 30 rows in the latest AI assessment set;
- 30 rows in the latest Market Convergence set;
- AMD latest price 478.94 USD at 26 August 2026 02:30 AWST, Hold/50 with 78% AI confidence, and two active theme exposures;
- GLD Technical 54.57/Hold, AI 79/Buy and Market Convergence 66.79/moderate_bullish under `market-convergence-v1`;
- 10 active/watch Opportunity themes;
- Advanced Packaging for AI Compute: Structural 87.6, Technology 90 and Opportunity 88.8/transformational under `opportunity-convergence-v1`.

These are audit observations, not hard-coded guide promises. No database row, schema, policy, function or schedule was changed.

## Checks

- compared exact functional range: three commits, five final changed files, no application code;
- confirmed the guide has four UGUIDE-002 image references, four meaningful alt texts and four captions;
- verified the final Git tree points to the four expected PNG blobs;
- verified local file signatures are true PNG and inspected every final screenshot at original resolution;
- confirmed no email address, user ID, token, secret or authenticated workspace state is visible;
- scanned guide text for email addresses and common secret/token patterns; none found;
- verified public versus authenticated boundaries and prominent no-live-trading/non-advice wording remain intact;
- confirmed no fabricated row, metric, price, score, event or evidence was introduced;
- confirmed all factual system-boundary statements against current source, canonical specifications and read-only persisted evidence.

## Acceptance-criteria trace

| UGUIDE-002 criterion | Evidence |
|---|---|
| Explain navigation | persistent left-navigation procedure in section 2 and Markets screenshot |
| Explain Markets | search/filter/status task sequence and Markets screenshot |
| Explain instrument detail | observation, assessment, Opportunity-separation, history and recent-row sequence plus AMD screenshot |
| Explain Market Assessment | overview-to-detail workflow and source/date/evidence reading order |
| Explain Technical/AI/Convergence | independent branches, eligible downstream combination, confidence and disagreement procedure plus GLD screenshot |
| Explain Opportunity themes | overview, six detail tabs, three long-term branches and exposure boundary plus theme screenshot |
| Current screenshots | four current production captures, final Git blobs and route evidence above |
| Verify against source/production/data | source SHAs, browser observations and read-only query evidence above |
| Documentation-only boundary | final functional diff contains only guide and image files; data/schema effects none |

## Known limitations

- Production currently redirects `/` to `/admin`, while `documentation/frontend-route-map.md` still says `/markets`. This pre-existing non-blocking advice remains assigned for reconciliation no later than UGUIDE-005; UGUIDE-002 does not alter that route map.
- Screenshots accurately record production at the stated verification time. UGUIDE-005 must re-check them if the visible UI materially changes before publication.
- Private Watchlists, Alerts and Strategy evidence remain intentionally outside this gate.

## Exact next action

The independent Auditor compares `41b8f433f4302fb755566f02d336374a3df8b0b4^..9d405c7bb519c1ef203821d079e8f77bcdc74c6d` with UGUIDE-002, opens every screenshot, rechecks the documented routes and claims against current source and read-only production evidence, and issues PASS/PASS WITH ADVICE or one complete correction set. The Producer must not edit UGUIDE-002 while it is IN REVIEW.
