# Shop Public Pages — Subdomain Routing & Infra

**Companion to:** `shop-public-pages-overview.md`
**Status:** Proposal — no infra change yet.

---

## 1. Goal recap

Serve `<slug>.otofine.com` (e.g. `cuahangoto355.otofine.com`,
`abcparts.otofine.com`) from the **same** VPS and the **same** Next.js
+ Express processes, with **zero impact** to the apex
`otofine.com`/`www.otofine.com`.

Three layers must agree on the tenant identity:

1. **DNS** — wildcard `*.otofine.com → 180.93.1.24`.
2. **Nginx** — single wildcard server block forwarding `Host` and
   adding `X-Forwarded-Host` to upstream Next.js.
3. **Next.js middleware** — classify `Host`, route to apex or shop
   tenant tree, fetch tenant context once per request.

This document covers each layer end-to-end, plus the strategies we
considered and rejected.

---

## 2. DNS strategy

### 2.1 Today

From `audit/system-overview.md` and the nginx audit:

- `otofine.com` and `www.otofine.com` resolve to the production VPS.
- `img.otofine.com`, `rfq-img.otofine.com` are Cloudflare R2 custom
  domains (managed inside the Cloudflare R2 dashboard, not via DNS we
  control directly).
- **No evidence** in repo that Cloudflare proxies the apex domain
  (orange-cloud). Let's Encrypt renews via HTTP-01 + `authenticator =
  nginx`, which is only possible because the origin terminates port
  80 itself.

### 2.2 Proposed

| Record           | Type      | Value                            | Purpose                            |
| ---------------- | --------- | -------------------------------- | ---------------------------------- |
| `otofine.com`    | A         | `180.93.1.24` *(unchanged)*      | Apex marketplace                   |
| `www`            | CNAME     | `otofine.com.` *(unchanged)*     | Apex marketplace                   |
| `*`              | A         | `180.93.1.24` *(NEW)*            | Wildcard for all shop subdomains   |
| `img`            | CNAME     | R2 custom domain *(unchanged)*   | Image CDN                          |
| `rfq-img`        | CNAME     | R2 custom domain *(unchanged)*   | RFQ image CDN                      |

**Cloudflare option** (preferred if Cloudflare is the registrar):
proxy `*` orange-cloud too — that automatically gives you wildcard SSL
under "Universal SSL → 1st-level only" coverage, removes the need for
DNS-01 on our VPS, and adds DDoS + rate limit + WAF for free. Caveat:
WebSocket upgrades for RFQ polling still work but require origin
gzip/etag passthrough; verify against `rfq.conversation.routes.js`
before flipping.

**Non-Cloudflare option** (if DNS lives elsewhere): just add the `*` A
record. We then have to handle SSL ourselves via DNS-01 — see §4.

---

## 3. Nginx config (proposed, NOT yet deployed)

The current `/etc/nginx/sites-available/otofine` is a single server
block for `otofine.com www.otofine.com` (full quote in
`shop-public-pages-overview.md` §1.4). We propose **three** blocks in
the same file, ordered carefully:

```nginx
# 1. Default deny — catches any host that resolves here but isn't ours.
#    MUST come first to claim the default_server slot.
server {
    listen 443 ssl default_server;
    listen 80 default_server;
    server_name _;
    ssl_certificate     /etc/letsencrypt/live/otofine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/otofine.com/privkey.pem;
    return 444;  # close connection without response
}

# 2. Apex (UNCHANGED behavior; only adds X-Forwarded-Host).
server {
    listen 443 ssl;
    server_name otofine.com www.otofine.com;
    ssl_certificate     /etc/letsencrypt/live/otofine.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/otofine.com/privkey.pem;

    client_max_body_size 12m;

    # NEW: forward original host so Next middleware can read it
    proxy_set_header X-Forwarded-Host $host;

    location /api/        { proxy_pass http://127.0.0.1:5000/api/; ... }
    location /uploads/    { proxy_pass http://127.0.0.1:5000/uploads/; }
    location /            { proxy_pass http://127.0.0.1:3000; }
}

# 3. Shop subdomains (NEW).
server {
    listen 443 ssl;
    server_name "~^(?<shop_slug>[a-z0-9][a-z0-9-]{1,40}[a-z0-9])\.otofine\.com$";

    # Wildcard cert covers *.otofine.com (see §4).
    ssl_certificate     /etc/letsencrypt/live/otofine.com-wildcard/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/otofine.com-wildcard/privkey.pem;

    client_max_body_size 12m;

    # Lock down: shop subdomains MUST NOT serve apex-only paths.
    location ~ ^/(api/zalo|api/admin|admin)(/|$) { return 404; }

    # Public Express API (read-only public endpoints only).
    location /api/        {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Shop-Slug $shop_slug;
    }

    # Static asset passthrough (does NOT leak per-shop uploads;
    # the only writer to /uploads/* is RFQ chat which is apex-only).
    location /uploads/    { proxy_pass http://127.0.0.1:5000/uploads/; }

    # Next.js renders the (shopsite) route group.
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Shop-Slug $shop_slug;
    }
}

# 4. HTTP → HTTPS for apex AND shop subdomains.
server {
    listen 80;
    server_name otofine.com www.otofine.com "~^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]\.otofine\.com$";
    return 301 https://$host$request_uri;
}
```

Notes on the changes:

- **`X-Forwarded-Host`** is the canonical Next.js + Express signal.
  The middleware reads it (falling back to `Host`). This is a strict
  superset of today's headers; existing routes don't break.
- **`X-Shop-Slug`** is a pre-parsed convenience header. The
  middleware re-validates it (never trusts it blindly) but it
  skips a regex parse per request.
- **`default_server` returning 444** is the new safety net. Today a
  random subdomain pointing at this VPS would still get a partial
  response with a cert mismatch — that won't happen after we deploy
  this block.
- **`location ~ ^/(api/zalo|api/admin|admin)(/|$) { return 404; }`** is
  the per-shop tenant guard. Even if the Next.js middleware misses,
  nginx refuses to forward webhook/admin calls from a shop subdomain.
- The HTTP→HTTPS redirect is widened to cover shop subdomains so we
  don't accidentally serve cleartext HTML on `<shop>.otofine.com`.

Reload-only deploy: no other server block is touched.

---

## 4. TLS / certificate strategy

### 4.1 Current

```
/etc/letsencrypt/live/otofine.com/
  fullchain.pem  cert.pem  chain.pem  privkey.pem
```

Renewed by `authenticator = nginx` (HTTP-01). Cannot issue a wildcard.

### 4.2 Options

| Option                                       | Pros                                         | Cons                                                              |
| -------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| **A. Cloudflare proxy (orange-cloud apex + wildcard)** | No origin cert work; SSL + WAF + rate-limit + cache for free; matches existing `img.otofine.com` story | Requires Cloudflare to own the DNS zone; need to verify no app feature depends on real client IP (it doesn't — we proxy through nginx that reads `X-Real-IP` from `$remote_addr`, but Cloudflare sets `CF-Connecting-IP` we'd add to `set_real_ip_from`) |
| **B. Let's Encrypt DNS-01 via Cloudflare**   | Wildcard `*.otofine.com` cert lives on origin; no Cloudflare proxy needed | Adds `python3-certbot-dns-cloudflare`, store a scoped Cloudflare API token on the VPS; one more renewal failure mode |
| **C. Per-subdomain Let's Encrypt HTTP-01**   | Zero new tooling                             | Doesn't scale — needs `certbot certonly` for every new shop slug; rate-limited by LE; certificate sprawl                  |

**Recommendation: B for Phase 1, evaluate A for Phase 3.**

Reason: B leaves traffic flow identical (no new edge), proves the
multi-tenant code paths under our own infra, and is reversible. A is
strictly an operational upgrade we can switch to once the product is
stable.

DNS-01 setup outline (B):

```bash
# 1. Install plugin.
apt install python3-certbot-dns-cloudflare

# 2. Create scoped Cloudflare token (zone:read + dns:edit for otofine.com).
echo 'dns_cloudflare_api_token = TOKEN_HERE' > /root/.secrets/cf.ini
chmod 600 /root/.secrets/cf.ini

# 3. Issue wildcard.
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cf.ini \
  -d otofine.com -d '*.otofine.com' \
  --cert-name otofine.com-wildcard

# 4. Auto-renew via existing cron (already in place).
```

The wildcard cert lives at
`/etc/letsencrypt/live/otofine.com-wildcard/fullchain.pem`. The
existing single-host cert is kept as a fallback for the default
server block.

### 4.3 Cert reload contract

`certbot --deploy-hook 'systemctl reload nginx'` is already configured.
The wildcard renewal MUST reuse it. No PM2 restart is needed — Next.js
and Express don't see TLS.

---

## 5. Next.js middleware (proposed, NOT yet implemented)

Today, `frontend/middleware.js` is 14 lines that redirect `/product` →
`/`. We propose replacing it with a multi-purpose middleware whose
`matcher` covers `/`, `/(.*)`. The legacy redirect stays.

Sketch (pseudo-code only — actual implementation deferred):

```js
// frontend/middleware.js (proposed)
import { NextResponse } from "next/server";

const APEX_HOSTS = new Set(["otofine.com", "www.otofine.com", "localhost:3000"]);
const RESERVED_SUBDOMAINS = new Set([
  "www","api","img","rfq","rfq-img","admin","seller","static","cdn",
  "mail","m","mobile","app","staging","dev","qa","test","status",
  "docs","blog","help","support","account",
]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/;

export function middleware(req) {
  const url = req.nextUrl;
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "")
    .toLowerCase();

  // Legacy: /product (no id) → /
  if (url.pathname === "/product" || url.pathname === "/product/") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Apex traffic — unchanged.
  if (APEX_HOSTS.has(host)) return NextResponse.next();

  // Anything *.otofine.com → tenant resolution.
  const m = host.match(/^([^.]+)\.otofine\.com$/);
  if (!m) return NextResponse.next();  // .otofine.com sub-sub or weird host

  const slug = m[1];
  if (RESERVED_SUBDOMAINS.has(slug) || !SLUG_RE.test(slug)) {
    return NextResponse.rewrite(new URL("/not-found", req.url));
  }

  // Per-shop tenant. Rewrite to the (shopsite) route group.
  // Block apex-only paths that should never appear on a shop host.
  const APEX_ONLY = ["/shop", "/admin", "/rfq", "/product", "/api/zalo", "/api/admin"];
  if (APEX_ONLY.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
    return NextResponse.redirect(`https://otofine.com${url.pathname}${url.search}`);
  }

  // Pass slug to server components via header (next/headers can read it).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-shop-slug", slug);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    // Skip Next internals, static, and image optimizer.
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg).*)",
  ],
};
```

Key decisions:

- **Resolution happens server-side, never trusts the browser.** The
  `x-shop-slug` request header is set by middleware after validation;
  any header arriving from the browser with that name is overwritten.
- **Shop subdomain + apex-only path = 301 to apex.** This guarantees a
  seller who bookmarks `https://myshop.otofine.com/shop/login` lands
  on the real seller login at `https://otofine.com/shop/login` with
  no broken UI in between.
- **Route group selection via rewrite, not redirect.** The user's URL
  bar shows `https://<slug>.otofine.com/san-pham`; internally the
  server renders `app/(shopsite)/san-pham/page.js`.
- **Reserved subdomains return Next 404** — they never accidentally
  proxy upstream.

`app/(shopsite)/layout.js` reads the slug:

```js
import { headers } from "next/headers";

export default async function ShopSiteLayout({ children }) {
  const h = await headers();
  const slug = h.get("x-shop-slug");
  if (!slug) notFound();
  const shop = await getPublicShopBySlug(slug);   // calls backend, cached
  if (!shop || shop.publicStatus !== "public") notFound();
  return <ShopChrome shop={shop}>{children}</ShopChrome>;
}
```

`getPublicShopBySlug` hits `GET /api/public/shops/:slug` with
`unstable_cache` (60s) keyed by slug. Backend, in turn, hits Redis
(5-min TTL) keyed by slug.

---

## 6. Backend tenant context

Routes mounted under `/api/public/shops/:slug/*` read the slug from
the URL param, not from headers. The new
`backend/middlewares/publicShop.middleware.js` (proposal) does:

```js
export async function loadPublicShop(req, res, next) {
  const raw = String(req.params.slug || "").toLowerCase();
  if (!SLUG_RE.test(raw) || RESERVED.has(raw)) {
    return res.status(404).json({ error: "Shop không tồn tại" });
  }
  const cached = await redis.get(`pubshop:${raw}`);
  let shop = cached ? JSON.parse(cached) : null;
  if (!shop) {
    const [rows] = await pool.query(
      "SELECT id, slug, name, avatar, cover, public_status FROM shops WHERE slug = ? LIMIT 1",
      [raw],
    );
    shop = rows[0] || null;
    if (shop) await redis.setex(`pubshop:${raw}`, 300, JSON.stringify(shop));
  }
  if (!shop || shop.public_status !== "public") {
    return res.status(404).json({ error: "Shop không tồn tại" });
  }
  req.publicShop = shop;
  next();
}
```

This middleware is the ONLY way to attach `req.publicShop`; no other
code path may set it. All public shop endpoints chain
`loadPublicShop` → handler.

---

## 7. Local / dev / staging strategy

| Environment | Host strategy                                                          |
| ----------- | ---------------------------------------------------------------------- |
| Local dev   | `http://localhost:3000` (apex) + `http://demo.localtest.me:3000` (shop). `localtest.me` resolves any subdomain to `127.0.0.1` — no `/etc/hosts` edits needed |
| Staging     | `staging.otofine.com` (apex) + `<slug>.staging.otofine.com` (shop). Same wildcard cert strategy, separate `*.staging.otofine.com` wildcard |
| Production  | `otofine.com` + `<slug>.otofine.com`                                   |

Middleware compares `host.replace(/:[0-9]+$/, "")` to
`{ "otofine.com", "www.otofine.com", "localhost", "staging.otofine.com" }`.
The slug extraction regex covers `localtest.me` and
`*.staging.otofine.com` variants — actual regex set is a config
constant in `frontend/lib/host/apexHosts.js` (new helper, NOT yet
written).

---

## 8. Performance & caching

| Layer       | Cache                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------- |
| Browser     | `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on shop home, products list   |
| Edge        | Cloudflare default rules respect the above; no manual config needed                            |
| Next.js     | `unstable_cache` 60s for slug→shop and shop→featured-products                                  |
| Express     | In-process LRU 1000 entries × 5 min for slug→shop; Redis fallback for multi-instance           |
| MySQL       | `slug` becomes a UNIQUE indexed column; the lookup is one B-tree hit                           |

Per-shop sitemap is cached 10 minutes at the application layer and 1
hour at the browser. Per-shop robots.txt is regenerated per request
(it's tiny).

---

## 9. Rollback strategy

Single feature flag: `PUBLIC_SHOPSITE_ENABLED`.

| Flag value | Effect                                                                                  |
| ---------- | --------------------------------------------------------------------------------------- |
| `false`    | Backend `publicShop.routes.js` does not register → endpoints return 404. Middleware in Next still does nothing for shop hosts because no traffic reaches them yet (DNS controlled separately) |
| `true`     | All public shop endpoints active                                                        |

To roll back at the worst case:

1. Set `PUBLIC_SHOPSITE_ENABLED=false` in backend `.env` → `pm2 restart otofine-backend --update-env`.
2. nginx wildcard server block is still there but the upstream API
   returns 404 for all public shop endpoints → 404 page renders on
   shop subdomains.
3. To go further: comment out the wildcard nginx server block + `nginx
   -s reload`. Apex completely unaffected.
4. To go furthest: remove the `*` DNS A record. Wildcard subdomains
   no longer resolve, apex untouched.

No data migration is reversed at any rollback stage; the schema
changes are additive (see `shop-public-db-impact.md`).

---

## 10. Areas DO NOT TOUCH (this work package)

Repeated from `shop-public-pages-overview.md §2.5` for emphasis:

1. The current `otofine.com` nginx server block — only ADD
   `proxy_set_header X-Forwarded-Host $host;` inside it, nothing else.
2. `app/[slug]/page.js` and any SEO route under apex.
3. `app/product/[id]/page.js`.
4. Every `app/shop/**` seller page and `app/admin/**` admin page.
5. The RFQ module — `app/rfq/**` and `backend/modules/rfq/**`.
6. `productList.service.js` / `productList.repository.js` — we add a
   NEW caller path via `getProductList({ ..., shopId })`; the
   existing public listing API behavior must stay byte-identical.
7. Typesense collection name and indexed-field schema for everything
   except adding `shopId` (which is additive).
8. R2 bucket name, key prefix, and `R2_PUBLIC_URL`.
9. JWT shape and the auth middleware chain.
10. `frontend/data/seo/cache/**` JSON cache files.
