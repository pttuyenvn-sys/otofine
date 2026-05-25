# Seller ↔ Storefront connectivity + desktop seller IA + visual map UX

Phase goal: connect the public storefront with the seller workspace so
shop owners can flip between the two without losing context, unify the
seller-center navigation across desktop/tablet/mobile, and replace the
placeholder map block on the storefront with a real Google Maps visual
that communicates "địa chỉ thật / cửa hàng thật".

This pass is purely additive UX. No new backend endpoints, no database
changes, no auth changes, no impact on storefront SEO/canonical or RFQ
matching.

---

## 1. Storefront → Seller entry (`StorefrontSellerShortcut`)

New component: `frontend/components/shopsite/StorefrontSellerShortcut.jsx`

- Renders a compact floating **"Quản lý shop"** chip in the bottom-right
  corner of the storefront.
- The chip is **only** visible when:
  1. A valid seller JWT exists in `localStorage`
  2. `role === "shop"`
  3. `decoded.shopId` matches the storefront's `shop.id`
- For unauthenticated visitors and for sellers viewing someone else's
  storefront, the component renders `null` — no seller chrome leaks to
  customers.
- Opens a 5-item dropdown that mirrors the unified seller IA:
  - 🏪 Shop → `/shop/settings`
  - 📦 Sản phẩm → `/shop/products`
  - 💬 Khách hàng → `/rfq/shop/inbox`
  - 📊 Hiệu quả → `/shop/insights`
  - 👤 Tài khoản → `/shop/account`
  - "Mở Seller Center" primary CTA → `/shop/settings`

### Security note

The ownership check is **client-side only**. This is intentional:

- The chip only links into the seller workspace; the workspace itself
  is protected by `ShopGuard` + `requireAuth` middleware, so even if a
  bad actor spoofs `shopId` in localStorage, the backend rejects the
  forged token immediately.
- Keeping the check client-side means SSR/SEO stays identical for all
  visitors — there's no per-request auth branching that could leak
  into the cached HTML or break the SEO canonical contract.

Mount point: `frontend/app/(shopsite)/shops/[slug]/layout.js`, passing
`shop.id` (already in the public DTO).

CSS lives in `globals.css` under `.storefront-seller-shortcut*`.

---

## 2. Desktop seller IA unification (`Sidebar.jsx`)

Rewrote `frontend/components/Sidebar.jsx` so the desktop sidebar mirrors
the mobile bottom nav 1:1, plus a 5th destination for "Hiệu quả".

Nav items (icons, labels, route ownership):

| Icon | Label       | Route                  |
| ---- | ----------- | ---------------------- |
| 🏪    | Shop        | `/shop/settings`       |
| 📦    | Sản phẩm    | `/shop/products`       |
| 💬    | Khách hàng  | `/rfq/shop/inbox`      |
| 📊    | Hiệu quả    | `/shop/insights` (new) |
| 👤    | Tài khoản   | `/shop/account`        |

Active-state matching is prefix-based and unified with the mobile nav
(`match` array per item). Each link gets a fixed-width icon column for
visual alignment.

### Footer — "Xem storefront" quick switch

The sidebar grows a footer block with an "Xem storefront" external link
that opens the seller's own public storefront in a new tab. The
storefront URL is resolved via the existing `/shop/public-page` API
through a new shared hook:

- `frontend/hooks/useSellerStorefrontUrl.js` — calls `getMyPublicPage`
  once per session, caches the result in `sessionStorage` keyed on the
  JWT fingerprint, and revalidates in the background. Used by:
  - `Sidebar.jsx` (footer link)
  - `ShopAccount.jsx` (mobile row)
  - `ShopInsights.jsx` (quick-action tile)

If the storefront is still in draft mode (`publicStatus !== "public"`),
the sidebar appends a subtle "Storefront đang ở chế độ nháp" hint so
the seller knows the link opens an internal preview.

### CSS polish

`globals.css` now ships a `sidebar-link*` block with:

- Tighter group spacing (gap 4px vs the old 6px)
- Stronger active state: emerald tint + inset accent rule
- Optional group separator (`.sidebar-nav-group + .sidebar-nav-group`)
- Trailing badge slot (`.sidebar-link-badge` for unread inbox count)

Mobile breakpoint behaviour is **unchanged** — the sidebar is still
hidden under 900px via the existing `@media (max-width: 900px)` rule.

---

## 3. Desktop seller information architecture polish

- Sidebar feels like a workspace, not an admin dashboard: rounded link
  pills, soft active highlight, consistent icons + label widths.
- The "OF" brand badge keeps its mobile-friendly variant; only the
  subtitle copy was extracted into `.sidebar-brand-sub` for consistent
  typography.
- The "Mở storefront" footer link doubles as an at-a-glance signal of
  the seller's own subdomain.

No other seller pages were touched in this phase — the IA refresh is
contained to the sidebar + the new `/shop/insights` route.

---

## 4. Storefront ↔ Seller quick switching

| Surface                  | Switch direction | Implementation                                              |
| ------------------------ | ---------------- | ----------------------------------------------------------- |
| Storefront → Seller      | Floating chip    | `StorefrontSellerShortcut` (owner-only)                     |
| Seller sidebar           | Seller → Storefront | "Xem storefront" footer link (external)                     |
| `/shop/settings` header  | Seller → Storefront | Desktop "Xem storefront" green pill in page header          |
| `/shop/insights` actions | Seller → Storefront | "Xem storefront" tile in "Hành động nhanh"                  |
| `/shop/account` row      | Seller → Storefront | "Xem storefront" row (mobile parity for the 5th IA dest)    |

All switch links open in a new tab (`target="_blank" rel="noopener"`)
so the seller never loses their workspace state — important during
storefront testing / SEO tuning / mobile verification.

---

## 5. Google Map visual block (`ShopContactCard.jsx`)

Replaced the SVG-grid placeholder under the contact card with a
production-quality map preview.

### Component

`MapVisualBlock` (new sub-component inside `ShopContactCard.jsx`).

### Behavior

- Renders a **real Google Maps embed iframe** keyed off `lat,lng` when
  available, falling back to `address || "<name>, <province>"`.
- The iframe is **lazy-mounted** via `IntersectionObserver` with a
  `200px` rootMargin so a collapsed mobile card never fetches the
  embed until the user expands the card and scrolls toward it.
- A subtle decorative SVG-grid background covers the aspect-reserved
  slot before the iframe hydrates so there's no blank flash.
- Top-left **marker pin badge** with the business name (truncates at
  ~180px) communicates "real physical location" instantly.
- Bottom-center **"Mở Google Maps"** floating CTA opens
  `https://www.google.com/maps?q=<query>` in a new tab. Uses
  `pointer-events: none` on the overlay wrapper and `pointer-events:
  auto` on the link so the iframe still scrolls/zooms normally.
- Footer strip below the map echoes `address · province` (district /
  city) to reinforce "địa chỉ thật / hoạt động thật".

### Data contract

`toContactShape()` in `app/(shopsite)/shops/[slug]/page.js` and
`/gioi-thieu/page.js` now forwards `name`, `province`, `lat`, `lng`,
and `mapEmbedUrl` — all of which the public DTO already exposed. No
backend change needed.

### Performance

- Lazy iframe (only mounts after the block enters viewport)
- `loading="lazy"` + `referrerPolicy="no-referrer-when-downgrade"`
- Aspect-ratio reservation prevents CLS
- No external JS, no API key required (uses `maps?q=` embed)

---

## 6. Mobile bottom nav

`SellerMobileBottomNav.jsx` keeps its 4-tab layout (UX-optimal for one-
handed phone use) and now also activates on `/shop/insights` so the bar
stays visible across the 5th destination. The "Hiệu quả" tab is
reachable from the mobile account hub.

---

## 7. Files changed

### New

- `frontend/components/shopsite/StorefrontSellerShortcut.jsx`
- `frontend/components/pages/ShopInsights.jsx`
- `frontend/app/shop/insights/page.js`
- `frontend/hooks/useSellerStorefrontUrl.js`

### Modified

- `frontend/app/(shopsite)/shops/[slug]/layout.js` — mount shortcut
- `frontend/app/(shopsite)/shops/[slug]/page.js` — forward map fields
- `frontend/app/(shopsite)/shops/[slug]/gioi-thieu/page.js` — forward map fields
- `frontend/components/shopsite/ShopContactCard.jsx` — `MapVisualBlock`
- `frontend/components/Sidebar.jsx` — unified IA + footer
- `frontend/components/SellerMobileBottomNav.jsx` — show on `/shop/insights`
- `frontend/components/pages/ShopAccount.jsx` — Hiệu quả + Xem storefront rows
- `frontend/components/pages/ShopSettings.jsx` — header Xem storefront button
- `frontend/app/globals.css` — chip / dropdown / sidebar / footer styles

### Backend / API

- Zero changes. The storefront DTO already includes `id`, `lat`,
  `lng`, `province`; the seller `/shop/public-page` endpoint already
  returns `preview.subdomain`. JWT already carries `shopId`.

---

## 8. DO NOT TOUCH compliance

| Concern                | Status                                                                |
| ---------------------- | --------------------------------------------------------------------- |
| Storefront SEO         | Unchanged — chip mounts only client-side, never enters SSR output     |
| Wildcard routing       | Unchanged                                                             |
| Canonical product URLs | Unchanged                                                             |
| RFQ matching           | Unchanged — only a new link target                                    |
| Upload pipeline        | Unchanged                                                             |
| Backend contracts      | No new endpoints, no DTO shape changes                                |
| Auth logic             | Unchanged — client-side decode only                                   |
| Typesense              | Untouched                                                             |
| Business logic         | Untouched — pure UX additions                                         |

---

## 9. Verification

Build: `npm run build` → clean.

Smoke tests:

- `GET /shop/insights` → 200, served as `text/html`
- `GET /shops/<slug>` → 200, storefront DTO unchanged

Screenshots (`audit/screenshots/seller-storefront/`):

### Positive cases (owner-authed)

- `desktop-storefront-home.png` — chip visible bottom-right
- `desktop-storefront-chip-open.png` — dropdown menu with 5 IA items + "Mở Seller Center" CTA
- `desktop-storefront-contact-map.png` — new Google Maps block on `/gioi-thieu`
- `desktop-seller-insights.png` — sidebar IA + Hiệu quả page
- `desktop-seller-products.png` — sidebar IA active state
- `desktop-seller-account.png` — account hub
- `iphone-storefront-home.png` — owner chip stacks above floating CTAs
- `iphone-storefront-chip-open.png` — mobile dropdown
- `iphone-storefront-contact-map.png` — Google Maps embed inside mobile contact card
- `iphone-seller-account.png` — mobile bottom nav parity
- `android-storefront-chip-open.png` — dropdown layout on Pixel 8 viewport

### Negative cases (ownership gate)

- `desktop-storefront-anon-no-chip.png` — anonymous visitor → no chip
- `desktop-storefront-other-owner-no-chip.png` — seller with a different `shopId` → no chip

Commit: `feat(seller-storefront): connect storefront and seller workspace UX`.
