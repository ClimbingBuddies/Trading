# Project Audit — CONV-004

## Review — 22 August 2026, 14:49 AWST

- **Task:** CONV-004 — Surface convergence in frontend
- **Project-plan status at review start:** `IN REVIEW`
- **Decision:** **PASS WITH ADVICE**
- **Final project-plan status:** `DONE`
- **Next promoted task:** UX-001 — Show current Market result beside Opportunity exposure

## Definition of Done

> Technical, AI and Convergence results are shown distinctly.

| Check | Verdict | Independent evidence |
|---|---|---|
| Current GitHub implementation exists | **VERIFIED** | The current `main` branch contains the three-source Assessments overview, comparison table and instrument detail implementation in `app/assessments/page.tsx`, `app/assessments/[symbol]/page.tsx` and `lib/dashboard.ts`. |
| Overview identifies all three systems distinctly | **VERIFIED** | Production `/assessments` renders separate Technical Engine, AI Market Assessment and Market Convergence source cards, plus separate table columns for each persisted result. |
| Instrument detail identifies all three systems distinctly | **VERIFIED** | Production `/assessments/anet` renders three independent result cards with different labels, colour treatments, values, confidence fields and input-boundary explanations. |
| Technical lineage is visible without exposing privileged reads | **VERIFIED** | The Technical card uses the immutable snapshot persisted in `market_convergence_assessments`, displays `market_scores #27`, and states that AI was not used. The frontend uses only public Supabase configuration; direct anonymous `market_scores` visibility remains zero. |
| AI result remains visibly independent | **VERIFIED** | The AI card shows rating, score, confidence, source date and `independent-market-ai-v1`; the supporting brief and evidence are explicitly labelled as AI-owned. |
| Convergence result remains visibly combined and versioned | **VERIFIED** | The Convergence card shows label, score, confidence, source snapshot and `market-convergence-v1`, and states that it is produced only after eligible Technical and AI results exist. |
| Live data supports the displayed contract | **VERIFIED** | Live Supabase contains 71 Technical scores, 30 latest AI results and 30 convergence rows. All 30 convergence rows have complete Technical/AI/combined display fields; duplicate identities, range errors and Technical/AI lineage mismatches are all zero. |
| Public read path is deliberate | **VERIFIED** | Under the real `anon` role, 30 complete convergence snapshots and 90 published AI rows are readable, while direct `market_scores` visibility is zero. No service-role credential is present in `lib/supabase.ts`. |
| Representative rendered values match live lineage | **VERIFIED** | ANET renders Technical Buy 76.1 / 100.0% from `market_scores #27`, AI Buy 67.0 / 82%, and Strong Bullish Convergence 71.5 / 86.4%. These match live Supabase values before display rounding. |
| Production build and routes are healthy | **VERIFIED** | Vercel production deployment `dpl_9DyGZ1kQZoMNTWXgREZJ6XGa2hH5` is `READY` on GitHub commit `fde70603dced8303b6055128927d9b2945a4f65c`; Next.js compilation and TypeScript succeeded, both routes are dynamic, and both returned HTTP 200. |
| Rendered user journey works | **VERIFIED** | Browser verification opened the public Assessments overview, selected ANET, reached the detail route and observed the three labelled result cards with matching live values. No application console or Vercel runtime error was found. |
| Presentation supports later mobile review | **VERIFIED** | The three source/result groups use a three-column desktop grid and collapse to one column below 900px. The broader mobile interaction audit remains the separate UX-003 task. |
| Documentation is updated | **VERIFIED** | `documentation/frontend-route-map.md` documents the three-source overview/detail presentation and public snapshot boundary. |

## Primary evidence inspected

### GitHub

- `automation/project-plan-auditor.md` — blob `50e4ca1d2b7f57505e98418322e6d831b062dfd0`
- `documentation/project-plan.md` — starting blob `281c821ca3361fc4dbd28be877da20a0d2605ae0`
- `app/assessments/page.tsx` — blob `41a658182b8b4c2e8be75bb3b502aef68f196139`
- `app/assessments/[symbol]/page.tsx` — blob `d83ed8a8f6b2b0619642133810ffca209e035232`
- `lib/dashboard.ts` — blob `fdaa3b42621ac05b8d908426bdc1b8484a86c449`
- `app/globals.css` — blob `11729da3483f0f181e34dfc8c010d2166e35981c`
- `lib/supabase.ts` — blob `bbc2a94305b1c80aaa6ee140b955453bad053adc`
- `documentation/frontend-route-map.md` — blob `57bc42295d09915d37b37a4e771f65c302245a7d`

No prior `documentation/project-audits/CONV-004.md` existed.

### Live Supabase — `glvbqcplgjdfgjyknzsa`

- Current Technical, latest-production AI and Market Convergence row counts.
- Completeness, range, duplicate-identity and source-lineage checks across all 30 convergence rows.
- Real `anon` visibility for Technical scores, published AI results and convergence snapshots.
- Representative ANET source/result lineage, including Technical source `market_scores #27`.

### Vercel / production / browser

- Production deployment metadata and build logs for `dpl_9DyGZ1kQZoMNTWXgREZJ6XGa2hH5`.
- HTTP 200 responses for `/assessments` and `/assessments/anet`.
- Browser-rendered overview, comparison table and ANET detail journey.
- Desktop visual inspection of three distinct result cards.
- Application console inspection; only cloud-browser extension telemetry noise was present.
- Vercel runtime error check for both assessment routes over the preceding 24 hours: zero errors.

## Independent result summary

- Technical score rows: **71**
- Latest production AI rows: **30**
- Market Convergence rows: **30**
- Complete public display snapshots: **30**
- Incomplete convergence snapshots: **0**
- Duplicate convergence identities: **0**
- Range errors: **0**
- AI lineage mismatches: **0**
- Technical score/confidence lineage mismatches: **0**
- Anonymous direct Technical score rows: **0**
- Anonymous convergence snapshot rows: **30**
- Production route HTTP status: **200 / 200**
- Application runtime errors: **0**

## Advice

The ANET Technical source record is `market_scores #27` with `score_date = 2026-08-14`, while the detail card labels the Convergence assessment date `2026-08-20` as “Snapshot date.” The overview similarly says the Technical snapshot was “captured” on 20 August. This does not blur the three result systems or break CONV-004, because the immutable Technical record ID, values and input boundary are correct. In later UX work, either relabel the field as “Convergence capture date” or persist and display the underlying Technical score date separately.

## Decision

**PASS WITH ADVICE.**

The public production UI displays Technical, AI and Market Convergence results as three distinct, source-labelled outputs on both overview and detail routes. The values are backed by complete live Supabase lineage, the anonymous read boundary is deliberate, the current Vercel deployment is healthy, and the representative browser journey works. CONV-004 may be marked `DONE`, and UX-001 may be promoted to `NEXT`.
