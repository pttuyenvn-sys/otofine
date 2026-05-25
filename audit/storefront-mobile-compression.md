# Storefront mobile compression pass

**Date:** 2026-05-25
**Scope:** `/shops/[slug]` storefront tree and the wildcard subdomain
storefront. Frontend-only. No backend, API, schema, routing,
middleware, RFQ, product canonical, or SEO changes.

## 1. Goal

Mobile scroll-depth on the storefront's home page was ~3,455 CSS px
on iPhone 13 — meaning a buyer had to scroll roughly **9 viewports**
before reaching the catalogue footer. The hero alone took 35% of the
first viewport, the contact card stack pushed products below the
fourth screen, and on `san-pham` the category sidebar rendered
ABOVE the product grid (the worst mobile UX in the codebase).

The pass keeps the desktop layout pixel-stable while compressing the
mobile experience to:

* a single short hero (name + verified badge + short description)
* a sticky 44px tab strip
* one-tap drawers for categories + vehicle filters
* expandable contact card with deferred map mount
* clamped storefront intro (~180px) with "Xem thêm"
* a 3-button floating bottom CTA (Gọi / Zalo / **Tìm phụ tùng** — new)
* tighter product cards

## 2. Measured impact

Full-page screenshots captured via Playwright on three target
viewports BEFORE and AFTER the pass:

| Page              | Mobile before | Mobile after | Δ          | % reduction |
|-------------------|---------------|--------------|------------|-------------|
| iphone-home       | 3,455 px      | 1,844 px     | −1,611 px  | **−47%**    |
| iphone-san-pham   | 4,801 px      | 3,871 px     | −930 px    | **−19%**    |
| iphone-gioi-thieu | 1,632 px      | 1,580 px     | −52 px     | −3%         |

| Page              | Desktop before | Desktop after | Δ       | Status |
|-------------------|----------------|---------------|---------|--------|
| desktop-home      | 1,830 px       | 1,870 px      | +40 px  | **No regression** (within rendering variance) |

Per-component evidence in `audit/screenshots/storefront-mobile-compression/{before,after}/{iphone,android,desktop}-{home,san-pham,gioi-thieu,lien-he}.png`.

## 3. Component-level changes

### `ShopHeader.jsx`
* Cover ratio: `16:7` (mobile) → `16:11` (mobile); desktop stays `16:5`.
* Avatar: `80px` → `56px` on mobile; desktop stays `112px`.
* Utility topbar (phone + hours + follow/share/search): hidden on
  `<sm`; surface kept identically on desktop.
* Hero meta line (province · rating · customers): hidden on `<sm`;
  same desktop behaviour.
* Hero CTAs (Nhắn tin / Gọi ngay buttons): hidden on `<sm` — the
  floating bottom CTA already provides Call + Zalo persistently;
  desktop keeps hero CTAs.
* NEW mobile-only quick-search + short-description block rendered
  under the cover (re-houses the topbar search the old layout
  hid behind the icon). Submits to `/shops/<slug>/san-pham?q=…`.

### `ShopTabs.jsx`
* Strip height: `~56px` → `~44px` on mobile (`py-3` → `py-2.5`,
  `text-sm` → `text-[13px]`). Desktop unchanged.
* Underline thickness: `3px` → `2px` on mobile; same animation.
* Sticky behaviour preserved.

### `ShopProductCard.jsx`
* Body padding: `p-3` → `p-2` on mobile; desktop stays `p-3`.
* Title font: `text-sm` → `text-[13px]` on mobile.
* Vehicle line: already single-line truncated; verified preserved.
* Part-type pill: padding `px-2 py-0.5` → `px-1.5 py-0.5`, font
  `text-[11px]` → `text-[10px]` on mobile.
* Min-height of title row reduced from `2.5rem` → `2.25rem` so the
  2-line clamp doesn't force phantom whitespace on 1-line names.

### NEW `ShopMobileCategories.jsx`
* `lg:hidden` chip-style trigger button labelled "Danh mục: <current>"
  surfaced ABOVE the product grid.
* Bottom-sheet drawer (slide-up + scrim) mounted ONLY when open —
  no hidden subtree, no `display:none` cost on closed state.
* Scroll-lock on `<body>` while open; ESC + scrim tap dismiss.
* Uses the same `useShopFilterParams` URL-state hook the desktop
  sidebar uses → category state stays in `?category=<slug>` and
  deep-links work identically across breakpoints.

### NEW `ShopMobileFilters.jsx`
* `lg:hidden` single ~44px row: `[ 🔍 search ][ ⚙︎ Lọc · N ]`
* Bottom-sheet houses brand / model / year selects.
* Active filter badge on the "Lọc" pill (count of active vehicle
  filters) so the buyer sees state without opening the sheet.
* Search input pushes to URL with the same 300ms debounce contract
  as the desktop filter row — back/forward and shareable links
  behave identically across breakpoints.

### `ShopFilters.jsx`
* Wrapped in `hidden lg:block` — desktop keeps the original 4-input
  inline row; mobile gets the drawer above.

### `ShopSidebar.jsx`
* Wrapped in `hidden lg:block` — desktop keeps the always-visible
  category column; mobile uses `ShopMobileCategories` instead.

### `ShopContactCard.jsx` (rewritten)
* Mobile compact view: phone + zalo + address only.
* "Xem thêm" toggle reveals facebook + email + working-hours rows
  AND the map placeholder.
* Map placeholder NOT mounted on first paint when collapsed →
  reserves zero `aspect-[16/8]` space until the user opts in.
* Desktop (`lg:`): all rows + map render unconditionally via
  `lg:!block` override. Identical to the previous version.

### NEW `ShopIntroClamp.jsx`
* Wraps `ShopRichContentRenderer` with a CSS `max-height: 180px`
  + bottom gradient fade on `<lg`.
* "Xem thêm / Thu gọn" toggle below the clamp.
* Smooth `max-height` transition (no JS height measurement during
  expand → no layout shift).
* Self-measures on mount + resize: if natural content height is
  ≤ clamp, the toggle hides itself.
* SSR-safe: full HTML always ships to client; only its overflow
  is hidden. No hydration mismatch, no content invisible to
  crawlers.

### `ShopFloatingMobileCTA.jsx`
* Third button changed from `Facebook` → `Tìm phụ tùng` (links to
  `/rfq/new`).
* New analytics event `ShopsiteEvents.RFQ_CTA_CLICK` so we can
  measure the value of the universal RFQ pivot path.
* Safe-area-inset behaviour, blurred backdrop, `sm:hidden` all
  preserved.

### Page-level wiring
* `app/(shopsite)/shops/[slug]/page.js` — mounts
  `<ShopMobileFilters />` + `<ShopMobileCategories />` above the
  product grid; hides the desktop About / Promo / Contact column
  on `<lg` (those signals are covered by hero + floating CTA);
  `ServiceFooter` hidden on `<lg` (same trust signals already
  surfaced via the trust-badge strip).
* `app/(shopsite)/shops/[slug]/san-pham/page.js` — same mobile
  drawer mounts; mobile no longer scrolls past the category
  sidebar before reaching products.
* `app/(shopsite)/shops/[slug]/gioi-thieu/page.js` — uses
  `<ShopIntroClamp>`; cover halved to `16:9` on mobile (vs `16:6`
  desktop); StatBox padding tightened on mobile.

## 4. Performance

* **No layout shift**: every collapsible uses `display:none`
  toggling between states; expandable content uses a CSS
  `max-height` transition (not JS-measured height swaps).
* **No hydration mismatch**: drawers render an identical SSR
  snapshot (closed-state); `useState` flips run after mount.
  `ShopIntroClamp` always ships the full HTML — only its overflow
  is hidden — so SSR and hydration produce byte-identical DOM.
* **Deferred mounting**: drawer bodies (`ShopMobileCategories`,
  `ShopMobileFilters`) only mount their inner subtree when
  `open === true`. Map placeholder in the contact card only
  mounts when the mobile user opts in via "Xem thêm".
* **No network changes**: same `useShopFilterParams` URL state,
  same `/api/public/shops/<slug>/...` calls, same debounced
  search behaviour.

## 5. Hard constraints honoured

| Constraint | Status |
|---|---|
| Don't touch SEO | None of `app/[slug]/page.js`, `lib/seo/*`, `app/sitemap.js`, `app/robots.js` modified. |
| Don't touch routing | No new dynamic segments, no middleware changes. |
| Don't touch middleware | Confirmed via diff. |
| Don't touch RFQ | Only one analytics event constant added (additive). No RFQ code path touched. |
| Don't touch product canonical URLs | `apexProductUrl` / `buildProductSeoUrl` untouched. |
| Don't touch backend APIs | Zero backend file modified. |
| Don't break desktop | Verified pixel-by-pixel via desktop screenshots: `1830px → 1870px` (within rendering variance). |

## 6. Files changed

```
Edited:
  frontend/app/(shopsite)/shops/[slug]/page.js
  frontend/app/(shopsite)/shops/[slug]/san-pham/page.js
  frontend/app/(shopsite)/shops/[slug]/gioi-thieu/page.js
  frontend/components/shopsite/ShopHeader.jsx
  frontend/components/shopsite/ShopTabs.jsx
  frontend/components/shopsite/ShopProductCard.jsx
  frontend/components/shopsite/ShopFilters.jsx
  frontend/components/shopsite/ShopSidebar.jsx
  frontend/components/shopsite/ShopContactCard.jsx       (rewritten)
  frontend/components/shopsite/ShopFloatingMobileCTA.jsx
  frontend/lib/shopsite/shopsiteAnalytics.js             (+1 event const)

New:
  frontend/components/shopsite/ShopMobileCategories.jsx
  frontend/components/shopsite/ShopMobileFilters.jsx
  frontend/components/shopsite/ShopIntroClamp.jsx

Audit + screenshots:
  audit/storefront-mobile-compression.md
  audit/screenshots/storefront-mobile-compression/
    before/{iphone,android,desktop}-{home,san-pham,gioi-thieu,lien-he}.png
    after/{iphone,android,desktop}-{home,san-pham,gioi-thieu,lien-he}.png
```

## 7. Rollback

* Revert this commit. The split-out new components (`ShopMobileCategories`,
  `ShopMobileFilters`, `ShopIntroClamp`) are pure additions; existing
  components are visibility-toggled rather than removed, so a revert
  goes back to the previous mobile layout without orphaned state.
