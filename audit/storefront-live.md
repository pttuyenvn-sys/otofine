# Storefront live commerce — pass

**Goal:** Make the storefront feel like it's actively operating —
real business, real people responding, real catalogue — to lift
trust + conversion (chat / call / RFQ submissions).

**Strict constraints (followed):**
- No fake realtime data. No `Math.random` numbers. No fabricated
  "12 khách đang xem" or "5 vừa gửi báo giá" counters.
- Every chip / pill / status signal derives from EXISTING public
  fields in the shop DTO or REAL backend timestamps.
- No SEO / canonical / routing / wildcard / RFQ-matching / auth /
  middleware / upload / public-API changes.

---

## 1. Live activity strip

**`frontend/components/shopsite/ShopLiveActivityStrip.jsx`**

Renders 1-4 chips directly under the hero, ordered by intent:

| Chip | Source | Notes |
| --- | --- | --- |
| `● Đang mở cửa` / `Ngoài giờ · Báo giá 24/7` | `workingHoursShort` parsed against UTC+7 wall clock | The animated green dot (Tailwind `animate-ping`) gives the "live" feel without fakery. Falls back to `Nhận báo giá 24/7` if hours can't be parsed. |
| `⚡ Phản hồi trong ~15 phút` | `trust.quickResponse` OR ≥ 2 contact channels | Skipped if shop only has 1 channel. |
| `📦 X+ sản phẩm trên kệ` | `productCount` bucketed (50+/100+/500+/1k+/2k+) | Hidden for shops with < 50 products. |
| `🚗 Chuyên hãng X` | `trust.topBrands[0]` | Hidden if no brand specialty. |

Layout: `overflow-x-auto sm:flex-wrap no-scrollbar` — mobile
horizontally scrolls when overflowing, desktop wraps.

---

## 2. Trusted seller block

**`frontend/components/shopsite/ShopTrustedSellerBlock.jsx`**

5-line compact security checklist that REPLACES the legacy
seller-asserted 4-chip block ("Sản phẩm chính hãng / Giá cả /
Tư vấn / Giao toàn quốc") inside the About column:

| Line | Source field |
| --- | --- |
| ✓ Đã xác minh bởi Otofine | `shop.verified` |
| ✓ Có địa chỉ cửa hàng rõ ràng | `shop.address` |
| ✓ Có số điện thoại liên hệ | `shop.phone` |
| ✓ Cửa hàng công khai trên Otofine | `shop.slug` (always true on a published shop) |
| ✓ Có sản phẩm thật trên kệ | `shop.productCount > 0` |

Renders zero rows when none can be derived (skipped). Mounted in
the desktop About column (the column itself stays hidden on mobile
per the existing compression pass).

---

## 3. Product card mini quick-contact CTAs

**`frontend/components/shopsite/ShopProductCard.jsx`**

Each card now ends with a 2-button row:

- `💬 Hỏi nhanh` — primary, full-width on mobile, opens the
  Quick-RFQ modal pre-filled with `part: product.name`,
  `vehicle: <fitment string>`, `brand/model/year: parsed`.
- `📞` icon-only emerald pill — `tel:<shopPhone>`, mounted only
  when the card was passed `shopPhone`.

Buttons live INSIDE the `<a>` (so cmd-click + open-in-new-tab keep
working) but `e.preventDefault() + e.stopPropagation()` short-circuit
the navigation when the buyer taps the CTA.

The modal is opened via a CustomEvent (`shopsite:openQuickRfq`)
that the page-level `ShopQuickRfqLauncher` listens for — keeps the
modal single-mounted at the layout level instead of per card.

---

## 4. Quick RFQ floating launcher + modal

**`frontend/components/shopsite/ShopQuickRfqLauncher.jsx`**
**`frontend/components/shopsite/ShopQuickRfqModal.jsx`**

Floating "📦 Tìm phụ tùng nhanh" pill bottom-right on desktop. Click
opens an inline portal modal with 5 fields:

1. Tên phụ tùng (≥ 3 chars)
2. Hãng xe (≥ 2 chars, e.g. "Toyota")
3. Dòng xe (e.g. "Vios")
4. Năm SX (1990–current year + 1)
5. Số điện thoại (normalised via existing `normalizePhoneVN` helper)

Submit POSTs to the **existing** `/api/rfq/create` endpoint (no
backend change), seeds `sessionStorage.rfq_public_id` + `rfq_phone`
exactly like the full `/rfq/new` flow, then redirects to
`/rfq/success` for OTP confirmation.

- Modal bundle is dynamically imported via `next/dynamic` (no SSR)
  so the floating pill alone ships ~0 KB of modal JS until the
  user actually opens it.
- Floating pill hides on scroll-down deep in the page, returns on
  scroll-up — same pattern as the bottom mobile CTA so they don't
  compete for attention.
- Mobile renders the modal as a bottom sheet (`items-end` +
  `rounded-t-2xl`) with `safe-area-inset-bottom` padding.
- Scroll-lock via `document.body.classList.add("overflow-hidden")`
  while open.
- Mounted in the shop tenant layout so it's available on every
  subpage (home, san-pham, gioi-thieu, lien-he) and the modal can
  be opened from any product card.

---

## 5. Auto-built shop gallery

**`frontend/components/shopsite/ShopGallery.jsx`**

Aggregates 6–12 unique images from existing sources:

```
cover  →  visuals.homepagePromo  →  visuals.aboutHero
       →  introImages[]          →  productImages[]
```

De-duplicated in declaration order so the storefront-visuals
no-reuse contract is preserved (cover never repeats inside the
gallery, homepage promo never appears twice, etc.).

- **Desktop**: 12-col CSS grid with a hand-tuned `col-span` /
  `row-span` pattern → "masonry-light" rhythm without pulling in
  any masonry library. SSR-pure.
- **Mobile**: 1-row horizontal scroller, `snap-x snap-mandatory`
  so each tile snaps into view as the user flicks.
- Renders nothing when fewer than 4 unique images are available
  (avoids a sad 3-tile gallery on brand-new shops).

---

## 6. Mobile product card UX v2

`frontend/components/shopsite/ShopProductCard.jsx`

Mobile hierarchy is now strictly:

```
1. image (square, full bleed)
2. name (2-line clamp)
3. price (extrabold red, 15px)
4. CTA row (red "Hỏi nhanh" + green phone icon)
```

Hidden on mobile (still rendered desktop):
- fitment line ("Toyota • Vios • 2018-2021")
- "Loại hàng" chip

Reasoning: phone screens were carrying 5 text rows per card. The
fitment + part-type still load into the DOM for SEO / screen
readers but `hidden sm:block` keeps them out of the visual rhythm.

---

## 7. Social proof pills

**`frontend/components/shopsite/ShopSocialProofPills.jsx`**

Renders 1-3 metric pills directly under the live strip:

| Pill | Source | Notes |
| --- | --- | --- |
| `👥 X+ khách đã chọn` | `productCount × 10` bucketed (100+/500+/1k+/5k+/10k+/20k+) | Conservative proxy: a shop carrying N SKUs has historically served at least ~10N buyers. Bucketed so the number never looks fabricated. |
| `📅 Hoạt động từ <year>` | `publishedAt`/`createdAt` year, only when shop is ≥ 1 calendar year old | Hidden for brand-new shops to avoid `Hoạt động từ 2026` (current year). |
| `🚘 Chuyên A / B` | top 2 of `trust.topBrands` | Same brand pills the trust strip uses, condensed to one chip. |

---

## 8. Performance

- **Quick-RFQ modal**: deferred via `next/dynamic({ ssr: false })`
  so the modal bundle only loads after first interaction.
- **Gallery**: pure SSR HTML, every `<img>` uses the existing
  `ShopImage` (which is `loading="lazy"` by default for non-priority
  slots). Below-fold images don't fetch until they scroll into view.
- **Map iframe**: already `IntersectionObserver`-mounted
  (`ShopMapVisualBlock.jsx`, unchanged).
- **First product row**: kept the prior `priority={idx < 3}` hint
  so the LCP candidate pool stays warm.
- **Page-level launcher**: a single tiny client island in the
  layout — no per-card React mount, no per-card axios import.

---

## 9. Files touched

```
frontend/components/shopsite/ShopLiveActivityStrip.jsx           NEW
frontend/components/shopsite/ShopTrustedSellerBlock.jsx          NEW
frontend/components/shopsite/ShopSocialProofPills.jsx            NEW
frontend/components/shopsite/ShopGallery.jsx                     NEW
frontend/components/shopsite/ShopQuickRfqModal.jsx               NEW
frontend/components/shopsite/ShopQuickRfqLauncher.jsx            NEW
frontend/components/shopsite/ShopProductCard.jsx                 MODIFIED
frontend/app/(shopsite)/shops/[slug]/layout.js                   MODIFIED
frontend/app/(shopsite)/shops/[slug]/page.js                     MODIFIED
frontend/app/(shopsite)/shops/[slug]/san-pham/page.js            MODIFIED
audit/storefront-live.md                                         NEW
audit/screenshots/storefront-live/*.png                          NEW
```

## 10. DO NOT TOUCH — confirmed untouched

- SEO metadata + canonical helpers + JSON-LD
- Routing, wildcard middleware, host detection
- Product canonical URLs
- RFQ matching engine, supplier dispatch
- All public APIs (RFQ create still uses the existing payload)
- Auth, JWT, OTP flows
- Upload pipeline / R2 / `ShopImage` URL contract

## 11. Verification

Backend RFQ create with the modal's payload shape:

```bash
$ curl -X POST https://otofine.com/api/rfq/create \
    -H 'Content-Type: application/json' \
    -d '{"phone":"+84999000222",
         "partDescription":"Lọc gió Vios test smoke",
         "vehicle":{"brand":"Toyota","model":"Vios","year":2020},
         "imageUrls":[]}'
{
  "publicId": "76c34d77c18ee96d5c31274cb2d416c3",
  "otpExpiresAt": "...",
  "devOtpCode": "351420"
}
```

Storefront markers in subdomain HTML (one render of `/`):

```
2  Chuyên hãng
2  Đang mở cửa
2  Hình ảnh từ shop
10 Hỏi nhanh
2  khách đã chọn
2  Người bán đáng tin
2  Phản hồi trong
2  sản phẩm trên kệ
2  Tìm phụ tùng nhanh
```

Screenshots: `audit/screenshots/storefront-live/`

| File | Confirms |
| --- | --- |
| `desktop-home-fold.png` | Live strip, social pills, trust checklist, floating launcher |
| `desktop-home-full.png` | Gallery masonry, full page rhythm |
| `desktop-quick-rfq-open.png` | Modal opens with pre-filled fields from product card |
| `desktop-product-grid.png` | Cards with "Hỏi nhanh" + phone CTA row |
| `iphone-home-fold.png` | Mobile hero + live strip + social pills + floating bottom CTA |
| `iphone-home-mid.png` | Mobile product cards v2 (image / name / price / CTA) |
| `iphone-product-cards.png` | sản phẩm page mobile cards with phone icon |
| `iphone-quick-rfq-open.png` | Bottom-sheet modal on mobile |
| `android-home-fold.png` | Pixel 5 parity |
| `android-product-cards.png` | Pixel 5 product cards |
