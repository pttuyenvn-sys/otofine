# Shop Public Pages — Rollout Plan

**Companion to:** `shop-public-pages-overview.md`
**Status:** Plan only. **Nothing has been deployed.**

This document is the end-to-end recipe to take the shop-public-page
work from "nothing exists" to "every approved seller has a working
storefront under `<slug>.otofine.com`". It is intentionally
conservative: each phase is independently reversible and ends with a
verified production checkpoint.

---

## 0. Rollout philosophy

| Principle                                          | Why                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| **One feature flag** (`PUBLIC_SHOPSITE_ENABLED`)   | Backend module is OFF by default; flipping the flag is the deploy    |
| **Additive DB migrations**                         | Down-migration is trivial because nothing depends on the new columns |
| **No traffic until DNS flips**                     | Code can ship to production for days without a single user hitting it |
| **Per-shop allow-list before public beta**         | Limits blast radius; lets us hand-tune the first storefronts         |
| **Same Next.js + Express processes**               | Zero new runtime infra; same PM2 deploy story                        |
| **Apex traffic untouched at every phase**          | If anything fails, the apex marketplace continues to operate         |

---

## 1. Pre-flight (Phase 0) — does not touch production

These items can happen in parallel and don't require any production
deploy:

| #  | Task                                                                                        | Owner       | Outcome                                                              |
| -- | ------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------- |
| 1  | Verify DNS provider for `otofine.com` (Cloudflare? other registrar?)                        | Ops         | Decision: Cloudflare proxy vs. DNS-01 wildcard                       |
| 2  | If Cloudflare: create a scoped API token (zone:read + dns:edit on `otofine.com`)            | Ops         | Token stored at `/root/.secrets/cf.ini` chmod 600                    |
| 3  | Stage migration 040 SQL on a dev DB                                                         | Dev         | Migration runs in < 1 s on full prod-sized table copy                |
| 4  | Draft the wildcard nginx server block in `audit/` (this doc + `shop-subdomain-routing.md`)  | Dev         | Reviewable diff                                                      |
| 5  | Land the new `domains/shopPublic/` (or equivalent) backend module behind `PUBLIC_SHOPSITE_ENABLED=false` | Dev | Code in production but routes don't register; zero behavior change   |
| 6  | Land the new `app/(shopsite)/` Next.js route group; middleware shipped but skips work when `host` is apex | Dev | Code in production but unreachable until DNS flips                   |
| 7  | Land sanitizer helper, slug regex, reserved-subdomain constants                             | Dev         | Pure functions; covered by unit tests                                |
| 8  | Pick the demo shop (a real seller with ≥ 5 products and a real cover image)                 | PM          | Slug candidate decided (e.g. `cuahangoto355`)                        |
| 9  | Search Console: verify the existing `otofine.com` domain property covers `*.otofine.com`    | SEO         | Confirms we don't need to re-verify per subdomain                    |
| 10 | Write the playwright smoke test (apex still works, demo subdomain renders, product links go to apex) | QA   | CI gate                                                              |

End-of-phase exit criteria:

- All code is in production, but `PUBLIC_SHOPSITE_ENABLED=false` and
  no `*.otofine.com` DNS records exist. End-users see nothing
  different.
- Migration 040 is applied OR ready to be applied with `npm run
  migrate:shops-public`. Applying it before flipping the flag is
  fine because all new columns are NULL-able and zero existing code
  reads them.

---

## 2. Phase 1 — One demo shop, hand-configured

Goal: prove the entire pipeline (DNS → nginx → cert → middleware →
backend → DB → frontend → SEO) on a single real shop.

### 2.1 Pre-checklist

- [ ] Migration 040 applied on production DB.
- [ ] `PUBLIC_SHOPSITE_ENABLED=true` set in `backend/.env`.
- [ ] PM2 restarted; backend logs show
      `[publicShop] routes registered` once.
- [ ] `GET https://otofine.com/api/public/shops/<slug>` returns
      404 (because no shop has a slug yet — sanity check that the
      route is registered but the data isn't there).

### 2.2 DNS + nginx + cert

1. Add a single A record: `cuahangoto355.otofine.com → 180.93.1.24`.
   **Don't add the wildcard yet** — we want one specific subdomain
   to validate end-to-end before opening the floodgates.
2. Issue a single-host LE cert via the EXISTING `authenticator =
   nginx` flow:
   ```bash
   certbot certonly -d cuahangoto355.otofine.com --nginx
   ```
3. Add the new shop server block to `/etc/nginx/sites-available/otofine`
   using the cert from step 2 (NOT the wildcard yet).
4. Add the `default_server` block at the top of the file with
   `return 444`.
5. `nginx -t && systemctl reload nginx`.
6. Verify: `curl -v https://cuahangoto355.otofine.com/` returns
   Next.js 200 with the shop home content; cert is valid.

### 2.3 Data setup for demo shop

Admin runs through the admin panel:

```
PATCH /api/admin/shops/<demo shop id>
{
  "slug": "cuahangoto355",
  "public_status": "public",
  "bio": "Phụ tùng ô tô chính hãng cho dòng xe Toyota, Honda, Mazda. ...",
  "intro_html": "<p>...rich text...</p>",
  "facebook_url": "https://facebook.com/cuahangoto355",
  "working_hours": "Mo-Su 08:00-18:00",
  "verified_at": "2026-05-25"
}
```

Plus seller-side: upload high-resolution `cover.png` (≥ 1920×600) and
`avatar.png` (≥ 256×256) via the existing `PUT /api/shop/me`. Once
those are in place, the page is live at
`https://cuahangoto355.otofine.com/`.

### 2.4 Validation

- [ ] All four tabs render with the demo shop's content.
- [ ] Product cards on `/san-pham` open
      `https://otofine.com/product/<id>` in the same tab.
- [ ] `view-source:` confirms:
  - `<link rel="canonical" href="https://cuahangoto355.otofine.com/">`
    on home,
  - `<link rel="canonical" href="https://cuahangoto355.otofine.com/san-pham">`
    on listing (no `?page=` in canonical),
  - JSON-LD `Store` block on home with apex `parentOrganization`.
- [ ] `https://cuahangoto355.otofine.com/robots.txt` allows the 4
      tabs and disallows everything else.
- [ ] `https://cuahangoto355.otofine.com/sitemap.xml` validates.
- [ ] `https://cuahangoto355.otofine.com/shop/login` 301-redirects
      to `https://otofine.com/shop/login`.
- [ ] `https://cuahangoto355.otofine.com/admin` returns 404.
- [ ] `https://cuahangoto355.otofine.com/api/zalo/webhook` returns
      404.
- [ ] Lighthouse on `/` ≥ 90 perf / 100 a11y / 100 best practices /
      100 SEO on a throttled 4G profile.
- [ ] **Apex regression check**: `otofine.com`, `www.otofine.com`,
      a product detail page, an SEO landing, and a sample RFQ thread
      all behave identically to the day before. Specifically:
  - `Cache-Control` headers unchanged on apex routes,
  - JSON-LD on `/product/<id>` unchanged,
  - `/api/products?...` and `/api/products/search?q=...` return
    byte-identical payloads (diff against a captured baseline).

### 2.5 Sign-off

Need three signatures: Dev, SEO, Ops. After sign-off, demo shop
stays live indefinitely. If anything below breaks, we rollback by:

```bash
# Remove the cuahangoto355.otofine.com server block; reload nginx.
# Remove the A record. Set public_status='pending' on the row.
```

Apex is unaffected.

### 2.6 Failure scenarios & owner actions

| Symptom                                            | First action                                            |
| -------------------------------------------------- | ------------------------------------------------------- |
| Shop page returns 404                              | Ops: confirm DNS resolves; Dev: confirm `slug` row exists with `public_status='public'`; check `pm2 logs otofine-backend --lines 200` for `[publicShop]` warnings |
| Cert mismatch warning                              | Ops: re-issue single-host cert; confirm nginx server block references the new fullchain.pem |
| Product card links to per-shop URL (BAD)           | Dev: revert the product card change immediately; this is a CRITICAL SEO regression |
| Apex `/product/<id>` 500                           | Dev: PM2 rollback; first suspect = something in the new module accidentally imported into apex path |
| Slow `/san-pham` (> 2 s)                           | Dev: `EXPLAIN` the query; confirm `fk_products_shop` is used; if not, add `idx_products_shop_created (shopId, createdAt DESC)` in a hotfix migration |

---

## 3. Phase 2 — Public beta with allow-list (≤ 20 shops)

Goal: scale to a small number of carefully chosen shops while
keeping the door closed on self-service.

### 3.1 What changes

1. **Wildcard DNS**: add `* → 180.93.1.24`. Now any
   `<anything>.otofine.com` resolves to the VPS.
2. **Wildcard cert**: switch to Let's Encrypt DNS-01 wildcard
   (`shop-subdomain-routing.md §4.2 option B`) OR Cloudflare proxy
   (option A). Replace the nginx server block to use the wildcard
   cert.
3. **Default-server still in place**: any unknown subdomain that
   doesn't have a `slug` in the DB hits the wildcard server block,
   middleware classifies it, looks up the slug, gets 404 from the
   backend, and Next renders a clean 404. No cert warning, no
   misleading content.
4. **Admin UI** in the existing seller admin panel gains a "Public
   site" tab that lets staff:
   - Assign / rename slugs.
   - Flip `public_status` between `pending` and `public`.
   - Set `verified_at`.
   - Preview the storefront before it goes public.

### 3.2 Shop selection criteria

Admin picks the next batch from sellers that already meet
`shop-public-seo-strategy.md §10` (≥ 5 products, name/bio set,
avatar+cover, etc.). Phase 2 is closed-list — sellers cannot
self-claim a slug yet.

### 3.3 Monitoring

| Metric                                                  | Target                              | Source                              |
| ------------------------------------------------------- | ----------------------------------- | ----------------------------------- |
| Apex p95 TTFB                                           | ≤ baseline + 5 %                    | nginx access log                    |
| Per-shop home p95 TTFB                                  | ≤ 400 ms                            | nginx access log filtered by host   |
| `/api/public/shops/*` 5xx rate                          | ≤ 0.1 %                             | pm2 logs                            |
| `idx_shops_slug_status` cardinality / scans             | 1 row per lookup                    | MySQL `EXPLAIN` snapshots           |
| Google Search Console: indexed shop URLs                | ≥ 4 per shop within 14 days         | GSC                                 |
| GSC duplicate-content warnings                          | 0 critical, ≤ 5 "alternate URL with canonical" per shop | GSC |

### 3.4 Exit criteria for Phase 2 → Phase 3

- 14 consecutive days with all monitoring metrics inside targets.
- At least 10 shops live; at least 1 of them ranks for its brand
  name on Google site-search (`site:cuahangoto355.otofine.com
  toyota`).
- Zero apex regressions reported by seller support.
- Zero open P0/P1 bugs against the public shop site code.

---

## 4. Phase 3 — Seller self-service slug claim

Goal: sellers themselves pick their subdomain from the seller-center.

### 4.1 What changes

1. New page `app/shop/website/page.js` (seller-only, behind
   `ShopGuard`).
2. New endpoint `POST /api/shop/website` (requires
   `requireAuth + requireShop`) that accepts `{ slug }`,
   normalizes/validates it, and INSERTs into `shops.slug`. Returns
   409 if taken, 422 on regex/reserved violation.
3. The page shows `public_status` and a "Submit for review" button
   that flips `public_status='pending'` AND notifies an admin
   queue. Admin still has to flip it to `public` (manual
   moderation gate stays through Phase 3).
4. **Phase 3.5** (optional): drop the admin moderation gate once
   we trust automated checks (slug allowlist, bio length, product
   count).

### 4.2 Migration 041 (optional, only if we add slug history)

```sql
-- backend/migrations/041_shop_slug_history.sql
CREATE TABLE shop_slug_history (
  id            int AUTO_INCREMENT PRIMARY KEY,
  shop_id       int NOT NULL,
  old_slug      varchar(63) NOT NULL,
  changed_at    datetime DEFAULT CURRENT_TIMESTAMP,
  changed_by    int NULL,    -- admin id or NULL if seller
  KEY (old_slug),
  CONSTRAINT fk_slug_history_shop FOREIGN KEY (shop_id) REFERENCES shops(id)
);
```

Next.js middleware then 301-redirects requests to old slugs to the
current one. Out of scope for Phase 3.0; this is a 3.5 nicety.

### 4.3 Exit criteria

- ≥ 50 shops live.
- Sellers can self-claim with 0 ops intervention.
- Apex still untouched and stable.

---

## 5. Deploy checklists

Every deploy in any phase uses the same shape.

### 5.1 Code deploy (Next.js + Express)

```
git pull
cd backend  && npm ci --omit=dev && npm run migrate:<scope>
cd ../frontend && npm ci && npm run build
pm2 restart otofine-backend --update-env
pm2 restart otofine-frontend
pm2 save
```

### 5.2 Nginx deploy

```
# Edit /etc/nginx/sites-available/otofine
nginx -t                       # MUST pass
systemctl reload nginx         # graceful, no dropped connections
```

### 5.3 Cert deploy (wildcard switchover, Phase 2)

```
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cf.ini \
  -d otofine.com -d '*.otofine.com' \
  --cert-name otofine.com-wildcard
# Edit nginx to point at the new cert paths
nginx -t && systemctl reload nginx
```

### 5.4 Rollback drill (must be rehearsed in Phase 1)

```
# 1. Flag off
echo "PUBLIC_SHOPSITE_ENABLED=false" >> backend/.env
pm2 restart otofine-backend --update-env

# 2. nginx: remove shop subdomain server block
vim /etc/nginx/sites-available/otofine
nginx -t && systemctl reload nginx

# 3. DNS: remove '*' A record (Phase 2+) or single-host A record (Phase 1)
#    (handled in DNS dashboard)

# 4. DB migration is left in place. The new columns are NULL-able
#    additive, harmless.
```

Apex remains live throughout the rollback.

---

## 6. Cache strategy summary

Already covered in `shop-public-db-impact.md §8` and
`shop-subdomain-routing.md §8`. Quick reference:

| Layer       | TTL       | Invalidator                                        |
| ----------- | --------- | -------------------------------------------------- |
| Browser     | 60 s + SWR 300 s | Soft only                                          |
| Cloudflare (Phase 2+ option A) | uses origin headers | Manual purge by URL when needed |
| Next.js `unstable_cache` | 60 s     | Backend ETag + per-request mismatch                |
| Redis       | 5 min     | Explicit `DEL pubshop:<slug>` on write             |
| Express LRU | 5 min     | Same                                              |
| MySQL       | (storage) | n/a                                                |

---

## 7. Risk-adjusted timeline

These are estimates only; they assume one developer doing the
implementation work alongside other duties.

| Phase           | Calendar duration | Hands-on engineering |
| --------------- | ----------------- | -------------------- |
| Phase 0         | 1 week            | ~3 dev-days          |
| Phase 1         | 1 week            | ~2 dev-days + ops    |
| Phase 2 (rollout to 20 shops) | 2-3 weeks | ~3 dev-days + 1 ops-day |
| Phase 3         | 2 weeks           | ~3 dev-days          |

Total: ~5-6 weeks calendar from greenlight to seller self-service.

---

## 8. Areas that are off-limits during rollout

This is a verbatim repeat of `shop-public-pages-overview.md §2.5`
for emphasis. Touching any of these requires a fresh proposal:

1. `products` table schema. **No** changes.
2. `app/product/[id]/page.js` and its server data fetchers.
3. `app/[slug]/page.js` and any catch-all SEO behavior on apex.
4. `app/shop/**` seller center URLs.
5. `app/admin/**` admin URLs.
6. `app/rfq/**` and `backend/modules/rfq/**`.
7. Existing public `/api/products*` request/response contract.
8. JWT shape and authentication middleware chain.
9. R2 bucket name, key prefix, `R2_PUBLIC_URL`.
10. Typesense collection name (`otofine_products`).
11. The apex `app/robots.js` and `app/sitemap.js`.
12. `frontend/data/seo/cache/**` JSON cache files.

The shop-public-page work lives in three new "zones":

- `backend/domains/shopPublic/` (or `routes/publicShop.routes.js`
  if we prefer thin) — entirely new directory.
- `frontend/app/(shopsite)/` — entirely new route group.
- `frontend/components/shopsite/` — entirely new component
  namespace.

Everything else is touched only with the smallest possible
additive change (one column ALTER, one nginx server block, one
middleware function).

---

## 9. Definition of done (overall)

The shop-public-page feature is **done** when:

1. Phase 3 exit criteria are met.
2. The 6 audit documents (this one + the 5 siblings) are the
   single source of truth for how the system works.
3. There is an on-call runbook for the three most likely failure
   modes (cert renewal failure, slug collision, abusive content
   takedown).
4. The next quarterly architecture review can be a single line:
   "no shop-public regressions".
