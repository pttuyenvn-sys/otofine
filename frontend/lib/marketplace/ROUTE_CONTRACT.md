# Apex route slug contract (internal)

Two disjoint slug families share `frontend/app/[slug]/page.js`. Classifiers
must stay mutually exclusive — see `isMarketplaceListingSlug.js` and
`looksLikeProductSlug()` in `productSeoUrl.js`.

## Marketplace listing slugs (→ Home.jsx)

Produced by `buildPathFromState()` in `Home.jsx`. Optional query: `?keyword=`.

| Shape | Example |
|-------|---------|
| Category only | `/loc-gio-o-to` |
| Vehicle filters | `/phu-tung-hyundai-i10-2021` |
| Category + vehicle | `/dong-co-hyundai-i10-2021` |
| Legacy vehicle path | `/hyundai-i10-2021`, `/mazda-3-2024` |
| With location | `…-tai-{location}` |

Structural markers (classifier):

- Prefix `phu-tung` / `phu-tung-*`
- Suffix `-o-to`
- Infix `-tai-`
- Trailing listing year `-YYYY` (1950–2035) without a part-number token before it

**Must never** enter `tryRenderProduct()` or canonical product redirect.

## Product detail slugs (→ ProductDetail)

Produced by `buildProductSeoUrl()`: `/{slugPrefix}-{productId}`.

- Trailing segment: positive numeric **product id**
- Prefix includes part name, optional fitment, and usually **part number** immediately before id
- Example: `/cong-tac-len-kinh-tong-mazda-3-2013-bjg366350aoem-2024`

Legacy entry points (unchanged): `/p/{id}`, `/product/{id}`, `/phu-tung/{slug}`.

## Forbidden overlaps

A slug must not satisfy **both** listing and product classifiers.

Regression tests: `routeClassifier.invariant.test.js`.

Dev guard: `[RouteInvariant]` in `looksLikeProductSlug()` when overlap detected.

## Deprecated / do not import

- `marketplaceRouting.deprecated.js` — archived Phase A1 parser; **Home.jsx is canonical**
