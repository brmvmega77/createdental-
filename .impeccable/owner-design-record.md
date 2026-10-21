# Owner cabinet finish record

## Current state — shared cabinet standards, 2026-10-21

Disposition: **SHIP**, following the user's request for full alignment with the existing cabinet standards and the latest `/root/owner_shared_finish` review. This section supersedes the earlier independent Arial styling, 14px-only panel treatment, section selector, and four-item mobile navigation described in the historical record below. No new visual identity or global standard is established.

Reviewed the current `owner.html`, `owner.js`, `owner.css`, `.impeccable/surfaces/owner.md`, `tmp/owner-shared-design-evidence.json`, and capture harness `tmp/owner-design-check.mjs`; visually inspected the eight latest `owner-shared-*` viewport captures. The HTML now loads the actual shared `styles.css`, `orders-overrides.css`, `auth-layout.css`, `mobile-cabinets.css`, `neutral-palette.css`, `clinic-mobile-ui.css`, and interaction cursor stylesheet. Owner markup reuses the shared cabinet, login, logo, footer, heading, panel, KPI, button, field, navigation, and dialog classes. Owner CSS supplies content arrangements and native-dialog adaptations instead of a separate base font and navigation system.

The computed comparison with the chief-technician cabinet records matching inherited Inter/system font stacks at all five sizes. Heading size, panel padding/radius, KPI padding, sidebar treatment, top-bar height/position, and bottom-navigation height also match the incumbent measurements. Desktop panels are 12px radius with 21px padding; mobile/tablet panels are 14px radius with 15px padding. KPI padding follows the existing 18px/14px responsive behavior. Different content creates different card heights; identical content geometry is not claimed.

Desktop uses the incumbent 226px sidebar and its 72px collapsed state. The shared 900px breakpoint switches to the sidebar drawer and five-item bottom navigation (`Обзор`, `Финансы`, `Цех`, `Клиенты`, `Ещё`). The duplicate section selector is removed. Mobile/tablet headers are sticky (60px portrait; 48px landscape), with the existing fixed bottom navigation (64px portrait; 52px landscape). Period selection uses the common mobile sheet. The desktop top bar retains its incumbent static position.

The latest finish review reports that all seven owner sections, mobile drawer and Escape recovery, actual sticky-header scrolling, period-sheet submission, desktop collapse/expand, and synthetic direct-cost saving passed at 1440×1000, 820×1080, 390×844, 320×740, and 844×390 landscape without page overflow or JavaScript errors. The evidence JSON independently confirms the recorded style comparisons. The previous cohort-routing, export accessible-name, and goal-coverage resolutions remain in the implementation.

**Retained limits:** shared `#808080` text against white has approximately 3.9:1 contrast; this inherited limitation remains and this disposition is not an accessibility pass. The asset scan is incomplete. This review does not establish production deployment, accounting completeness, or exhaustive asset validation.

### Current raster provenance

`tmp/owner-design-check.mjs` generated the latest captures through Playwright Chromium using installed Chrome and the `ownerFixture` test HTTP server from `owner-api.test.js`. The harness fulfills `auth-layout.css` from `tmp/owner-live-auth-layout.css` for both owner and incumbent comparisons. These are synthetic fixture captures, not production or customer data. The same fixture advances through each viewport run; direct-cost saving uses 1,000 ₽ materials and zero for the remaining cost fields. Mobile overview captures use the current-month period selected through the sheet. All eight images are viewport captures (`fullPage: false`), unlike the earlier full-page set.

| Current raster | Viewport / raster size | Evidence inspected |
| --- | --- | --- |
| `review/owner-shared-desktop-overview.png` | 1440×1000 | Shared type, sidebar, header, controls, KPI and panel treatment |
| `review/owner-shared-desktop-settings.png` | 1440×1000 | Shared form fields, buttons, panels and sidebar state |
| `review/owner-shared-desktop-cost-dialog.png` | 1440×1000 | Shared dialog typography and field/control treatment |
| `review/owner-shared-tablet-overview.png` | 820×1080 | Tablet header, date control, KPI layout and five-item navigation |
| `review/owner-shared-mobile-overview.png` | 390×844 | Shared mobile typography, stacked KPI cards and five-item navigation |
| `review/owner-shared-mobile-settings.png` | 390×844 | Single-column shared form and accessible primary action placement |
| `review/owner-shared-mobile-cost-dialog.png` | 390×844 | Narrow form fields and retained bottom dialog actions |
| `review/owner-shared-landscape-overview.png` | 844×390 | Shared compact landscape header and bottom navigation |

The 320×740 case is covered by computed and interaction checks; there is no separately saved latest narrow raster. Only this record was changed during this documentation update. `DESIGN.md`, global design files, implementation, and synced reference sources were not changed by this pass.

## Historical record — initial targeted finish (superseded visual description)

The following preserves the earlier review and its raster provenance. Its Arial font, separate navigation, dimensions, and capture descriptions refer to the initial implementation, not the current shared-standard version.

Date: 2026-10-21. Disposition: **SHIP** for the three targeted finish findings, all resolved. This records an ordinary extension of the established Create Dental cabinet. It does not approve a new visual identity or redefine the global design system.

### Historical authority and visual evidence

Reviewed `PRODUCT.md`, `.impeccable/surfaces/owner.md`, `FRONTEND_DESIGN_RULES.md`, the Impeccable document reference, `owner.css`, and `owner.js`. Compared against incumbent `styles.css` and `public/assets/neutral-palette.css`; visually inspected all six rasters below.

The owner surface keeps the incumbent white panels, near-white background (`#fbfbfb`), graphite text (`#333`), restrained gray boundaries and controls, and existing Create Dental logo asset. Desktop retains sidebar navigation. At narrow widths, a section selector and four-item bottom navigation replace it; tables become labeled compact rows and forms become one column. The inspected captures show wrapped Russian labels and no horizontal tab strip. Owner panels use the surface contract's 14px radius, with restrained borders rather than decorative elevation.

Typography is recorded accurately: owner CSS uses `Arial, Helvetica, sans-serif`; incumbent `styles.css` starts with `Inter, ui-sans-serif` and system fallbacks. The owner screen uses the familiar sans-serif hierarchy, but this is not a claim of exact font parity or a change to the incumbent standard. Owner CSS enforces the light color scheme, pointer cursors on actions, visible keyboard focus, and reduced-motion handling. No global design file was changed for this record.

### Historical resolved findings

1. **Financial drill-through scope — resolved.** `Расшифровка` now opens Finance's selected-period orders. Finance defaults to that cohort, names it, and shows its count and total. A separate selector opens current receivables, and the overview's `Проверить оплаты` link explicitly selects that scope. Checked the link attributes, navigation handler, Finance rendering, and cohort-dependent table source in `owner.js`.
2. **Mobile export accessible name — resolved.** The export button has `aria-label="Выгрузить CSV"` even when the visible label is hidden at the mobile breakpoint. Checked the button markup and mobile CSS; the mobile rasters show the intended icon action.
3. **Goal metric coverage — resolved.** Overview shows confirmed-cost orders over all period orders beside contribution, with `Проверить расчёт` opening Economics. On-time completion shows known-date completed orders over all completed orders. Checked the current `goals()` markup and both overview rasters: missing costs remain explicit instead of implying zero cost or complete coverage.

The finish reviewer reported SHIP for these same three findings after checking the updated implementation and recaptured overview screens. This document independently checked their current code evidence and visible overview coverage. The disposition is limited to this finish scope; it is not verification of production deployment or complete accounting data.

### Historical raster provenance

Captures were produced by `tmp/owner-browser-check.mjs` with Playwright Chromium using installed Chrome, against the test HTTP server backed by `ownerFixture` from `owner-api.test.js`. They contain generated synthetic orders `CD-OWNER-A` / `CD-OWNER-B` and clinic `Клиника Альфа`; no production or customer screenshot data is used. Desktop viewport: 1440×1000. Mobile viewport: 390×844. All are full-page captures, so raster height exceeds viewport height; the fixed mobile navigation appears at its captured viewport position.

Desktop captures precede cost entry. Mobile captures follow submission of 1,000 ₽ materials with the remaining direct-cost fields set to zero, plus a 1,200 ₽ expense. The resulting change from 0/2 to 1/2 cost coverage is fixture state progression.

| Raster | Size | Evidence inspected |
| --- | --- | --- |
| `review/owner-desktop-overview.png` | 1440×1607 | Overview hierarchy, cost/date coverage, links, sidebar, neutral panels |
| `review/owner-desktop-economics.png` | 1440×1202 | Missing-cost labels, denominator, order-level cost action, desktop table |
| `review/owner-desktop-settings.png` | 1440×1167 | Goal and password forms, accounting completeness, empty audit state |
| `review/owner-mobile-overview.png` | 390×2716 | Section selector, bottom navigation, wrapped labels, 1/2 cost coverage |
| `review/owner-mobile-economics.png` | 390×1976 | Responsive labeled rows, known and missing costs, retained cost actions |
| `review/owner-mobile-settings.png` | 390×2272 | Single-column fields, usable form actions, completeness and audit entries |

Only `.impeccable/owner-design-record.md` was written by this documentation pass. Implementation, synced reference sources, and existing global design files were preserved.
