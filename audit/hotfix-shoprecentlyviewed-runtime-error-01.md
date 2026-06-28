# HOTFIX-SHOPRECENTLYVIEWED-RUNTIME-ERROR-01

**Date:** 2026-06-22  
**Severity:** Production runtime error on SEO listing pages  
**Root cause:** Missing import in `Home.jsx`

---

## Incident

```
ReferenceError: ShopRecentlyViewed is not defined
```

**Affected:** SEO landing pages rendered via `app/[slug]/page.js` → `Home.jsx`, e.g. `/phu-tung-toyota`, `/phu-tung-kia`, BMY/CBM listings.

---

## Investigation (`rg ShopRecentlyViewed frontend`)

| File | Status |
|------|--------|
| `components/shopsite/ShopRecentlyViewed.jsx` | Component exists, default export OK |
| `app/(shopsite)/shops/[slug]/page.js` | Import present ✓ |
| `components/pages/Home.jsx` | **Used at line 1423, import missing** ✗ |

Not used in `SeoListingContent.jsx` — failure came from `Home.jsx` bottom rail on filtered listing pages (`pathname !== "/"`).

---

## Fix

Added missing import to `Home.jsx`:

```javascript
import ShopRecentlyViewed from "@/components/shopsite/ShopRecentlyViewed";
```

No SEO, sitemap, or image logic changes.

---

## Files changed

| File | Change |
|------|--------|
| `frontend/components/pages/Home.jsx` | Add `ShopRecentlyViewed` import |

---

## Validation

| URL | HTTP |
|-----|------|
| `/phu-tung-toyota` | 200 |
| `/phu-tung-kia` | 200 |
| `/phu-tung-toyota-vios` | 200 |

Build:

```
cd frontend && npm run build
✓ Compiled successfully — exit 0
```

`pm2 restart otofine-frontend` applied.

---

## Checklist

1. Imported correctly? — **Fixed** (was missing in `Home.jsx`)
2. Component renamed? — **No**
3. Component deleted? — **No**
4. Conditional render mismatch? — **No** (render condition valid; only import missing)
