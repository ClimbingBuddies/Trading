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


## Independent Auditor decision

**Decision:** PASS_WITH_ADVICE  
**Audited at:** 2026-08-26T11:44:19+08:00 (Australia/Perth)  
**Functional implementation reviewed:** `2823eb3acd2a4bc171fa83d69c15928e47fe569c`  
**Producer evidence reviewed:** `9d922bf89d3c1a58c8f9641285d754b6b24ae079`  
**Independent browser QA:** GitHub Actions run `32927448601`, job `98053077104` — PASS  
**Data or schema effects:** none

### Independent checks performed

- Retrieved the current project plan, controller journal, Producer evidence, guide and exact functional commit fresh from GitHub.
- Confirmed the functional commit changes only `documentation/user-guide.md`, `documentation/README.md` and `documentation/frontend-route-map.md`.
- Independently verified production `/` resolves to `/admin`, and checked `/admin`, `/markets`, `/markets/amd`, `/assessments`, `/assessments/gld`, `/opportunities` and `/opportunities/ai_advanced_packaging`.
- Independently verified signed-out boundaries for `/watchlists`, `/alerts` and `/strategies`; no private owner state was substituted.
- Reproduced `/markets` at exactly 390 × 844 CSS pixels: no page-level horizontal overflow, 44-pixel navigation/filter targets, horizontally scrollable navigation and table, stacked header and a full-width narrow search control.
- Validated 22 relative guide links; all resolve.
- Validated all six delivered screenshots as unique, decodable, non-blank images with meaningful alt text and immediate captions.
- Confirmed `documentation/README.md` links the Platform User Guide as canonical production user documentation.
- Confirmed `documentation/frontend-route-map.md` now matches production `/` → `/admin`.
- Confirmed the guide retains the no-live-trading, non-personalised-advice, `AUTH_REQUIRED`, troubleshooting, glossary and `VALIDATE_ROBUSTNESS / continue_testing` boundaries.
- Independently queried production Supabase: 30 active instruments; current quote data remains present; Daily Trend Pullback v1 remains `testing`, live execution disabled, the baseline run remains `succeeded` with 249 completed trades, and the persisted review remains `VALIDATE_ROBUSTNESS / continue_testing`.
- Privacy and secret-pattern checks passed; no duplicate delivered screenshots or superseded user-guide drafts were found.

### Findings

- UGUIDE-005 passes and the complete User Guide project satisfies the final completion criteria.
- The three owner-only screenshots remain absent under the explicit `AUTH_REQUIRED` policy because no already-authorised permanent-owner Trading session was available. This is a documented security-preserving exception, not a failed gate.
- Six screenshots are therefore published rather than the nominal seven-to-nine target; the authenticated-screenshot rule takes precedence over fabricating or requesting private credentials.

### Advice

- If an already-authorised owner session becomes available later, the three owner screenshots may be added as a documentation enhancement and independently reviewed, but they are not required to reopen this completed project.
- Re-audit screenshots if the visible production UI materially changes.

**Complete correction set:** none.  
**Final state:** `USER_GUIDE_PROJECT_COMPLETE`.
