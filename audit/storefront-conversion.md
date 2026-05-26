# Storefront — Conversion Engine

Phase goal: increase chat / RFQ / call conversions, keep buyers on
the storefront longer, make the shop feel actively operating, lift
the return-visit rate. Strict guard-rails: do not touch SEO,
canonical URLs, routing, RFQ engine, middleware, auth, APIs, or the
wildcard subdomain infra.

## Surfaces added / changed

| # | Item                             | Mount / scope                                                                  | Notes |
|---|----------------------------------|--------------------------------------------------------------------------------|-------|
| 1 | Recently viewed strip            | `app/(shopsite)/shops/[slug]/page.js` — anchor `#recently-viewed`              | Pure client island; pulls from shared `lib/shopsite/recentlyViewed.js`. SSR-empty, paints after mount, hidden when buyer has no history. |
| 2 | Product sticky CTA — Hỏi nhanh   | `components/pages/ProductDetail.jsx` desktop + mobile bars                     | Mobile bar: Gọi / Zalo / Hỏi nhanh. Desktop: Gọi / Zalo / Hỏi nhanh / Liên hệ. Opens Quick-RFQ modal pre-filled with product + first fitment. Fallback navigates to `/rfq/new?part=…` when launcher isn't mounted (e.g. legacy apex routes). |
| 3 | Smart RFQ prefill                | `ShopProductCard` + `ProductDetail` + `ShopReturnVisitorBanner`                | Each entry point dispatches `shopsite:openQuickRfq` with a `source`, `productId`, `part`, `brand`, `model`, `year` payload. Launcher acks via `shopsite:openQuickRfq:ack` so callers know whether the modal opened. |
| 4 | Inventory signals on product card| `components/shopsite/ShopProductCard.jsx`                                      | New chip stack: "Cập nhật hôm nay" (updated within 24h *and* differs from createdAt) → fallback "Mới đăng" (created within 7 days). Helper `lib/shopsite/productInventorySignals.js`. Returns `[]` when timestamps missing — no fake claims. |
| 5 | Return visitor banner            | `ShopReturnVisitorBanner` on storefront home                                   | Heuristic: a prior visit marker older than 30 min in localStorage. Body shows recent-views count + 2 CTAs (Gửi RFQ + Xem lại). Per-session dismiss via sessionStorage. First-time visitors never see it. |
| 6 | Shop response score (tiered)     | Upgraded `ShopLiveActivityStrip` chip → `deriveShopResponseScore`              | Tiers: Rất nhanh / Trong ngày / Liên hệ qua điện thoại. Renders `null` if no contact channel — never invents nuance. |
| 7 | Contact mini drawer (mobile-first)| Layout-level `ShopContactMiniDrawer`; bound to `shopsite:openContactDrawer`   | Bottom-sheet on mobile, centered card on desktop. Rows: Gọi / Zalo / Quick-RFQ / Maps / Facebook. Mobile floating CTA's secondary slot now opens the drawer rather than redirecting straight to Zalo. |
| 8 | Buyer confidence pills            | `ShopSocialProofPills` extension                                              | Adds "Đã hoạt động X năm" (when ≥ 2y), "Yêu thích bởi gara" (productCount ≥ 100), "Hỗ trợ toàn quốc" (province + chat channel OR `trust.nationwideSupport`). |

## New / changed files

```
A frontend/lib/shopsite/recentlyViewed.js
A frontend/lib/shopsite/productInventorySignals.js
A frontend/lib/shopsite/responseSpeedScore.js

A frontend/components/shopsite/ShopRecentlyViewed.jsx
A frontend/components/shopsite/ShopReturnVisitorBanner.jsx
A frontend/components/shopsite/ShopContactMiniDrawer.jsx
A frontend/components/shopsite/ShopContactMiniDrawerImpl.jsx
A frontend/components/shopsite/ShopResponseScoreChip.jsx

M frontend/components/shopsite/ShopProductCard.jsx
M frontend/components/shopsite/ShopFloatingMobileCTA.jsx
M frontend/components/shopsite/ShopLiveActivityStrip.jsx
M frontend/components/shopsite/ShopSocialProofPills.jsx
M frontend/components/shopsite/ShopQuickRfqLauncher.jsx
M frontend/components/pages/ProductDetail.jsx
M frontend/app/(shopsite)/shops/[slug]/layout.js
M frontend/app/(shopsite)/shops/[slug]/page.js

A audit/storefront-conversion.md
A audit/screenshots/storefront-conversion/*.png
```

## Event bus contract

| Event                              | Payload                                                                   | Listeners |
|------------------------------------|---------------------------------------------------------------------------|-----------|
| `shopsite:openQuickRfq`            | `{ source, part, vehicle, brand, model, year, productId, shopSlug }`      | `ShopQuickRfqLauncher` (storefront layout + ProductDetail) |
| `shopsite:openQuickRfq:ack`        | _(none)_ — fired by launcher to signal the modal opened                   | `ProductDetail.openQuickRfqWithProduct` fallback detector |
| `shopsite:openContactDrawer`       | _(none)_                                                                  | `ShopContactMiniDrawer` |

All buses are best-effort, no-op on SSR, swallowed in private mode / old WebViews.

## Performance posture

- **No new blocking calls.** All conversion surfaces derive from data already in the public shop / product DTOs.
- **localStorage usage is read-once on mount** (recently viewed, return-visit marker). No write per render.
- **Modal bundles dynamic-imported.** `ShopQuickRfqModal` and `ShopContactMiniDrawerImpl` load only on the first open.
- **Sticky CTAs use scroll-aware visibility** (rAF-throttled scroll handler). No layout-thrashing reflow.
- **SSR HTML stable.** Client-only surfaces (recently viewed, return banner) render `null` on the server, eliminating hydration mismatches.

## Guard-rail verification

- No backend / API change (`backend/` untouched).
- No middleware / route file touched.
- Product canonical URLs unchanged — recently-viewed entries hand off to `/p/<id>` which 308-redirects to the canonical `/<slug>-<id>` in one hop.
- Product detail page on apex still renders identically until the buyer taps "Hỏi nhanh".

## Verify

```
curl -s https://otofine.com/shops/cuahangoto355 \
  | grep -oE 'Đang mở cửa|Phản hồi · (Rất nhanh|Trong ngày)|Yêu thích bởi gara|Hỗ trợ toàn quốc'
```

Expected output includes:
- `Đang mở cửa`
- `Phản hồi · Rất nhanh`
- `Yêu thích bởi gara`
- `Hỗ trợ toàn quốc`

Screenshots: `audit/screenshots/storefront-conversion/` covers desktop home, desktop product detail with Hỏi nhanh CTA, desktop Quick-RFQ modal, desktop & iPhone return-visitor banner, iPhone full-scroll home, iPhone contact drawer, iPhone product detail sticky bar.
