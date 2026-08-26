# UGUIDE-005 — Producer final assembly and publication QA evidence

**Gate:** Final assembly and publication QA  
**Producer state:** READY_FOR_AUDIT  
**Functional implementation commit:** `2823eb3acd2a4bc171fa83d69c15928e47fe569c`  
**Data or schema effects:** none  
**Evidence timestamp:** 2026-08-26T11:07:45+08:00 (Australia/Perth)

## Final assembly completed

- Reconciled `documentation/frontend-route-map.md` so production `/` correctly redirects to `/admin`; updated its reconciliation date.
- Updated `documentation/README.md` so the Platform User Guide is linked as canonical production user documentation rather than an under-construction artifact.
- Updated the guide status to a final publication candidate pending independent UGUIDE-005 audit.
- Retained explicit `AUTH_REQUIRED` disclosures for Watchlists, Alerts and Strategy owner screenshots because no already-authorised permanent-owner session was available; no private state was fabricated.
- Retained six genuine delivered screenshots; the three owner-only manifest entries remain policy exceptions under the authenticated-screenshot rule.

## Publication QA

- Production `/` resolved to `/admin`.
- Verified `/admin`, `/markets`, `/markets/amd`, `/assessments`, `/assessments/gld`, `/opportunities`, `/opportunities/ai_advanced_packaging`, plus signed-out `/watchlists`, `/alerts` and `/strategies`.
- Re-verified `/markets` at 390 × 844 CSS pixels with no page-level horizontal overflow, horizontally scrollable primary navigation and market table, stacked header and >=44px navigation/filter controls.
- Every relative Markdown link in the guide resolves.
- All six embedded guide images resolve, decode as real images, have meaningful alt text and immediate explanatory captions.
- No-live-trading, non-personalised-advice and `VALIDATE_ROBUSTNESS / continue_testing` boundaries remain explicit.
- Privacy/secret scan found no email, JWT, API-key or common secret pattern.
- No superseded user-guide draft or stale temporary user-guide workflow remained before current transient UGUIDE-005 tooling.

## Known limitations / policy exceptions

- `watchlists-owner-desktop.png`, `alerts-owner-desktop.png` and `strategy-result-desktop.png` remain absent under `AUTH_REQUIRED`; no already-authorised permanent-owner Trading session was available. The screenshot policy requires this disclosure rather than requesting credentials or inventing private evidence.
- Screenshot values are point-in-time examples; captions direct readers to current timestamps and labels.

## Exact next action

Move UGUIDE-005 to `IN REVIEW` under AUDITOR. The Auditor independently reconciles functional commit `2823eb3acd2a4bc171fa83d69c15928e47fe569c`, current production, six delivered screenshots and the authenticated-screenshot policy exception. Only the Auditor may mark UGUIDE-005 DONE and record `USER_GUIDE_PROJECT_COMPLETE`.
