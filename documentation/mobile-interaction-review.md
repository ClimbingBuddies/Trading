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

The mobile interaction layer applies a 44px minimum height to the main navigation, Opportunity detail tabs, content-page selects, filter tabs, primary/secondary action buttons, search inputs and detail back links.

The 44px floor is an interaction target, not a visual redesign. Desktop density is unchanged because these rules are confined to mobile breakpoints.

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

Existing responsive behaviour relied upon by this review remains in:

- `app/globals.css`
- `app/opportunities/opportunities.module.css`
- `app/opportunity-carousel-responsive.css`

## Builder verification routes

Representative production routes for independent verification:

- `/markets/ANET` — standard page header, primary action and responsive observation table.
- `/assessments/anet` — standard header/table patterns and filter/action controls where present.
- `/opportunities/ai_datacentre_power_cooling?view=exposure` — Opportunity detail header, six-tab swipe rail and exposure layout.
- `/opportunities` — Opportunity header and swipeable theme carousel.

The Auditor should independently verify these at a narrow/mobile viewport and confirm there is no page-level horizontal overflow caused by headers/actions, while deliberate nav/tab/table rails remain horizontally swipeable.
