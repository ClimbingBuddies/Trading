# Mobile Interaction Review

**Task:** UX-003 — Complete mobile interaction review  
**Reviewed:** 23 August 2026  
**Scope:** headers, tabs, swipe behaviour, touch targets and responsive tables.

## Purpose

This document records the mobile interaction contract used by the Trading frontend. It is intentionally limited to interaction/responsiveness and does not change analytical methodology, persisted data or palette semantics.

## Interaction contract

### Headers

- Standard `.pageHeader` layouts stack vertically at `<= 640px`.
- Opportunity overview/detail headers stack vertically at `<= 760px`.
- Header action groups use the available mobile width and must not force page-level horizontal overflow.
- Detail back links are given a 44px minimum touch target on mobile.

### Primary navigation

- At `<= 900px` the desktop side navigation becomes a horizontal rail.
- The rail supports native touch panning with contained horizontal overscroll.
- Navigation items have a minimum 44px touch target.
- Scroll snapping is proximity-based so a partially visible next item remains discoverable without forcing a rigid carousel.

### Opportunity tabs and swipe behaviour

- Opportunity detail tabs remain a single horizontal row rather than wrapping into multiple lines.
- The tab row is natively swipe-scrollable on touch devices.
- Horizontal overscroll is contained so tab swipes do not create page-level sideways movement.
- Individual tab links have a minimum 44px touch target.
- The existing Opportunity overview carousel remains natively swipeable using `overflow-x: auto`, `scroll-snap-type: x mandatory` and contained overscroll.

### Touch targets

The mobile interaction contract uses a 44px minimum height for material mobile controls across the representative UX-003 flows. This includes:

- primary navigation items;
- Opportunity detail tabs;
- content-page selects and the globally visible palette selector;
- filter tabs and search inputs;
- primary/secondary action buttons and detail back links;
- Market Price History period buttons at the `<= 720px` mobile breakpoint;
- Opportunity action/chip links that are styled as controls;
- client-rendered Opportunity inspector tabs, trend-period buttons and inspector action links.

The 44px floor is an interaction target, not a visual redesign. Desktop density is unchanged because these rules are confined to mobile breakpoints, except that the Price History component retains its existing 32px desktop density and raises only the `<= 720px` controls to 44px.

### Responsive tables

- Standard tables use `.tableScroll { overflow-x: auto; }`.
- Opportunity tables use the existing `.darkTableScroll { overflow-x: auto; }` wrapper.
- On touch layouts, standard table rails explicitly use momentum scrolling, contained horizontal overscroll and touch panning.
- Table cells retain their existing no-wrap behaviour where appropriate, allowing the table to scroll horizontally instead of collapsing unreadably.
- Responsive cards remain cards; this task does not convert tables to duplicated card markup.

## Implementation

Global mobile interaction overrides live in:

- `app/mobile-interaction.css`

The stylesheet is imported after the existing theme and Opportunity responsive layers by:

- `app/layout.tsx`

The Price History mobile-specific target floor is implemented in:

- `components/PriceHistoryChart.module.css`

Existing responsive behaviour relied upon by this review remains in:

- `app/globals.css`
- `app/opportunities/opportunities.module.css`
- `app/opportunity-carousel-responsive.css`
- `app/opportunity-exposure-inspector.css`

## Repeatable verification matrix

The Builder and Auditor should use this matrix at a narrow/mobile viewport. Source and deployed CSS should agree before the task is considered complete.

| Route / surface | Required mobile evidence |
|---|---|
| `/markets/ANET` | Standard header stacks at `<=640px`; back link and primary action are at least 44px high; seven Price History period controls remain in the seven-option grid and are at least 44px high at `<=720px`; `.tableScroll` remains horizontally scrollable with contained overscroll and touch panning. |
| `/assessments/anet` | Standard header/action layout does not force page-level horizontal overflow; back/action controls and any filters/search controls are at least 44px high; wide tables remain inside `.tableScroll`. |
| `/opportunities/ai_datacentre_power_cooling?view=exposure` | Opportunity header/actions stack at `<=760px`; theme select is at least 44px high; six analysis tabs remain one horizontally swipeable row with 44px targets; exposure action links are at least 44px high; client inspector tabs, trend range buttons and inspector action links are at least 44px high when rendered. |
| `/opportunities` | Opportunity header stacks at `<=760px`; theme carousel remains horizontally swipeable with contained overscroll; visible action/chip links use the 44px target floor. |
| Global palette dock | Palette select remains visible and at least 44px high at mobile widths; it must not cause page-level horizontal overflow. |

### Overflow rule

Only deliberate interaction rails may overflow horizontally: primary navigation, Opportunity analysis tabs, Opportunity carousel and table wrappers. Page/header containers themselves must remain within the viewport width.

## Auditor rework closure

The first independent UX-003 audit found the Market Price History period controls at `min-height: 32px` on mobile. The rework closes that exact defect by raising the `<=720px` period controls to 44px while preserving all seven options. The same re-review also hardens the global palette selector and Opportunity inspector/action controls so other representative mobile controls do not remain below the documented target floor.

## Builder verification routes

Representative production routes for independent verification:

- `/markets/ANET` — standard page header, primary action, Price History controls and responsive observation table.
- `/assessments/anet` — standard header/table patterns and filter/action controls where present.
- `/opportunities/ai_datacentre_power_cooling?view=exposure` — Opportunity detail header, six-tab swipe rail, exposure actions and client inspector controls.
- `/opportunities` — Opportunity header and swipeable theme carousel.

The Auditor should independently verify these at a narrow/mobile viewport and confirm there is no page-level horizontal overflow caused by headers/actions, while deliberate nav/tab/carousel/table rails remain horizontally swipeable.
