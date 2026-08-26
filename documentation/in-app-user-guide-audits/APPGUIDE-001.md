# APPGUIDE-001 — Producer implementation evidence

**Gate:** Render canonical guide at `/help`  
**Producer state:** READY_FOR_AUDIT  
**Functional implementation range:** `7f0b31f939e49b4c6b9f40bcb068aba30766d92e^..1a336ee074a2d7177984c425ddc3ca0c948d4732`  
**Producer QA:** GitHub Actions run `32928898467`, job `98057174915` — PASS  
**Data or schema effects:** none

## Functional scope

The functional range contains eight commits after the Producer start checkpoint and changes exactly these eight files:

- `.gitignore`
- `app/help/help.module.css`
- `app/help/page.tsx`
- `documentation/frontend-route-map.md`
- `lib/user-guide.ts`
- `package.json`
- `scripts/sync-user-guide-assets.mjs`
- `tests/in-app-user-guide.test.mjs`

`components/AppNav.tsx` is deliberately unchanged; Help navigation belongs to APPGUIDE-002 after this gate passes independent audit.

## Implementation

- Added public static `/help` App Router page.
- The page calls `loadUserGuideMarkdown()` which reads `documentation/user-guide.md`; the guide prose is not duplicated in application source.
- Added `react-markdown` 10.1, `remark-gfm` 4.0.1 and `rehype-slug` 6.0 for CommonMark/GFM rendering and stable heading IDs. Raw arbitrary HTML rendering is explicitly skipped.
- Relative canonical-document links are normalised from the guide's `documentation/` location and rewritten to `https://github.com/ClimbingBuddies/Trading/blob/main/...`; application-root, heading, mail, telephone and external HTTP(S) links retain their intended semantics.
- Canonical screenshot paths under `documentation/images/user-guide/` are rewritten to `/generated/user-guide/<filename>`.
- `scripts/sync-user-guide-assets.mjs` parses the canonical Markdown and copies only referenced guide screenshots to the generated public directory before dev/build. The generated directory is ignored by Git.
- Help-specific CSS uses the existing `--theme-*` palette tokens, responsive images, contained horizontally scrollable tables, readable typography and visible focus outlines.
- `documentation/frontend-route-map.md` now documents `/help` as public read-only and identifies `documentation/user-guide.md` as its source.
- Added deterministic integration tests for the canonical source path, no prose duplication, GFM/slug configuration, safe document-link mapping, exact screenshot publication and route/build contracts.

## Producer QA evidence

GitHub Actions run `32928898467`, job `98057174915` independently ran from a fresh checkout and completed successfully:

- `npm install --no-package-lock` — 181 packages installed, zero reported vulnerabilities.
- `npm test` — 9/9 tests passed, including all five new APPGUIDE-001 integration tests.
- `npm run check:palette` — passed for 22 guarded component/style files.
- `npm run build` — Next.js 16.3.3 compiled and TypeScript checked successfully; `/help` appeared as `○ /help` (static prerendered content).
- Prebuild published exactly six canonical user-guide screenshot assets.
- A production-mode `next start` instance served `/help`; rendered HTML contained:
  - the canonical `Discover Boulders Markets — User Guide` title;
  - the `does not place live trades` research boundary;
  - a real `<table>`;
  - Admin screenshot alt text;
  - stable `id="before-you-begin"` heading anchor;
  - rewritten GitHub documentation links;
  - `/generated/user-guide/admin-health-desktop.jpg`.

## Single-source-of-truth evidence

- Canonical editable prose remains only `documentation/user-guide.md`.
- `app/help/page.tsx` contains no copy of the canonical guide title/prose and reads the canonical loader.
- `lib/user-guide.ts` names `documentation/user-guide.md` explicitly as `USER_GUIDE_REPOSITORY_PATH`.
- Generated screenshot copies are ignored build artifacts under `public/generated/user-guide/`; committed screenshot sources remain `documentation/images/user-guide/`.

## Documentation impact

`documentation/frontend-route-map.md` was updated in the same functional range because APPGUIDE-001 introduces the `/help` frontend route. No schema, auth, RLS, schedule, methodology or production-data documentation changed because those contracts were not affected.

## Cleanup

The temporary Producer QA workflow was removed after evidence capture by commit `86952a2f4e20025ddd6f8453b24e090d01a3cf60`. It is outside the functional implementation range.

## Known limitations / deliberate deferrals

- Help is not yet in `components/AppNav.tsx`; APPGUIDE-002 owns navigation and production completion after independent audit of this rendering gate.
- Production Vercel verification is intentionally a later APPGUIDE-002 acceptance criterion. APPGUIDE-001 proved the production build and production-mode local route render.

## Exact next action

Auditor retrieves the current plan/journal, this evidence record and functional range fresh; independently reproduces APPGUIDE-001 acceptance criteria. Producer must not edit the IN REVIEW implementation or begin APPGUIDE-002 unless the Auditor passes this gate and promotes it.
