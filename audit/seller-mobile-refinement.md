# Seller-Center Mobile UX Refinement (v2)

Second pass on the seller mobile UX, focusing on items that were
still desktop-shaped on real phones after the v1 rollout:

1. The topbar wrapped to 3+ lines on iPhone-class viewports.
2. The sticky save bar in `/shop/settings` floated mid-form during
   scroll and overlapped section headings.
3. Mobile padding was still desktop-leaning.
4. The product create / edit popup was a desktop 2-column layout
   crammed into a phone, with image upload squeezed into a narrow
   side panel and 9 vehicle selects forced onto a single flex row.

**Scope guardrails (followed):** no schema changes, no API/route
changes, no middleware/auth changes, no business-logic mutations.
This is purely responsive layout + presentational chrome. Desktop
renders are visually stable; every action remains reachable.

---

## 1. Compact mobile topbar

`frontend/components/Topbar.jsx`,
`frontend/app/globals.css` (`.seller-topbar*`)

The inline-styled topbar that wrapped to 3+ lines on phones is
replaced with a BEM-style component that uses real CSS classes and
a `@media (max-width: 899.98px)` block to swap shapes:

| Surface              | Desktop (≥ 900px)            | Mobile (< 900px)                       |
|----------------------|------------------------------|----------------------------------------|
| Height               | 64 px                        | 56 px                                  |
| Side padding         | 20 px                        | 12 px                                  |
| Title                | "Otofine Seller Center"      | "Otofine" only                         |
| Back button          | `[Back]` pill                | `←` icon-only chip                     |
| Avatar chip          | avatar + email + role + ▾    | 34 px avatar circle (chip-meta hidden) |
| Dropdown menu        | identical                    | identical                              |

Behaviour preserved:
- Same auth detection (`localStorage.token` + `localStorage.auth`).
- Same `auth-changed` / `storage` event listeners.
- Same dropdown contents (`Shop Settings`, `Products`, `Tin nhắn
  khách hàng`, `Logout` for sellers; admin variants stay).
- Same logout path (`localStorage.clear()` + role-aware redirect).

The `chip-meta` (email + role) remains in the DOM with
`aria-label` on the chip button reading the email, so screen readers
still pick it up on phones — only the visual block is hidden.

## 2. Fix `/shop/settings` save bar

`frontend/components/pages/ShopSettings.jsx`,
`frontend/app/globals.css` (`.shop-settings-save-bar`)

The previous bar used `position: sticky; bottom: 0`. Sticky lets
content scroll under the element, which produced the bug where the
save button overlapped section headers mid-scroll.

The bar now picks its behaviour by viewport:

- **Mobile (< 900 px):** `.shop-settings-save-bar` is
  `position: fixed; bottom: calc(64px + safe-area)` so it sits in a
  fixed slot above the seller mobile bottom nav, with a backdrop
  blur. The Tailwind `lg:*` desktop classes don't apply at this
  breakpoint, so the legacy negative margins / sticky positioning
  are disabled and the bar gets a proper standalone surface.
- **Desktop (≥ lg):** the same `<div>` reactivates its
  `lg:sticky lg:bottom-0` plus the `lg:-mx-6` chrome — visually
  identical to the legacy save bar.

`.main-content` mobile padding-bottom was bumped to
`calc(64px + safe-area + 60px)` so the form always has clearance
for the fixed save bar AND the bottom nav. Pages that don't host a
fixed save bar (`/shop/products`, `/shop/account`, `/rfq/shop/*`)
fall back to the smaller `calc(64px + safe-area + 12px)` reserve via
`.main-content:not(.shop-settings-page)`.

The "Đổi mật khẩu" link and the long status hint are hidden on
mobile — the new Tài khoản tab already exposes the change-password
flow, and the status copy was only useful when the bar had room
for it.

## 3. Reduce mobile side padding

`frontend/app/globals.css`,
`frontend/components/pages/ShopSettings.jsx` (`SectionCard`)

- `.main-content` mobile gutter: 12 → 10 px.
- `SectionCard` mobile padding: `p-3.5` → `p-3` body,
  `px-3 py-2.5` header (was `px-3.5 py-3`).
- `SectionCard` mobile title font: `text-[15px]` → `text-[14px]`
  with `leading-tight`; subtitle `text-[12px]` → `text-[11px]` with
  `leading-snug`. Net: each section header is ~6–8 px shorter on
  mobile.
- Page header: `text-xl` → `text-lg`, `mb-3` → `mb-2`.
- Desktop unchanged: `sm:*` / `lg:*` Tailwind variants restore the
  pre-pass sizes above 640 px.

## 4. Product create / edit mobile rebuild

`frontend/components/popup/AddProductPopup.jsx`,
`frontend/components/popup/ProductPopup.css`

### Layout strategy

The popup overlay (`createPortal` to `document.body`, z-index
`9999999`) is unchanged. Internally the form now switches layout
under 1024 px via CSS:

- **Desktop (≥ lg):** the legacy 2-column grid (`grid-template-
  columns: 4fr 1fr`) is preserved. LeftCol owns the form, RightCol
  hosts the legacy submit button + image picker. CarCard wrappers
  use `display: contents` so the 9 selects + delete button bubble
  up into a single flex row, exactly like the original inline-
  style row.
- **Mobile (< lg):** `.FormGrid` collapses to one column;
  `.RightCol` becomes `display: none`; `.LeftCol` flows naturally.
  An additional `.ProductFormSection--mobileImages` block inside
  `LeftCol` (gated `lg:hidden`) renders the image picker after
  basic info, satisfying the requested mobile action priority.
  A `.MobileSaveBar` (`position: fixed; bottom: 0`, z-index above
  the popup overlay) provides the primary CTA on phones.

### Mobile field order

1. **Thông tin cơ bản** — Mã phụ tùng, Tên phụ tùng (one field per
   row), Giá bán / Tồn kho (2-col), Xuất xứ.
2. **Ảnh sản phẩm** — full-width "+ Thêm ảnh" picker + 78×78 image
   thumbnails wrapping in a horizontal grid. (`lg:hidden`)
3. **Áp dụng cho xe** — bordered "Xe N" cards (see below).
4. **Kích thước & trọng lượng** — Chiều dài/rộng/cao/Trọng lượng
   in a 2×2 grid.
5. **Mô tả** — Tiêu đề (short Quill) + Mô tả chi tiết (full Quill,
   `min-height: 220px` on mobile down from 600 px).

### CarCard mobile reflow

The original popup rendered 9 selects + a delete button on a single
flex row. On phones that produced 70-px-wide selects that were
unusable.

- Each `<CarRow>` becomes a bordered "Xe N" card with a per-row
  delete button in the header.
- Primary 4 selects (Hãng xe / Mẫu xe / Từ năm / Đến năm) sit in
  a `2×2` grid — the only selects most sellers ever touch.
- A `"+ Chi tiết kỹ thuật (động cơ, hộp số, …)"` dashed-border
  toggle reveals the 5 secondary selects (Động cơ / Hộp số / Số
  cầu / Kiểu dáng / CC) in another 2-col grid. Toggle state is
  per-row.
- Desktop layout is unaffected — `display: contents` on the inner
  wrappers means the selects still bubble up to a single flex row.

### Sticky chrome

- Mobile `.PopupHeader` is now `position: sticky; top: -12px` with
  negative margin extensions to the sheet edge, so the title +
  "Đóng" button stay visible while the form scrolls.
- `.AddProductForm` switches to `overflow-y: auto` on mobile (was
  `overflow: hidden`) and adds `-webkit-overflow-scrolling: touch`
  for momentum scroll. Bottom padding reserves room for the fixed
  save bar.
- `.MobileSaveBar` height is ~60 px including safe-area. Full-
  width green CTA ("Thêm sản phẩm" / "Cập nhật sản phẩm") so the
  primary action is always one tap.
- Body scroll lock is now applied while the popup is open (was
  missing — iOS Safari let the underlying page move around).

### Submit lifecycle

- Added `submitting` state — disables both the desktop legacy
  button and the mobile sticky button, swaps copy to "Đang lưu…".
- No payload / API changes — same FormData shape, same `POST
  /products` / `PUT /products/:id`, same `reload-products` event
  on success, same `alert(...)` confirmations.

## 5. Files touched

**Modified (4):**

- `frontend/components/Topbar.jsx` — class-based mobile-aware
  topbar; identical behavior.
- `frontend/app/globals.css` — `.seller-topbar*` styles, mobile
  `.main-content` gutter / bottom reserve, `.shop-settings-save-bar`
  fixed-positioning rule.
- `frontend/components/pages/ShopSettings.jsx` — tighter
  `SectionCard` mobile chrome, save bar JSX wired to the new CSS
  hook.
- `frontend/components/popup/AddProductPopup.jsx` — full mobile
  rebuild (sections, image picker priority, collapsible vehicle
  details, sticky save bar, body scroll lock, submitting state).
- `frontend/components/popup/ProductPopup.css` — rewritten so the
  legacy desktop grid stays intact while mobile gets a single-
  column flow with full-width image picker and bordered car cards.

## 6. Verification

Build:

```
npm run build
✓ Compiled successfully in 25 s
✓ Generating static pages (32/32)
```

Routes smoke (post-pm2 restart):

```
GET /shop/settings → 200
GET /shop/products → 200
```

Screenshots — `audit/screenshots/seller-mobile-v2/`:

| Surface                              | iPhone | Android | Desktop |
|--------------------------------------|:------:|:-------:|:-------:|
| Compact topbar (settings top)        | ✓      | ✓       | ✓       |
| `/shop/settings` full page           | ✓      | ✓       | ✓       |
| `/shop/settings` bottom (save bar)   | ✓      | ✓       | ✓       |
| `/shop/products` top                 | ✓      | ✓       | ✓       |
| Add product popup top                | ✓      | ✓       | ✓       |
| Add product mid-scroll (sticky chrome) | ✓    | ✓       | n/a     |
| Add product details expanded         | ✓      | ✓       | n/a     |
| Edit product popup top               | ✓      | ✓       | n/a     |

Visual diff vs v1:

- iPhone topbar height: 124 px (3-line wrap) → 56 px.
- iPhone save bar: floating mid-form → fixed full-width bar above
  bottom nav.
- iPhone add-product popup: 2-col with squeezed sidebar → single-
  column sheet with image picker first and a sticky CTA.
- Desktop settings / products / popup: pixel-equivalent to the v1
  output (sidebar + main content + legacy grid all preserved).
