# Seller Operational Speed UX

Additive operational-speed pass on the seller mobile UI. Reduces the
interaction cost of the seller's daily ops without changing existing
business logic, schema, or middleware.

**Scope guardrails (followed):** no schema changes, no breaking API
changes, no middleware/auth changes, no existing route changes. All
new behaviour is layered on top of existing endpoints. Desktop is
visually stable across every surface in this pass — every new
treatment is mobile-gated (Tailwind `lg:*` or `@media (max-width:
1023.98px)`).

---

## 1. Backend (additive only)

### `PATCH /products/:id/stock`

`backend/routes/product.routes.js`,
`backend/controllers/product.controller.js`

Lightweight stock-only update endpoint. Needed because the legacy
`PUT /products/:id` requires `partNumber` + `partName` and aggressively
rewrites the car-application mapping — both of which are unsafe for
an inline "tap-stock-to-edit" action on a mobile product card.

```
PATCH /products/:id/stock
  body: { stock: <number> }
  →     { success: true, stock: <integer> }
```

- `requireAuth` + `requireShop` middleware (route layer).
- `WHERE id = ? AND shopId = ?` so a seller cannot touch another
  shop's row even if they spoof an id.
- Best-effort downstream invalidation (typesense + list view sync)
  matching the full update path. Errors are logged and swallowed —
  the seller's UX is never blocked on cache invalidation.

### `/shop/metrics/overview` "Today" payload

`backend/services/shopMetrics.service.js`

Existing response keeps its `cards` and `eventCountsLast30d` shape.
A new sibling `cardsToday` field is added, populated by three new
parallel sub-queries (`countRfqReceivedToday`,
`countOutOfStockProducts`, `countShopEventsToday`):

```json
{
  "cards": { /* existing 30d cards */ },
  "cardsToday": {
    "rfqReceivedToday": <int>,
    "ctaClicksToday": <int>,
    "storefrontViewsToday": <int>,
    "outOfStockCount": <int>
  },
  "eventCountsToday": { /* full per-event breakdown */ }
}
```

Legacy clients ignore the new keys; the new ShopMetricsOverview
reads them to render the "Hôm nay" pill row. Anchored on
`CURDATE()` so the row resets at server-time midnight rather than
sliding over a trailing 24h window.

---

## 2. Frontend

### Toast system (`SellerToaster`)

`frontend/components/ui/SellerToaster.jsx`,
`frontend/app/globals.css` (`.seller-toaster*`),
`frontend/app/layout.js`

Tiny dependency-free toast surface mounted at the root layout.
Singleton store with three helpers:

```js
sellerToast.success("Đã cập nhật tồn kho");
sellerToast.error("Mất mạng. Thử lại sau.");
sellerToast.info("Đã sao chép liên kết");
```

- Slide-up animation, 2.4 s default TTL.
- Anchored above the seller mobile bottom nav (mobile) / bottom-right
  corner (desktop) so it never obscures the bottom chrome.
- Replaces all `alert()` calls in the product create / edit flow and
  the mobile product card. Inline error banners (e.g. the wizard's
  step-error banner) still render for screen-reader continuity.

### Draft autosave (`useProductDraftAutosave`)

`frontend/hooks/useProductDraftAutosave.js`

- Snapshots the full form state to `localStorage` under a stable
  key (`otofine.draft.new` for create, `otofine.draft.<id>` for
  edits).
- Writes are debounced 700 ms so rapid typing doesn't hammer storage.
- On mount, exposes any pre-existing draft via `restored` so the
  caller can offer "Khôi phục bản nháp?".
- `clear()` is invoked after a successful save to wipe the draft.
- `File` objects (new image uploads) are not serialised — everything
  else (fields, car rows, existing images, current wizard step) is
  recovered on next open.

### Mobile wizard for AddProductPopup

`frontend/components/popup/AddProductPopup.jsx`,
`frontend/components/popup/ProductPopup.css`

The popup gains a 5-step wizard *only on mobile*. The popup root
carries `data-step="N"`; a single CSS rule under 1024 px hides any
`[data-wizard-step]` section that doesn't match. Desktop ignores the
attribute and renders the legacy single-page layout.

Steps:

1. **Thông tin** — Mã, Tên, Giá, Tồn, Xuất xứ
2. **Ảnh** — Camera-first picker (📷 Chụp ảnh + 🖼️ Thư viện) +
   existing/new thumbnails
3. **Xe** — Bordered car cards with the secondary 5 selects
   (dong_co / hop_so / so_cau / kieu_dang / cc) collapsible
4. **Thông số** — Kích thước & trọng lượng + Mô tả (Tiêu đề +
   chi tiết)
5. **Xác nhận** — Read-only review summary. Each row is tappable
   and jumps back to the relevant step.

Chrome:

- Sticky progress dot row above the form (horizontally scrolls on
  tiny phones).
- Sticky `WizardDraftIndicator` ("✓ Đã lưu nháp") below the dots
  the first time autosave fires.
- `DraftRestoreBanner` offered on edit-mode mount if a draft was
  previously saved for this product.
- Mobile footer becomes `[‹ Quay lại] [Tiếp tục ›]` on steps 1–4,
  `[‹ Quay lại] [Lưu sản phẩm]` on step 5.
- Per-step validation (`validateStep(s)`) — step 1 requires Mã +
  Tên, step 3 rejects partial car rows and invalid year ranges.
- On error: inline red banner + toast. The wizard stays on the
  failing step.

### Camera-first image upload

`frontend/components/popup/AddProductPopup.jsx` (`ImagePicker`)

The `cameraFirst` prop (mobile only) exposes two large equal-width
buttons in a 2-col grid:

- `📷 Chụp ảnh` → `<input type="file" accept="image/*"
  capture="environment">` — hints to the device to open the rear
  camera directly on iOS Safari / Chrome Android.
- `🖼️ Thư viện` → standard multi-select gallery picker.

Mobile thumbnails enlarged from 78 px → 96 px for easier tap.
Desktop picker (`cameraFirst` not passed) is unchanged.

### Inline stock edit on product cards

`frontend/components/pages/products/ProductMobileCard.jsx`,
`frontend/services/product.api.js` (`updateProductStock`)

- Tapping the stock chip swaps it for a small numeric input. Enter
  / blur commits, Escape cancels.
- Optimistic UI: the local stock state advances immediately, the
  toast confirms success, and on failure we roll back the chip and
  surface the error message.
- The chip carries a pencil glyph (✏️) to telegraph that it's
  editable. While the request is in flight it briefly shows ⏳.
- Backed by `PATCH /products/:id/stock` (above).

### Status pill + quick share

`frontend/components/pages/products/ProductMobileCard.jsx`

- Derived status pill next to price: **Đang bán** when `stock > 0`,
  **Hết hàng** otherwise. (`Tạm ẩn` deferred — needs a `is_active`
  column.)
- New kebab menu actions:
  - 🔢 **Sửa tồn kho** — opens inline edit directly.
  - 🔗 **Sao chép liên kết** — copies the storefront product
    canonical URL (via `buildProductSeoUrl`) to the clipboard with
    a graceful `document.execCommand` fallback for old browsers.

### "Hôm nay" operational row in `ShopMetricsOverview`

`frontend/components/pages/shop-settings/ShopMetricsOverview.jsx`,
`frontend/app/globals.css` (`.seller-today-row`)

Compact pill row above the existing 30-day overview:

| Pill        | Source                                   |
|-------------|------------------------------------------|
| 📨 RFQ mới  | `cardsToday.rfqReceivedToday`            |
| 📞 Lượt CTA | `cardsToday.ctaClicksToday`              |
| 👀 Lượt xem | `cardsToday.storefrontViewsToday`        |
| ⚠️ Hết hàng | `cardsToday.outOfStockCount` (amber tone)|

Mobile: horizontal scroll-snap row of compact pills (no second
4-card grid). Desktop: same pills, no scroll, inline.

### Mobile product list skeleton

`frontend/components/pages/products/ProductList.jsx`

Replaces the "Đang tải…" text on mobile with 4 card-shaped
skeletons (image thumbnail, two text rows, two stock chips). No
layout shift on first paint because the skeleton matches the real
card geometry.

---

## 3. Files touched

**Backend (additive only):**
- `backend/controllers/product.controller.js` — `updateProductStock` controller.
- `backend/routes/product.routes.js` — `PATCH /:id/stock` route.
- `backend/services/shopMetrics.service.js` — three new helpers +
  `cardsToday` in the response.

**Frontend (new):**
- `frontend/components/ui/SellerToaster.jsx`
- `frontend/hooks/useProductDraftAutosave.js`

**Frontend (modified):**
- `frontend/app/layout.js` — mounts `SellerToaster` at the root.
- `frontend/app/globals.css` — toaster, today-row, and wizard CSS.
- `frontend/components/popup/AddProductPopup.jsx` — wizard, autosave,
  camera picker, toast-driven submit.
- `frontend/components/popup/ProductPopup.css` — wizard chrome
  (progress dots, draft indicator, restore banner, step error,
  review summary) gated to the mobile media query.
- `frontend/components/pages/products/ProductMobileCard.jsx` —
  inline stock edit, status pill, quick share.
- `frontend/components/pages/products/ProductList.jsx` — mobile
  loading skeleton.
- `frontend/components/pages/shop-settings/ShopMetricsOverview.jsx`
  — `TodayPill` row.
- `frontend/services/product.api.js` — `updateProductStock`.

---

## 4. Verification

Backend smoke (curl):

```
GET  /api/shop/metrics/overview        → cards + cardsToday payload
PATCH /api/products/0/stock            → 400 "Invalid product id"
PATCH /api/products/2913/stock {stock:7} → {success:true, stock:7}
PATCH /api/products/2913/stock {stock:1} → {success:true, stock:1}
```

Build:

```
npm run build → ✓ Compiled successfully
```

Routes smoke (post-pm2 restart):

```
GET /shop/settings → 200
GET /shop/products → 200
```

Playwright screenshots in `audit/screenshots/seller-ops/`:

| Surface                                | iPhone | Android | Desktop |
|----------------------------------------|:------:|:-------:|:-------:|
| `/shop/settings` (Today row)           | ✓      | ✓       | ✓       |
| `/shop/products` skeleton + loaded     | ✓      | ✓       | ✓       |
| Inline stock edit (active)             | ✓      | ✓       | n/a     |
| Quick actions menu (Sao chép, Sửa tồn) | ✓      | ✓       | n/a     |
| Wizard step 1 (Thông tin) + autosave   | ✓      | ✓       | n/a     |
| Wizard step 2 (Ảnh, camera picker)     | ✓      | ✓       | n/a     |
| Wizard step 3 (Xe) + collapsible       | ✓      | ✓       | n/a     |
| Wizard step 4 (Thông số + Mô tả)       | ✓      | ✓       | n/a     |
| Wizard step 5 (Xác nhận review)        | ✓      | ✓       | n/a     |
| Step error toast + banner              | ✓      | ✓       | n/a     |
| Desktop popup regression               | n/a    | n/a     | ✓       |

Desktop popup is pixel-equivalent to the v2 layout — the wizard,
progress, draft indicator, review section, and mobile save bar all
collapse to `display: none` above 1024 px.

---

## 5. Deferred (intentionally out of scope)

- **Image reorder / mark primary image** — needs a `display_order`
  or `is_primary` column on `product_images`. Skipped for this
  schema-additive-only pass.
- **`Tạm ẩn` (visibility) status** — needs `is_active` column on
  `products`. The status pill currently only surfaces the derived
  `Hết hàng` state.
- **Virtualization of the product list** — the existing 20/50/100
  page-size is comfortable; deferred until product counts and
  device profiling justify it.
