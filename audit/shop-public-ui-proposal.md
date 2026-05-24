# Shop Public Pages — UI / UX Proposal

**Companion to:** `shop-public-pages-overview.md`
**Status:** Proposal — no component code yet.
**Scope:** Visual + interaction design for `(shopsite)` route group
only. The seller center (`app/shop/**`) and apex marketing pages
stay untouched.

---

## 1. Design principles

1. **Family resemblance, not duplication.** Use the same color palette,
   button radius, font (Inter), spacing scale, and form controls as
   the existing apex Otofine site. A visitor jumping from
   `otofine.com` to `cuahangoto355.otofine.com` should feel "still on
   Otofine" without seeing the apex shell (no Sidebar/Topbar from
   `AppShell.jsx`).
2. **Mobile first.** Every component degrades to a 360 px viewport
   first. Cover image, header, tabs, and product grid are all
   single-column on mobile and progressively reveal multi-column at
   `sm`, `md`, `lg` breakpoints.
3. **No client-side framework bloat.** Reuse Tailwind utility classes
   exclusively; no Material-UI, shadcn, or component-library install.
   The only new files are pure JSX components under
   `frontend/components/shopsite/`.
4. **Layout is owned by `(shopsite)/layout.js`.** Page-level routes
   only export `<main>` content; the cover/avatar/tab chrome and
   footer are layout-owned so navigating between tabs never re-mounts
   the header (smooth tab switch).
5. **Server components by default.** Tabs, cover, avatar, "featured
   products" panel, and `/lien-he` are pure server components that
   read tenant context from `next/headers`. Only the sticky-header
   scroll listener and the search/filter widget are client islands.

---

## 2. Information architecture

```
(shopsite) layout
├── <ShopCover>                       ← server, props from tenant
│     cover image (16:5 ratio mobile, 16:4 desktop)
├── <ShopHeaderBar>                   ← server; sticky variant is client
│     avatar  +  shop name  +  short bio  +  contact CTA
├── <ShopTabs>                        ← server; sets active state from pathname
│     Trang chủ · Giới thiệu · Sản phẩm · Liên hệ
├── <main>                            ← per-page content
└── <ShopFooter>                      ← server; minimal © + apex link
```

The whole shell renders inside `AuthCard`-style max-width container at
`max-w-screen-xl` (1280 px) with `mx-auto px-4 lg:px-6`. The cover
image extends edge-to-edge (`-mx-4 lg:-mx-6 sm:rounded-b-3xl`).

---

## 3. Component proposal

All paths are proposed; nothing exists yet under `components/shopsite/`.

### 3.1 `<ShopCover>` (server component)

- Props: `coverUrl`, `name`, `provinceLabel`, `verifiedBadge`.
- Default cover (when shop hasn't uploaded one): subtle Otofine
  gradient + watermark — NO stock photos, NO emoji.
- Aspect ratio: `aspect-[16/6]` on mobile, `aspect-[16/4.5]` on
  `lg` and up. **Lower than Facebook's cover** per the requirement.
- Uses `next/image` with `fill` and `priority` (LCP candidate).
  `R2_PUBLIC_URL = https://img.otofine.com` is already in
  `next.config.mjs#remotePatterns`, no config change needed.
- The cover overlays a 40% black bottom gradient so the header bar
  beneath it stays legible regardless of image color.

### 3.2 `<ShopHeaderBar>` (server with client sticky wrapper)

```
[avatar 80px]  [shop name large]                       [Chat Zalo ▸]
               [short bio · max 160 chars one-line truncated]
               [📍 Hà Nội  ·  ⌚ 8:00–18:00  ·  🔥 1,243 sản phẩm]
```

Variants:

| Trigger                          | Variant       | Notes                                                    |
| -------------------------------- | ------------- | -------------------------------------------------------- |
| Page top                         | Hero, 140 px  | Avatar 80 px, name `text-2xl`, bio visible               |
| Scrolled > 200 px                | Sticky, 56 px | Avatar 32 px inline with name, bio hidden, CTA persists  |

The sticky variant is a thin client wrapper using
`useEffect(window.scroll, 100ms throttle)` → `data-sticky="true"`
attribute → Tailwind class swap. No JS state libraries. No layout
shift (sticky element is `position: sticky; top: 0` with the same
slot in the DOM).

### 3.3 `<ShopTabs>` (server)

```
─────────────────────────────────────────────────────────────
 Trang chủ   Giới thiệu   Sản phẩm   Liên hệ
─────────────────────────────────────────────────────────────
```

- Renders four `<Link>` items.
- Active state determined by `pathname` from `next/headers` (server
  components can read it in Next 15 via `headers()` only — actually
  we'll use a tiny client wrapper that reads `usePathname()` so the
  underline animates without a full re-render).
- Underline is a single `<span>` with `transition-transform` driven
  by the active index — pure CSS, no JS animation library.
- Tab order is **fixed**: Trang chủ → Giới thiệu → Sản phẩm → Liên hệ.

### 3.4 Per-page content

#### 3.4.1 `/` (Trang chủ)

Server component. Layout:

```
┌────────────────────────────────────────────────────────────┐
│  <ShopIntroCard>                                           │
│    "Vài dòng giới thiệu ngắn từ shop"                      │
│    [Đọc thêm về shop ▸]                                    │
├────────────────────────────────────────────────────────────┤
│  <ShopStatsRow>                                            │
│    🔥 1,243 sản phẩm   ⭐ 5 năm bán hàng   📦 Giao 24h   │
├────────────────────────────────────────────────────────────┤
│  <ShopFeaturedProducts heading="Sản phẩm nổi bật">        │
│    4–8 cards (server-fetched from /api/public/shops/:slug/feature)
├────────────────────────────────────────────────────────────┤
│  <ShopRecentProducts heading="Mới đăng">                  │
│    8 cards (server-fetched, sort=newest, limit=8)         │
├────────────────────────────────────────────────────────────┤
│  <ShopQuickContact>                                        │
│    Big phone, Zalo, Facebook buttons — DUP of /lien-he    │
└────────────────────────────────────────────────────────────┘
```

#### 3.4.2 `/gioi-thieu`

Server component that renders `intro_html` (rich text from
ShopSettings's existing Quill editor; same field as `descriptionHtml`
today + a new optional `intro_html` column described in
`shop-public-db-impact.md`).

```
┌────────────────────────────────────────────────────────────┐
│  <ShopIntroArticle>                                        │
│    {dangerouslySetInnerHTML: sanitized}                    │
├────────────────────────────────────────────────────────────┤
│  <ShopMeta>                                                │
│    Ngày tham gia · Tỉnh/thành · Tổng sản phẩm             │
└────────────────────────────────────────────────────────────┘
```

HTML sanitization is required (we already render seller HTML on the
product detail page; we'll lift the same `sanitize-html` config that
`controllers/seoComposer.js` or the product detail uses — exact reuse
plan in `shop-public-pages-overview.md §2.4`).

#### 3.4.3 `/san-pham`

This is the workhorse page. Layout for **desktop**:

```
┌──────────────┬─────────────────────────────────────────────┐
│  <Filters>   │  <ProductGrid>                              │
│              │  [card] [card] [card] [card]                │
│  Hãng xe ▾  │  [card] [card] [card] [card]                │
│  Dòng xe ▾  │  ...                                        │
│  Năm SX ▾   │                                             │
│  Tìm kiếm   │  [load more ▸]                              │
│              │                                             │
│  [Xoá lọc]   │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

**Mobile**: filters collapse into a single sticky bottom-sheet button
"Bộ lọc (3)" that opens a full-height drawer. Search bar sits above
the grid as a single-row input.

Grid spec (Shopee-style portrait cards):

- Mobile: 2 columns
- `sm` (≥ 640 px): 3 columns
- `md` (≥ 768 px): 4 columns
- `lg` (≥ 1024 px): 4 columns (intentional — keep cards readable)
- `xl` (≥ 1280 px): 5 columns

Card layout (vertical, ~280 px tall on mobile):

```
┌─────────────┐
│             │  ← square image, 1:1, next/image, q=75
│   IMAGE     │
│             │
├─────────────┤
│ Tên SP      │  ← 2 lines clamp, font-medium, text-sm
│ (clamp 2)   │
│             │
│ 1.200.000đ  │  ← red, font-bold
│ Hãng xe     │  ← gray-500, text-xs
│ Loại hàng   │  ← gray-500, text-xs
└─────────────┘
```

The card is a `<Link>` to `https://otofine.com/product/<id>` —
**absolute apex URL, not relative**. This guarantees the user lands
on the canonical product page on the apex hostname (one canonical per
product across the entire system).

Infinite scroll vs paginated:

| Option         | Pro                                      | Con                                  |
| -------------- | ---------------------------------------- | ------------------------------------ |
| Infinite       | Mobile-friendly, modern                  | Bad for SEO crawlers (pagination URL is the path of discovery), back-button position lost |
| Pagination     | Good for SEO and predictable URL state   | Less smooth                          |

**Recommendation:** Server-rendered first page (page 1) + client
"Xem thêm" button that loads page 2..N. URL stays `/san-pham?page=N`
so back-button works. This is the same pattern that
`Home.jsx`'s inline grid uses today.

#### 3.4.4 `/lien-he`

Pure static server component:

```
┌──────────────────────────────────────────────────────────┐
│  <ContactCard>                                           │
│    📞 0912 345 678        (tel:)                         │
│    💬 Zalo: 0912 345 678  (zalo deep-link)               │
│    👍 Facebook            (https://fb.com/<page>)        │
│    📧 contact@shop.vn     (mailto:)                      │
│    📍 355 Trần Khát Chân, Hà Nội                         │
│    ⏰ Thứ 2 – CN: 8:00 – 18:00                           │
├──────────────────────────────────────────────────────────┤
│  <GoogleMapEmbed>                                        │
│    iframe lazy-loaded; src built from lat/lng or address │
└──────────────────────────────────────────────────────────┘
```

Map embed uses Google's `maps/embed/v1/place` endpoint with a free
public API key set in env (`NEXT_PUBLIC_GMAPS_EMBED_KEY`). If env is
missing, we fall back to a static
`https://www.google.com/maps?q=<urlencoded address>` link card with no
iframe.

---

## 4. Visual tokens

We propose **no new design tokens**; reuse what the apex marketplace
already uses:

| Token            | Tailwind class / value             |
| ---------------- | ---------------------------------- |
| Primary blue     | `bg-blue-600 hover:bg-blue-700`    |
| Body text        | `text-gray-800`                    |
| Muted text       | `text-gray-500`                    |
| Card radius      | `rounded-2xl`                      |
| Button radius    | `rounded-xl`                       |
| Surface          | `bg-white border border-gray-200`  |
| Cover overlay    | `bg-gradient-to-t from-black/40 via-transparent to-transparent` |
| Sticky shadow    | `shadow-sm`                        |
| Tab underline    | `bg-blue-600 h-0.5`                |

Font: Inter (already in `app/layout.js` root). Numeric prices use
`font-variant-numeric: tabular-nums` for alignment in the product
grid.

---

## 5. Sticky-header interaction spec

- Sticky activates at `scrollY > 200`.
- Throttle: requestAnimationFrame.
- Hides bio + stats row, keeps avatar + name + contact CTA.
- Tabs collapse to a horizontally scrollable strip (mobile keeps the
  same strip in non-sticky mode too).
- No CSS `position: fixed` — uses `position: sticky` so layout
  height stays predictable (no scroll-jump).
- Reduced-motion users see the layout swap without the
  `transition-all` blur; honor
  `@media (prefers-reduced-motion: reduce)`.

---

## 6. Reused vs. new components

| Component                          | Source                                | Status   |
| ---------------------------------- | ------------------------------------- | -------- |
| `VehicleSelector`                  | `components/vehicle/VehicleSelector.jsx` | **Reuse** for `/san-pham` filters (already exists, used in `/rfq/new`) |
| `useVehicleSelector` hook          | `hooks/useVehicleSelector.js`         | Reuse    |
| `vehicleFilterApi`                 | `lib/vehicle/vehicleFilterApi.js`     | Reuse — backend already serves `/api/filter/{brands,models,years}` and they don't need shop scoping for the dropdown options (they always reflect the global car_models table) |
| Product card markup                | `components/seo/SeoListingContent.jsx` (currently unused) OR `components/home/*` product card | **Lift** to `components/shopsite/ShopProductCard.jsx`; do NOT modify the original |
| Image helpers                      | `lib/imageUrl*` (none today — 4 duplicated normalizers exist) | **New helper** `components/shopsite/imageUrl.js` — single source of truth for this route group, NOT a global refactor |
| Sanitizer                          | Existing pattern in `controllers/seoComposer.js` | Lift to a small new util `components/shopsite/sanitizeHtml.js` |
| Sticky header observer             | None                                  | New small client hook `useStickyOnScroll.js` (≤ 30 LOC) |
| Map embed                          | None                                  | New `<GoogleMapEmbed>` component |

Crucially: **`Home.jsx`, `AppShell.jsx`, `ShopSettings.jsx`,
`ShopProducts.jsx`, and the apex `[slug]` rendering chain are
read-only for this work package.**

---

## 7. Accessibility

- Tabs: `role="tablist"`, each link is a `role="tab"` with
  `aria-current="page"` when active.
- Cover image: empty `alt=""` (decorative) when no custom cover, or
  `alt="Ảnh bìa <Shop name>"` otherwise.
- Avatar: `alt="Logo <Shop name>"`.
- Sticky header: announced once via `aria-live="polite"` only on
  initial sticky transition (skip if `prefers-reduced-motion`).
- Color contrast: white text over the gradient overlay is checked
  against WCAG AA at the worst case (light cover image — ratio
  ≥ 4.5:1). If the actual cover is very light we tint the gradient
  darker (`from-black/60`).
- Map embed has `title="Bản đồ vị trí <Shop name>"`.
- All interactive elements have a visible focus ring (Tailwind
  `focus:ring-2 focus:ring-blue-500`).

---

## 8. Performance budget

| Target                          | Budget                          |
| ------------------------------- | ------------------------------- |
| LCP on `/` (4G, Moto G4)        | ≤ 2.5 s                         |
| CLS                             | ≤ 0.05 (cover image with `aspect-[]` placeholder, no font swap shift) |
| First-page JS                   | ≤ 100 kB gzipped above the apex baseline (`102 kB` from the latest build) |
| `/san-pham` first page render   | ≤ 16 products, server-rendered, no client fetch |
| Server response (cached)        | ≤ 200 ms TTFB (Redis hit)       |

We will measure with Lighthouse + WebPageTest on the demo shop in
Phase 1 and gate Phase 2 on green numbers.

---

## 9. Out of scope for this UI proposal

- **Search beyond the shop's own catalogue.** No global search on shop
  subdomains.
- **Cart / checkout / online order.** Otofine is RFQ-only; the shop
  page never has a cart.
- **Comments / reviews / ratings.** Not in MVP. A reviews block CAN
  be added in Phase 3 but it would need a new table and moderation;
  out of this proposal.
- **Per-shop theming (custom colors, custom fonts).** Hard-locked to
  the Otofine palette for visual consistency. Phase 3 may allow
  cover image and short bio customization but never brand color
  override.
- **A separate sidebar/topbar for the shop site.** The chrome is the
  cover + tabs only; the apex `AppShell` is explicitly NOT rendered
  on shop hosts.
