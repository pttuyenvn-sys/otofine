# Storefront brand ownership — pass

**Goal:** Make `<slug>.otofine.com` feel like a real business website, not a
marketplace template. Increase trust, increase conversion, decrease the
"sàn TMĐT" feel.

**Scope:** UI/UX-only. No changes to SEO/canonical URLs, routing, wildcard
middleware, RFQ matching, public APIs, auth, or the upload pipeline.

---

## 1. Branded host detection helper

New shared helper so every component agrees on what "branded storefront"
means without re-implementing host-string compares.

**`frontend/lib/shopsite/isWildcardStorefrontHost.js`**
```js
import { headers } from "next/headers";
import { extractShopSubdomain } from "@/lib/shopHost";

export async function isWildcardStorefrontHost() {
  const hostHeader = (await headers()).get("host") || "";
  if (!hostHeader) return false;
  const sub = extractShopSubdomain(hostHeader);
  return typeof sub === "string" && sub.length > 0;
}
```

- Returns `true` only when the request is on a real shop subdomain
  (already excludes apex, reserved subdomains, IPs, localhost, preview
  hosts via the existing `lib/shopHost.js` `extractShopSubdomain`).
- Server-only by design — imports `next/headers`. Any future "you may
  also like / suggested shop / cross-shop CTA" widget should consult
  this single helper before mounting.

---

## 2. Hide cross-shop discovery on branded subdomain

`RelatedShops` is now mounted only when `isWildcardStorefrontHost()` is
false. Apex marketplace pages (`otofine.com/shops/<slug>`) keep the
section; branded subdomains (`<slug>.otofine.com`) skip it entirely.

Verified with HTML scrapes:

| Host | `Shop tương tự` markers | `Vì sao khách` markers |
| --- | --- | --- |
| `otofine.com/shops/phutungoto355` | 4 | 4 |
| `phutungoto355.otofine.com/` | **0** | 4 |

The Suspense fallback is also skipped on the subdomain — zero wasted
network reservation for a section that will never mount.

---

## 3. Desktop hero compression + CTA prominence

`frontend/components/shopsite/ShopHeader.jsx`

- **Cover aspect ratio**: desktop tightened from `16:5` → `16:4.5`
  (~10% shorter). Mobile (`16:11`) unchanged from the earlier
  compression pass.
- **CTA prominence**: `Nhắn tin` + `Gọi ngay` upgraded to:
  - `px-4 lg:px-5` (was `px-3 sm:px-4`)
  - `py-2.5` (was `py-2`)
  - `text-sm lg:text-[15px]` for slightly larger labels on wide
    screens
  - `font-bold` on "Gọi ngay", `font-semibold` on "Nhắn tin"
  - `shadow-xl` / `shadow-lg` (was `shadow-md` / `shadow`)
  - `ring-1 ring-white/10` / `ring-1 ring-black/5` for an additional
    glass edge that lifts the buttons off the cover overlay
- **Trust-badge priority**: `deriveShopTrustBadges` re-ordered so the
  three highest-trust signals always emit first:
  1. `verified` → "✓ Đã xác minh"
  2. `response` → "⚡ Phản hồi nhanh"
  3. `catalog` → "📦 200+ sản phẩm" (only if `productCount ≥ 10`)
  Then `tenure`, `brand:*` trail.
- **Badge glyphs**: `ShopTrustBadges.jsx` replaced the colored dot
  with semantic glyphs (`✓ ⚡ 📦 ★ ●`) per chip kind. Reads more like
  a brand page than a marketplace chip row.

---

## 4. Mobile floating CTA — scroll-aware visibility

`frontend/components/shopsite/ShopFloatingMobileCTA.jsx` gained a
scroll listener:

- Always visible above the fold (`scrollY < 320`)
- Always visible when within 80px of the page bottom
- Hides on scroll-DOWN (`delta > 8`), shows again on scroll-UP
  (`delta < -6`)

The bar still uses `position: fixed` + safe-area padding. Transition
is `translate-y-[120%]` (slides under the safe area) with
`duration-200 ease-out`.

Verified manually:
- `scrollY=200` → bar visible
- `scrollY=1200` deep inside product grid → bar hidden

---

## 5. "Vì sao khách chọn chúng tôi" — auto-generated trust section

`frontend/components/shopsite/ShopWhyChooseUs.jsx` is a new server
component that derives a clean 1–6 chip grid from existing fields.
The seller cannot write free-text in this slot — keeps quality
consistent across every storefront.

| Signal | Source field | Threshold | Chip title |
| --- | --- | --- | --- |
| Verified | `shop.verified` | true | "Đã xác minh bởi Otofine" |
| Response speed | `phone + (zalo \| facebook)` | ≥ 2 channels | "Phản hồi nhanh nhiều kênh" |
| Catalog scale | `shop.productCount` | ≥ 10 (10+/50+/200+ buckets) | "200+ sản phẩm sẵn kho" |
| Tenure | `publishedAt \|\| createdAt` | ≥ 1 year | "Hoạt động X+ năm trên Otofine" |
| Physical store | `address \|\| province` | any | "Có cửa hàng tại <province>" |
| Nationwide shipping | `phone` present | any | "Giao hàng toàn quốc" |

Returns `null` when zero signals fire so we never render an empty
orange card on a brand-new shop.

Rendered on both apex AND subdomain — the section is brand-friendly
on either surface.

---

## 6. Social / trust icon button row

`frontend/components/shopsite/ShopSocialButtons.jsx` is a new server
component that renders 1–4 round icon-only buttons:

| Channel | Source | Tone |
| --- | --- | --- |
| Zalo | `https://zalo.me/<shop.zalo>` | blue |
| Facebook | `shop.facebook.url` | Facebook blue |
| Google Maps | `lat/lng` or `address, province` | emerald |
| Phone | `tel:<shop.phone>` | brand red |

Mounted in `ShopHeader` on the same row as the trust badges (right
side on `sm+`, stacks below on mobile). Returns `null` if the shop
has zero verified channels. No raw URLs ever rendered.

---

## 7. Product card hover + premium feel

`frontend/components/shopsite/ShopProductCard.jsx`

- Card now lifts on hover: `hover:-translate-y-0.5 hover:shadow-lg`
  alongside the existing red border swap. Smoother
  `duration-150 ease-out` than the previous default.
- New desktop-only hover overlay slides up from the bottom of the
  product image: a thin gradient strip carrying the label
  `"Xem chi tiết →"`. Hidden on mobile (`hidden sm:inline-flex`) so
  touch users aren't surprised by a hover-only state.
- **No fake `Có sẵn` / `Giao nhanh` chips were added.** The public
  products API doesn't expose `stock`, and "DO NOT TOUCH APIs" was
  in-scope for this phase. Inventing those badges would have
  violated the earlier "no fake numbers" principle from Phase 5.5.

---

## 8. Performance

- **Map iframe**: already lazy-mounted via IntersectionObserver in
  `ShopMapVisualBlock.jsx`. Verified — no change needed.
- **Hero LCP**: cover image keeps `priority` so it ships
  `loading="eager"` + `fetchpriority="high"`.
- **First product row**: `ShopProductCard` now accepts a `priority`
  prop; the homepage passes `priority={idx < 3}` so the first three
  featured-product images land in the LCP candidate pool instead of
  the lazy queue. Cards beyond the first row keep `loading="lazy"`.
- **Below-fold sections**: the only client island below the fold is
  the contact map iframe (already lazy). `RelatedShops` is a server
  component, gated behind the subdomain check (so it doesn't ship
  on branded hosts at all). `ShopWhyChooseUs` is pure SSR, no JS
  cost.

---

## 9. Files touched

```
frontend/lib/shopsite/isWildcardStorefrontHost.js                  NEW
frontend/components/shopsite/ShopWhyChooseUs.jsx                   NEW
frontend/components/shopsite/ShopSocialButtons.jsx                 NEW
frontend/components/shopsite/ShopHeader.jsx                        MODIFIED
frontend/components/shopsite/ShopProductCard.jsx                   MODIFIED
frontend/components/shopsite/ShopFloatingMobileCTA.jsx             MODIFIED
frontend/components/shopsite/ShopTrustBadges.jsx                   MODIFIED
frontend/lib/shopsite/shopTrustBadges.js                           MODIFIED
frontend/app/(shopsite)/shops/[slug]/page.js                       MODIFIED
audit/storefront-branding.md                                       NEW
audit/screenshots/storefront-branding/*.png                        NEW
```

## 10. DO NOT TOUCH — confirmed untouched

- SEO metadata + `generateMetadata` flows
- Canonical URL helpers (`getShopCanonicalUrl`)
- Wildcard subdomain middleware
- RFQ supplier matching
- Public product / shop APIs
- Auth, password reset, JWT flows
- Upload pipeline / R2 / `ShopImage` URL contract (only `priority`
  threading was added — backward compatible default)
- Product canonical URLs (`/<slug>-<id>`)

## 11. Verification screenshots

`audit/screenshots/storefront-branding/`

| Surface | Confirms |
| --- | --- |
| `desktop-subdomain-home-fold.png` | Compact hero, prominent CTAs, badge priority, social icons, no "Shop tương tự" |
| `desktop-subdomain-home-full.png` | Full page ends after Service Footer — NO related shops |
| `desktop-apex-home-fold.png` | Same compact hero on apex |
| `desktop-apex-home-full.png` | "Shop tương tự" PRESERVED on apex marketplace |
| `desktop-product-card-hover.png` | Hover overlay "Xem chi tiết" + red border lift |
| `iphone-subdomain-home.png` | Mobile: badges visible, social icons, floating CTA visible |
| `android-subdomain-home.png` | Pixel 5 parity |
| `iphone-subdomain-floating-cta.png` | Floating CTA visible after light scroll (Y=200) |
| `iphone-subdomain-floating-hidden.png` | Floating CTA hidden on deep scroll (Y=1200) |
