# Shop Public Page — Phase 3 implementation result

> Goal: serve `https://cuahangoto355.otofine.com` as the same content as `/shops/cuahangoto355` via **internal rewrite only**, with no apex regression and a one-flag rollback. SEO indexing of subdomain content stays OFF until Phase 4.

---

## 1. Decision tree (middleware)

Every request that reaches `frontend/middleware.js` is evaluated in this order:

```
INCOMING REQUEST
  │
  ├─ pathname is "/product" or "/product/"
  │       → 307 redirect to "/"               (legacy behaviour, kept)
  │
  ├─ PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED ≠ true
  │       → next()                            (kill switch ON — no-op)
  │
  ├─ host header missing / unparseable
  │       → next()
  │
  ├─ host is "otofine.com" | "www.otofine.com" | "localhost" | "127.0.0.1"
  │       → next()                            (apex bypass)
  │
  ├─ host ends in ".vercel.app"
  │       → next()                            (preview deploys bypass)
  │
  ├─ host does NOT end in ".otofine.com" / ".localhost" / ".lvh.me" / ".nip.io"
  │       → next()                            (unrecognised host)
  │
  ├─ extracted subdomain has a "." (multi-level, e.g. staging.foo.otofine.com)
  │       → next()
  │
  ├─ subdomain ∈ RESERVED ("www", "api", "admin", "rfq", "shop", "shops",
  │                        "mail", "assets", "cdn", "app", "static", "img",
  │                        "rfq-img", "m", "mobile", "account", "auth",
  │                        "seller", "support", "help", "docs", "blog",
  │                        "status", "staging", "dev", "qa", "test",
  │                        "preview", "next")
  │       → next()                            (let apex serve)
  │
  ├─ subdomain fails the DNS-safe regex (3-40 chars, [a-z0-9-])
  │       → next()
  │
  ├─ pathname already starts with "/shops/<sub>" (loop prevention)
  │       → next()
  │
  ├─ pathname (after trimming "/") ∉ {"/", "/san-pham", "/gioi-thieu", "/lien-he"}
  │       → next()                            (product detail, fetch calls,
  │                                            /_next assets, etc. pass through)
  │
  └─ REWRITE → /shops/<sub><pathname>         (with x-otofine-shop-slug header)
```

The matcher excludes `/_next/*`, `/api/*`, `/favicon.ico`, `/robots.txt`, `/sitemap.xml`, static folders, and every common static-asset extension so the function never runs for those.

---

## 2. Files changed

```
frontend/middleware.js                              ← rewritten (~70 LOC, was 14)
frontend/lib/shopHost.js                            NEW — pure host parser shared
                                                    by middleware + server pages
frontend/services/shopPublic.service.js             + getShopBasePath() helper
frontend/app/(shopsite)/shops/[slug]/layout.js      ← basePath from request host
frontend/app/(shopsite)/shops/[slug]/page.js        ← uses basePath for sidebar /
                                                      banner / "Xem tất cả"
frontend/app/(shopsite)/shops/[slug]/san-pham/page.js
                                                    ← uses basePath for sidebar +
                                                      "Xem thêm" pagination
frontend/components/shopsite/ShopTabs.jsx           ← handles basePath="" (subdomain)
frontend/.env.example                               + PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED
deploy/nginx/shop-subdomain.example.conf            NEW — wildcard server block,
                                                    default_server 444, CF strategy
deploy/nginx/README.md                              NEW
audit/shop-public-phase3-result.md                  NEW (this file)
audit/screenshots/phase3/*                          NEW — 16 PNGs (8 scenarios × 2 vp)
```

**Untouched:** `app/[slug]`, `app/product`, RFQ, auth, products APIs, Typesense schema, R2, JWT, seller-center pages, `app/robots.js`, `app/sitemap.js`, product canonical generators, the SEO cache layer, apex Nginx config.

---

## 3. Rewrite flow — anatomy of one request

User opens `https://cuahangoto355.otofine.com/san-pham`:

```
1. CLIENT → DNS              cuahangoto355.otofine.com → CNAME otofine.com
                              (Cloudflare wildcard, see §5)

2. CLIENT → NGINX :443       SNI matches *.otofine.com server block
                              (deploy/nginx/shop-subdomain.example.conf)
                              proxy_pass http://127.0.0.1:3000
                              Host header preserved → "cuahangoto355.otofine.com"

3. NGINX  → NEXT.JS          GET /san-pham   Host: cuahangoto355.otofine.com

4. middleware.js             host  = "cuahangoto355.otofine.com"
                              sub   = "cuahangoto355"        (passes regex)
                              path  = "/san-pham"            (∈ SHOP_REWRITE_PATHS)
                              decision = rewrite to "/shops/cuahangoto355/san-pham"
                              NextResponse.rewrite(url)
                              + response header x-otofine-shop-slug: cuahangoto355

5. App Router                Renders app/(shopsite)/shops/[slug]/san-pham/page.js
                              params.slug = "cuahangoto355"

6. layout.js → headers()      Reads "cuahangoto355.otofine.com" → isShopSubdomainHost=true
                              → basePath = ""
                              → ShopTabs hrefs become "/", "/san-pham", "/gioi-thieu",
                                "/lien-he"

7. fetchPublicShopProducts    GET https://otofine.com/api/public/shops/cuahangoto355/products?perPage=16
                              (Phase 2 backend endpoint, same DB row)

8. RESPONSE                   HTML body with <meta name="robots" content="noindex, nofollow">
                              + the shop's title and the rewritten content.
                              Browser address bar stays:
                              https://cuahangoto355.otofine.com/san-pham
```

---

## 4. Safety / rollback (two independent kill switches)

| Layer  | Action                                                                                     | Effect                                                                                  |
|--------|--------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------|
| Code   | `pm2 stop otofine-frontend` → set `PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=false` → `pm2 restart otofine-frontend --update-env` | Middleware becomes a 5-line no-op (only the legacy `/product` redirect remains). Apex traffic unaffected. |
| Edge   | `sudo rm /etc/nginx/sites-enabled/otofine-shop-subdomain.conf` → `sudo systemctl reload nginx`                            | Nginx default_server (`return 444;`) catches subdomain traffic. Apex unaffected.        |

Either or both are safe. They do not require code changes, builds, or DNS updates.

The legacy redirect (`/product[/]?` → `/`) is preserved in both states, so seller-center / SEO crawls keep behaving identically.

---

## 5. Nginx + DNS reference config

`deploy/nginx/shop-subdomain.example.conf` is an **example** (not auto-deployed). It documents:

- a `default_server` block that `return 444;` for unknown hostnames,
- a `server_name *.otofine.com;` block that `proxy_pass http://127.0.0.1:3000`,
- preservation of `Host`, `X-Forwarded-*` headers so the middleware can see the original hostname,
- an `if ($host ~* "^(www|api|…)\.otofine\.com$") { return 404; }` belt-and-braces match for reserved labels (mirrors `RESERVED_SUBDOMAINS` in `frontend/lib/shopHost.js`),
- an edge `add_header X-Robots-Tag "noindex, nofollow";` so even the bytes that leak past the meta tag stay out of the index,
- both wildcard TLS strategies (Let's Encrypt DNS-01 via Cloudflare + Cloudflare Universal SSL),
- the single `CNAME *  →  otofine.com` DNS record needed.

Apex Nginx config is **not** in this repo; we only ever copy the example block above into `sites-available` and symlink. The apex server blocks keep winning for `otofine.com` / `www.otofine.com` / `api.otofine.com` / `rfq.otofine.com` because Nginx prefers more-specific server_name matches.

---

## 6. Local dev

Chrome ≥64 (and Firefox, Safari) resolve `*.localhost` to `127.0.0.1` natively — no `/etc/hosts` edits needed.

```bash
# Frontend running on port 3000:
open http://cuahangoto355.localhost:3000/
open http://cuahangoto355.localhost:3000/san-pham
open http://cuahangoto355.localhost:3000/gioi-thieu
open http://cuahangoto355.localhost:3000/lien-he

# Reserved label — bypasses, hits apex:
open http://rfq.localhost:3000/

# Unknown slug — bypasses rewrite to /shops/foobar, layout returns 404:
open http://foobar.localhost:3000/
```

For machines / browsers that don't resolve `*.localhost`:

```bash
# nip.io maps every "*.<ip>.nip.io" to that IP automatically:
open http://cuahangoto355.127-0-0-1.nip.io:3000/

# OR add to /etc/hosts (per-machine):
127.0.0.1   cuahangoto355.localhost   foobar.localhost   rfq.localhost
```

For CI / Playwright (Chrome blocks setting the `Host` request header, so `extraHTTPHeaders` will NOT spoof a host), use `*.localhost` URLs directly. The Phase 3 screenshot script (`/tmp/screenshot-phase3.mjs` in this run) uses exactly this pattern.

---

## 7. Smoke-test matrix (results)

### A. APEX regression (`Host: otofine.com`)
| Path                                 | HTTP |
|--------------------------------------|------|
| `/`                                  | 200  |
| `/shop/login`                        | 200  |
| `/shop-demo` (Phase 1)               | 200  |
| `/shops/cuahangoto355` (Phase 2)     | 200  |
| `/shops/unknown-shop`                | 404  |
| `/product/2913`                      | 200  |
| `/rfq/open`                          | 200  |
| `/phu-tung-o-to`                     | 200  |

### B. SUBDOMAIN happy path (`Host: cuahangoto355.otofine.com`)
| Path           | HTTP | Rewritten to                              |
|----------------|------|-------------------------------------------|
| `/`            | 200  | `/shops/cuahangoto355`                    |
| `/san-pham`    | 200  | `/shops/cuahangoto355/san-pham`           |
| `/gioi-thieu`  | 200  | `/shops/cuahangoto355/gioi-thieu`         |
| `/lien-he`     | 200  | `/shops/cuahangoto355/lien-he`            |

### C. SUBDOMAIN pass-through (no rewrite)
| Path                  | HTTP | Reason                              |
|-----------------------|------|-------------------------------------|
| `/product/2913`       | 200  | product detail not in SHOP_REWRITE_PATHS, hits apex behaviour |
| `/_next/...`          | 404  | matcher excludes, served as static asset |
| `/random-path`        | 200  | falls through to apex `[slug]` catch-all |

### D. RESERVED subdomains bypass
`rfq.otofine.com`, `api.otofine.com`, `admin.otofine.com`, `www.otofine.com`, `shop.otofine.com` all `200` — middleware skips the rewrite, apex routing serves whatever the apex would serve.

### E. UNKNOWN subdomain → 404
`doesnotexist.otofine.com/` → 404 (rewrite to `/shops/doesnotexist`, layout's `fetchPublicShop` returns null, `notFound()` triggers Next 404 page).

### F. Noindex enforcement
```
$ curl -sS -H "Host: cuahangoto355.otofine.com" http://127.0.0.1:3000/ | grep robots
<meta name="robots" content="noindex, nofollow"/>

$ curl -sS -H "Host: cuahangoto355.otofine.com" http://127.0.0.1:3000/san-pham | grep robots
<meta name="robots" content="noindex, nofollow"/>

$ curl -sS -H "Host: otofine.com" http://127.0.0.1:3000/ | grep robots
<meta name="robots" content="index, follow"/>
                                ^^^^^         ← apex SEO untouched
```

### G. Rollback verified
Setting `PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=false` and restarting:
- apex `/` → 200 ✓
- apex `/shops/cuahangoto355` → 200 ✓ (Phase 2 path still routable)
- subdomain `cuahangoto355.otofine.com/` → 200 but serving apex home (rewrite disabled)
- `/product` → 307 ✓ (legacy redirect preserved)

Re-enabling: identical to first run.

---

## 8. Screenshots

Stored in `audit/screenshots/phase3/`. Eight scenarios × two viewports.

| File prefix             | What it shows                                                   |
|-------------------------|-----------------------------------------------------------------|
| `apex-home-*`           | Apex landing on `localhost:3000/` — unchanged                   |
| `apex-shop-*`           | Apex `/shops/cuahangoto355` (Phase 2 path still works)          |
| `subdomain-home-*`      | `cuahangoto355.localhost:3000/` → identical to `apex-shop`       |
| `subdomain-products-*`  | `cuahangoto355.localhost:3000/san-pham`                          |
| `subdomain-about-*`     | `cuahangoto355.localhost:3000/gioi-thieu`                        |
| `subdomain-contact-*`   | `cuahangoto355.localhost:3000/lien-he`                           |
| `subdomain-404-*`       | `doesnotexist.localhost:3000/` — Next 404 ("Không tìm thấy trang") |
| `subdomain-reserved-*`  | `rfq.localhost:3000/` — apex home rendered (bypass)              |

`subdomain-home-desktop.png` is the same byte size as `apex-shop-desktop.png` (1,074,057 bytes) — visual confirmation that the rewrite is content-preserving.

---

## 9. Known UX gaps (Phase 4 candidates)

- The tabs/sidebar/banner links use root-relative hrefs on subdomain (basePath=""), so clicks stay on the subdomain. **But** `ShopProductCard` still emits `/product/[id]` relative. On subdomain that resolves to `cuahangoto355.otofine.com/product/123`, which the apex middleware passes through. The product page renders correctly there, but with an off-canonical URL — Phase 4 will switch those to absolute apex URLs.
- No dynamic robots/sitemap yet — apex `/robots.txt` and `/sitemap.xml` are still apex-only.
- No canonical `<link rel="canonical" href="…">` on subdomain pages — comes with Phase 4 alongside the indexability flip.
- No host-aware metadata for OpenGraph / Twitter cards — same caveat.

These are all small follow-ups that don't require schema or middleware changes.
