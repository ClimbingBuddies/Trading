# APPGUIDE-002 — Producer implementation evidence

**Gate:** Navigation and production completion  
**Producer state:** READY_FOR_AUDIT  
**Functional implementation commit:** `bed0f674f6b317f7d13390d5f262d1e9b8b290f6`  
**Verified production deployment:** `dpl_EKWjsb1AGoiU95rcdE5WmaETucf1`  
**Final local Producer QA:** GitHub Actions run `32935199838`, job `98074993878` — PASS  
**Production browser QA:** GitHub Actions run `32935393876`, job `98075534280` — PASS  
**Data or schema effects:** none

## Functional scope

The functional commit changes exactly five files:

- `components/AppNav.tsx`
- `documentation/README.md`
- `documentation/frontend-route-map.md`
- `documentation/user-guide.md`
- `tests/in-app-user-guide.test.mjs`

No Supabase schema/data/RLS/auth, trading methodology, scheduled task, package dependency or build-pipeline contract was changed in APPGUIDE-002.

## Implementation

- Added a normal primary-navigation item `{ href: '/help', label: 'Help', icon: '?' }` after Strategies. It uses the existing shared Next.js `Link` rendering and generic active-state rule.
- Kept `documentation/user-guide.md` as the sole editable guide prose source. The guide now identifies `/help` as its in-app rendering route and includes Help in the access table.
- Reconciled `documentation/README.md` to state that the canonical Platform User Guide is rendered in-app at `/help`.
- Reconciled `documentation/frontend-route-map.md` to record that primary navigation exposes Help using the same link/active-state behaviour as other workspaces.
- Added a deterministic integration test for the Help navigation entry, shared active-state rule and canonical documentation reconciliation.

## Producer QA evidence

### Fresh local production-mode verification

GitHub Actions run `32935199838`, job `98074993878` completed successfully from a fresh checkout before the functional commit was pushed:

- `npm install --no-package-lock` — zero reported vulnerabilities.
- `npm test` — **10/10 PASS**, including the new APPGUIDE-002 navigation/reconciliation test.
- `npm run check:palette` — PASS for 22 guarded component/style files.
- `npm run build` — PASS; `/help` remained statically prerendered and prebuild published exactly six canonical screenshot assets.
- Production-mode local browser verification confirmed:
  - Help exists as a native keyboard-focusable `/help` link and is active on `/help`;
  - direct focus and Enter activation work;
  - all six lazy-loaded screenshots load after entering the viewport and retain meaningful alt text;
  - representative Markdown tables and rewritten GitHub documentation links render;
  - `/help#compact-glossary` lands on the requested heading;
  - privacy/secret-pattern checks pass;
  - at exactly 390 × 844 CSS pixels: document width 375px, Help target 44px, navigation scroll width 818px within 350px viewport rail, article width 355px, image width 321px, and the 680px table remains contained in its 319px scroll region.

Local browser metric evidence:

```text
APPGUIDE_002_VERIFIED_QA_PASS
articleW=355
doc=375
h=844
helpActive=true
helpH=44
imageW=321
navClient=350
navScroll=818
regionClient=319
regionScroll=680
w=390
```

### Current production verification

The production alias now serves deployment `dpl_EKWjsb1AGoiU95rcdE5WmaETucf1`. Direct Vercel fetch confirmed `/help` returns HTTP 200, identifies the canonical `documentation/user-guide.md` source, renders the new **In-app Help** wording and Help access row, and renders Help as `navItem navActive` on `/help`.

GitHub Actions run `32935393876`, job `98075534280` independently exercised the live production alias and passed:

- Help keyboard focus and Enter activation;
- active navigation state;
- canonical title and research/no-live-trading boundary;
- real tables and representative GitHub documentation links;
- all six screenshots with meaningful alt text and successful lazy loading;
- direct `#compact-glossary` heading navigation;
- privacy and secret-pattern checks;
- exact 390 × 844 responsive behaviour with no page-level horizontal overflow.

Production mobile metric evidence matched the local production-mode verification:

```text
APPGUIDE_002_PRODUCTION_QA_PASS
articleW=355
doc=375
h=844
helpActive=true
helpH=44
imageW=321
navClient=350
navScroll=818
regionClient=319
regionScroll=680
w=390
```

## QA-harness calibration notes

Three earlier gated browser attempts exposed only temporary QA-harness assumptions and were prevented from committing functional changes:

- run `32934717956`: exact visible-text assertion ignored the `?` icon rendered with Help;
- run `32934884787`: sending Tab keys to the body element did not model browser focus traversal reliably in headless Chrome;
- run `32935017456`: below-the-fold images were intentionally lazy-loaded, so checking `naturalWidth` before scrolling them into view was invalid.

A separate calibration helper run `32934821773` was denied permission to edit another workflow; it made no application change. The connected GitHub app corrected the temporary helper. The final verified run used native link `tabIndex`, direct focus/Enter activation and viewport-triggered image loading. No failing or unverified functional implementation was pushed to `main`.

## Single-source-of-truth evidence

- `documentation/user-guide.md` remains the only editable guide prose source.
- APPGUIDE-002 did not alter `app/help/page.tsx`, `lib/user-guide.ts` or the canonical-to-generated screenshot pipeline passed by APPGUIDE-001.
- The new navigation merely points to `/help`; it does not duplicate guide content.
- `documentation/README.md` and `documentation/frontend-route-map.md` explicitly preserve the canonical-source contract.

## Cleanup

All temporary APPGUIDE-002 GitHub Actions helpers were removed after evidence capture. A fresh repository lookup returns no `.github/workflows` directory. Generated guide screenshot copies remain ignored build artifacts only.

## Acceptance-criteria result

Every APPGUIDE-002 Producer acceptance criterion is satisfied for handoff:

- Help is present in primary navigation and uses the existing active-state behaviour;
- keyboard focus/activation is verified;
- current production `/help` is verified at desktop and exactly 390 × 844;
- title, research boundary, tables, all six screenshots, representative links and direct heading anchors work;
- page-level horizontal overflow is absent while wide tables remain locally scrollable;
- privacy checks pass;
- canonical guide remains the sole editable prose source;
- documentation index, route map and canonical guide are reconciled;
- temporary project tooling is absent;
- data/schema effects are none.

## Exact next action

Auditor retrieves the current plan, journal, this record, functional commit `bed0f674f6b317f7d13390d5f262d1e9b8b290f6`, current production deployment and relevant source fresh. Auditor independently reproduces APPGUIDE-002 acceptance criteria and either returns one complete correction set or records `IN_APP_USER_GUIDE_PROJECT_COMPLETE`. Producer must not mark this final gate DONE.


## Independent Auditor decision

**Decision:** PASS  
**Audited at:** 2026-08-26T13:55:49+08:00  
**Functional implementation reviewed:** `bed0f674f6b317f7d13390d5f262d1e9b8b290f6`  
**Independent evidence:** GitHub Actions run `32935825791`, job `98076732661` — PASS  
**Data or schema effects:** none  
**Complete correction set:** none  
**Project result:** `IN_APP_USER_GUIDE_PROJECT_COMPLETE`

### Independent findings

The Auditor independently reproduced the final gate from a fresh checkout with a read-only audit workflow and did not rely on the Producer's browser results. The exact five-file functional commit matches the handoff. Current source still reads `documentation/user-guide.md` directly through `lib/user-guide.ts`; APPGUIDE-002 introduced only navigation, documentation reconciliation and a deterministic navigation test, with no duplicate guide prose.

Independent repository checks passed: `npm test` 10/10, palette compliance, and a production Next.js build with `/help` statically prerendered and exactly six canonical screenshot assets published.

Independent local and live browser checks both passed at desktop and exactly 390 × 844 CSS pixels. Help is visible, active only on `/help`, natively focusable, Enter-activatable and has a visible focus treatment (`outline: auto`, 1px plus inset focus shadow). `/markets` correctly activates Markets instead of Help. The title, research/no-live-trading/no-personalised-advice boundaries, rendered tables, all six lazy-loaded screenshots with meaningful alt text, representative GitHub documentation links, the external production link and `/help#compact-glossary` all worked. Privacy/secret-pattern scans found no email address, owner identity, token or secret-like string.

At 390 × 844 the independently reproduced metrics were: document width 375px, article 355px, Help target 44px, navigation 350px client / 818px scroll, table region 319px client / 680px scroll and first image 321px. There was no page-level horizontal overflow; navigation and wide tables retained contained horizontal scrolling.

The temporary Auditor workflow was removed after evidence capture and a fresh `.github/workflows` lookup returned 404. No implementation fixes were made while acting as Auditor.

### Final decision

APPGUIDE-002 satisfies every acceptance criterion. Both APPGUIDE-001 and APPGUIDE-002 are independently audited and DONE. No successor gate is promoted. The project terminates at `IN_APP_USER_GUIDE_PROJECT_COMPLETE`.
