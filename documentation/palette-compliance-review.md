# Palette Compliance Review

**Task:** UX-004 — Maintain palette compliance  
**Reviewed:** 23 August 2026  
**Scope:** shared/new frontend components added or materially changed through the Cross-system UX and mobile interaction work.

## Purpose

New or materially changed components must consume the global semantic palette rather than introducing fixed page colours. The five selectable palettes remain defined centrally; component code should reference semantic `--theme-*` variables for surfaces/text/status and `--chart-*` variables for chart series/grid treatment.

## Semantic contract

Use these families instead of raw colour literals in component code:

- surfaces: `--theme-bg`, `--theme-bg-alt`, `--theme-panel`, `--theme-panel-2`, `--theme-panel-3`;
- borders/rows: `--theme-border`, `--theme-border-soft`, `--theme-row-hover`;
- text: `--theme-text`, `--theme-text-secondary`, `--theme-muted`, `--theme-muted-2`;
- actions: `--theme-accent`, `--theme-accent-strong`, `--theme-accent-soft`;
- status: `--theme-success`, `--theme-success-soft`, `--theme-warning`, `--theme-warning-soft`, `--theme-danger`, `--theme-danger-soft`, `--theme-purple`, `--theme-cyan`;
- charts: `--chart-1` through `--chart-6` and `--chart-grid`.

Palette definitions themselves remain in the theme files and are intentionally allowed to contain literal colour values. The legacy Opportunity stylesheet `app/opportunities/opportunities.module.css` retains historical local defaults, but `app/theme.css` remaps its `--opp-*` variables into the selected global palette. UX-004 does not rewrite that entire legacy stylesheet; it prevents new/shared component layers from adding new fixed-colour islands.

## UX-004 remediation

The following current component-specific colour literals were replaced with semantic tokens:

- `app/opportunity-exposure-inspector.css`
  - selected/hovered exposure surfaces;
  - inspector tabs and text hierarchy;
  - positive/negative status colours;
  - trend ranges and action links;
  - trend grid/series now use `--chart-grid`, `--chart-1` and `--chart-6`;
  - empty-state and takeaway colours.
- `app/opportunities/opportunity-daily-status.module.css`
  - daily-run strip, status icon, metrics, deltas and update pills;
  - event/success/warning treatments now derive from semantic status tokens;
  - Opportunity-card footer separator now uses `--theme-border-soft`.
- `components/OpportunityCarousel.tsx`
  - removed the fixed inline blue footer border and moved it into the semantic CSS module class.
- `components/PriceHistoryChart.module.css`
  - period controls, hover/active states, metadata and panel treatment now use semantic tokens;
  - the chart progress indicator continues to use `--chart-1`.

Existing shared chart components already use chart tokens, including `LoadChart`, `AssessmentDonut`, `OpportunityHistoryChart` and `PriceHistoryChart`.

## Regression guard

`npm run check:palette` executes `scripts/check-palette-compliance.mjs`.

The guard scans:

- all JavaScript/TypeScript/CSS files under `components/`;
- `app/mobile-interaction.css`;
- `app/opportunity-exposure-inspector.css`;
- `app/opportunities/opportunity-daily-status.module.css`.

It fails when raw hex, rgb/rgba or hsl/hsla colour literals are introduced into those shared/new component surfaces. `prebuild` runs the guard before `next build`, so production builds cannot silently accept a regression in the guarded component layer.

Theme-definition files and the legacy Opportunity module stylesheet are intentionally outside this literal scan because they own palette definitions/backward-compatible local defaults rather than new component presentation.

## Builder verification

Vercel production build for commit `9661b5f29c744f7bc7b4c7dbe0234ce9d0445668` ran:

1. `npm run check:palette` — passed for 16 component/style files;
2. Next.js production compilation — passed;
3. TypeScript — passed;
4. static/dynamic route generation — passed;
5. deployment — reached `READY`.

## Auditor verification matrix

The independent Auditor should verify:

| Check | Evidence |
|---|---|
| Source guard is active | `package.json` contains `check:palette` and `prebuild`; `scripts/check-palette-compliance.mjs` scans the documented component scope. |
| Guard actually passes | Inspect Vercel build logs for the reviewed commit and confirm the palette check reports success before Next.js build. |
| Exposure inspector is semantic | `app/opportunity-exposure-inspector.css` contains theme/chart variables and no raw colour literals. |
| Daily Opportunity status is semantic | `app/opportunities/opportunity-daily-status.module.css` contains theme variables and no raw colour literals. |
| Opportunity overview card footer is semantic | `components/OpportunityCarousel.tsx` no longer emits an inline raw-colour border. |
| Price History controls are semantic | `components/PriceHistoryChart.module.css` uses theme/chart tokens and retains UX-003's 44px mobile period controls. |
| Production remains healthy | Exercise `/markets/ANET`, `/opportunities`, and `/opportunities/ai_datacentre_power_cooling?view=exposure`; verify current production deployment/runtime health. |

## Boundary

UX-004 is a component compliance and regression-prevention task. It does not change analytical calculations, Supabase data, assessment methodology, or the five palette definitions themselves.
