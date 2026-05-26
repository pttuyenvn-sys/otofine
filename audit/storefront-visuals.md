# Storefront Visual Diversity Pass — Audit

Phase: **`feat(storefront-visuals): diversify storefront imagery and reduce template repetition`**

## Problem

Every storefront looked like a cookie-cutter template because three
distinct hero slots all pulled from the same source URL
(`shop.cover`):

* **Cover** — the cinematic banner at the top of the storefront
* **Homepage promo banner** — the “UY TÍN – CHẤT LƯỢNG TẠO NIỀM TIN”
  block in the desktop grid
* **About page hero** — the lead image inside the “Giới thiệu” card
  on `/gioi-thieu`

Same image, three times, on the same shop. Combined with the lazy-
loading order, the homepage promo banner often rendered as a flat
dark gradient when the cover was cached and the promo hadn’t painted
yet. The visual repetition made even shops with substantial original
content (intro images, real product photography) feel synthetic.

## Solution

A single SSR-pure resolver that picks one image per slot from a
deterministic preference chain and refuses to ever return the same
URL twice within the same render pass. Per-slot curated automotive
fallbacks rescue real-world data quality problems (e.g. an intro
image URL that has 404’d after the seller migrated their host).

### New / changed files

```
frontend/
├─ lib/shopsite/storefrontVisuals.js     (NEW — central resolver)
├─ lib/shopsite/extractIntroImages.js    (NEW — pure HTML img-src parser)
├─ components/shopsite/ShopImage.jsx     (fallbackSrc + post-mount recovery)
└─ app/(shopsite)/shops/[slug]/
   ├─ page.js                            (PromoBanner uses resolver + ShopImage)
   └─ gioi-thieu/page.js                 (hero uses resolver, fetches products)
```

### Slot preference chains (highest → lowest)

| Slot               | Source 1 (future-ready) | Source 2 | Source 3 | Source 4 | Curated fallback bucket size |
| ------------------ | ----------------------- | -------- | -------- | -------- | ---------------------------- |
| `cover`            | `shop.cover`            | —        | —        | —        | n/a |
| `homepagePromo`    | `shop.homepagePromoImage` | 1st intro img | 1st product img | 2nd product img | 5 |
| `aboutHero`        | `shop.aboutHeroImage`   | 2nd or 1st intro img | 2nd or 1st product img | 3rd product img | 5 |
| `contactMapFallback` | `shop.contactMapImage` | — | — | — | 1 (reserved) |

Within a single render, claimed URLs are tracked so the about hero
will SKIP any URL already used by the cover or promo, even if it
appears first in the about hero’s own preference chain. The same
shop always renders the same fallback (deterministic by `shop.id %
bucket.length`) so there is no hydration flicker or random shuffle
between page navigations.

### Future-ready data model — no migration

The resolver already reads `shop.homepagePromoImage`,
`shop.aboutHeroImage`, and `shop.contactMapImage`. None of these
columns exist yet. When the seller-side editor adds dedicated
upload slots and the backend persists them, the storefront
auto-prefers them with zero additional code change here.

### Curated fallback buckets

Two **disjoint** buckets of automotive Unsplash photos — garage,
mechanic, parts shop, wheel/tire, workshop. So even when the
resolver lands on the curated layer for BOTH the homepage promo and
the about hero, the two slots land on different photos.

### Real-world data quality rescue

Sellers can paste image URLs into the intro editor that later 404.
React’s `onError` doesn’t fire for SSR-rendered `<img>` tags whose
error happens before hydration (browser fires the event with no
listener attached). `ShopImage` now:

1. accepts a `fallbackSrc` prop and swaps to it on the first error
2. runs a post-mount check (`complete && naturalWidth === 0`) so
   pre-hydration errors still trigger the fallback swap
3. emits a `shopsite:event` (`type: image_fallback, tier: primary|fallback`)
   for observability

Verified live: the test shop’s primary promo source 404’d
(`shop-public/content/2-test.webp`); the curated automotive Audi
photo painted in its place within a tick of hydration.

## Mobile polish

* **Homepage promo banner** — `hidden lg:block`, no mobile change
  needed.
* **About hero** — aspect ratio kept at 16:9 on phones (`~27%` of
  viewport height) and dropped to 16:6 on desktop. The hero never
  consumes more than a third of a phone screen.
* **No new overlays / text changes** — the “UY TÍN…” copy is
  unchanged; only the underlying image source diversified.

## Did NOT touch

* SEO / canonical URLs / JSON-LD
* routing / middleware / wildcard subdomain
* RFQ pipeline / Typesense / discovery
* seller-center / upload pipeline / product APIs
* auth flow

## Verification

* `npm run build` clean across all routes.
* `pm2 restart otofine-frontend` healthy.
* Smoke: `GET /shops/phutungoto355` 200, `GET /shops/phutungoto355/gioi-thieu` 200.
* Playwright script asserted **three distinct URLs across cover /
  promo / aboutHero on every viewport** (desktop / iPhone /
  Android).

### Slot resolution on the verification shop (id=2)

```
cover     = https://img.otofine.com/shop-public/cover/2.webp
promo     = https://img.otofine.com/shop-public/content/2-test.webp   (1st intro img — 404 → curated fallback paints)
aboutHero = https://img.otofine.com/shops/2/YL00351080.webp           (1st product img, since intro only had 1)
```

## Screenshots

`audit/screenshots/storefront-visuals/`

| File | What |
| ---- | ---- |
| `desktop-home-fold.png` | Homepage above-the-fold (cover visible). |
| `desktop-home-promo-detail.png` | Promo banner with curated Audi fallback painted. |
| `desktop-about-fold.png` | About page hero shows real product photo (distinct from cover). |
| `iphone-*.png` / `android-*.png` | Same scenarios on mobile. |
