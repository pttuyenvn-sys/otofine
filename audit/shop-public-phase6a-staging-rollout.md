# Phase 6A — Staging Wildcard Subdomain Rollout

**Status:** ready for ops. Code is shipped; the activation is two
nginx files, three env vars, and two `pm2 restart` calls.

**Companion docs:**
- `audit/shop-public-rollout-plan.md` — long-form strategy
- `audit/shop-subdomain-routing.md` — host classification matrix
- `deploy/nginx/wildcard-shopsite.conf` — production nginx drop-in
- `deploy/nginx/README.md` — quick-start

This phase enables real internet-accessible shop subdomains
(`<slug>.otofine.com`) for an allowlisted subset of shops, keeping
the apex marketplace as the SEO-canonical home.

---

## 0. Guarantees

| Property                            | Verified |
| ----------------------------------- | -------- |
| Apex `otofine.com` traffic unchanged | yes — apex server block is untouched |
| Existing `/api/*`, `/uploads/*` unchanged | yes — wildcard block proxies identically |
| RFQ / admin / auth unchanged         | yes — reserved labels return 404 |
| Product page canonical stays apex    | yes — `app/product` SEO untouched |
| `noindex,nofollow` on storefronts    | yes — meta tag + nginx `X-Robots-Tag` |
| Two-stage rollback (per-shop, code)  | yes — allowlist + flag are independent |

---

## 1. Cloudflare DNS — exact ops instructions

**Do not auto-modify Cloudflare.** Ops to apply by hand:

| Field    | Value                                  |
| -------- | -------------------------------------- |
| Type     | `CNAME`                                |
| Name     | `*`                                    |
| Target   | `otofine.com`                          |
| Proxy    | **Proxied (orange cloud)**             |
| TTL      | Auto                                   |

Web UI path: **Cloudflare → otofine.com → DNS → Add record**.

### Why CNAME → apex, not a wildcard A record

A CNAME to `otofine.com` means a future origin IP change only has
to update the apex A record; the wildcard inherits it automatically.

### Verification

```bash
# Authoritative resolution
dig +short '*.otofine.com'                # → otofine.com IP (proxied = Cloudflare IPs)
dig +short phutungoto355.otofine.com      # → same proxied IP

# End-to-end through Cloudflare
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' -I https://phutungoto355.otofine.com/
# Expect: 200 (or 301 to https if you hit :80)

# Confirm apex is unaffected
curl -I https://otofine.com/
curl -I https://www.otofine.com/
```

### Rollback (DNS only)

Web UI → **DNS** → row for `*` → either:
* toggle the proxy to **DNS only** (grey cloud) — TLS termination
  moves back to origin, see SSL section, but apex is unaffected; or
* **Delete** the row entirely. Apex stays up because the apex A
  record is independent.

---

## 2. Wildcard SSL strategy

We support three modes, in preferred order. Mode A is what Phase 6A
ships against; B is the fallback if we ever leave Cloudflare; C is the
local-dev story.

### A. Cloudflare proxy + Origin Certificate (recommended)

* Cloudflare's Universal SSL covers `otofine.com` and `*.otofine.com`
  for **visitors** at zero ops cost.
* Origin → Cloudflare leg is secured by a free 15-year Cloudflare
  Origin Certificate signed for `*.otofine.com, otofine.com`.
* Generate at: **Cloudflare → SSL/TLS → Origin Server → Create
  Certificate** (defaults are fine).
* Store on the host:

  ```
  sudo install -d -m 700 /etc/ssl/otofine
  sudo install -m 600 origin.pem /etc/ssl/otofine/origin.pem
  sudo install -m 600 origin.key /etc/ssl/otofine/origin.key
  ```
* Cloudflare → **SSL/TLS → Overview** set to **Full (strict)**.

The shipped `deploy/nginx/wildcard-shopsite.conf` already points at
`/etc/ssl/otofine/origin.pem` + `.key`. **No certbot needed.**

Apex blast radius: zero — the apex cert lives in
`/etc/letsencrypt/live/otofine.com/*` and is unchanged.

### B. DNS-01 wildcard via certbot (fallback)

Used only if we ever turn off the Cloudflare proxy.

```bash
sudo apt install -y python3-certbot-dns-cloudflare

# /etc/letsencrypt/cloudflare.ini (chmod 600)
echo "dns_cloudflare_api_token = <token with Zone.DNS:Edit on otofine.com>" \
  | sudo tee /etc/letsencrypt/cloudflare.ini
sudo chmod 600 /etc/letsencrypt/cloudflare.ini

sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 60 \
  -d 'otofine.com' -d '*.otofine.com' \
  --cert-name otofine.com-wild \
  --preferred-challenges dns-01
```

Then in `wildcard-shopsite.conf`:

```
ssl_certificate     /etc/letsencrypt/live/otofine.com-wild/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/otofine.com-wild/privkey.pem;
```

Certbot's systemd timer (`certbot.timer`) auto-renews; the
`--deploy-hook 'systemctl reload nginx'` is wired by the package.

### C. Local dev

Subdomain testing without DNS or TLS:

```bash
# /etc/hosts
127.0.0.1 phutungoto355.localhost
# then visit:
http://phutungoto355.localhost:3000/
```

`shopHost.classifyHost` already treats `.localhost` and `.lvh.me`
suffixes as valid shop subdomain bases, so this works out of the box.

---

## 3. Nginx — what gets deployed

| File                                                 | Action                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `/etc/nginx/sites-enabled/otofine`                   | **Unchanged** — keeps serving `otofine.com` / `www.otofine.com`.        |
| `/etc/nginx/sites-enabled/otofine-shop-subdomain.conf` | **New symlink** to `wildcard-shopsite.conf` (this PR's drop-in).      |

The wildcard block:

* Only matches `*.otofine.com`. The apex block wins for the literal
  apex hosts (nginx prefers exact > wildcard `server_name`).
* Returns **404 for reserved labels** (`www`, `api`, `admin`, `rfq`,
  `shop`, `shops`, `mail`, `assets`, `cdn`, `app`, `static`, `img`,
  `rfq-img`, `m`, `mobile`, `account`, `auth`, `seller`, `support`,
  `help`, `docs`, `blog`, `status`, `staging`, `dev`, `qa`, `test`,
  `preview`, `next`). Mirrors `frontend/lib/shopHost.RESERVED_SUBDOMAINS`.
* Returns **404 for malformed slugs** (anything that doesn't match
  the same regex as the Next.js middleware) so bad hosts never wake
  the Node process.
* Proxies `/api/`, `/uploads/`, and `/` exactly like the apex block
  (so SSR `fetch` calls from server components keep working on
  subdomains too).
* Ships `X-Robots-Tag: noindex, nofollow` at the edge — defence in
  depth alongside the layout's `<meta name="robots">`. Removed in
  Phase 6B when indexing is intentionally enabled.

Apply:

```bash
sudo cp /var/www/otofine/deploy/nginx/wildcard-shopsite.conf \
        /etc/nginx/sites-available/otofine-shop-subdomain.conf
sudo ln -s ../sites-available/otofine-shop-subdomain.conf \
           /etc/nginx/sites-enabled/
sudo nginx -t          # MUST be OK before continuing
sudo systemctl reload nginx
```

Rollback:

```bash
sudo rm /etc/nginx/sites-enabled/otofine-shop-subdomain.conf
sudo nginx -t && sudo systemctl reload nginx
```

(Apex stays up either way.)

---

## 4. Env activation

Three flags. They are independent so each can be toggled without
restarting the others.

| Flag                                  | Where                  | Value (Phase 6A)             |
| ------------------------------------- | ---------------------- | ---------------------------- |
| `PUBLIC_SHOPSITE_ENABLED`             | `backend/.env`         | `true` (already set)         |
| `PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED`   | `frontend/.env.local`  | `true`                       |
| `NEXT_PUBLIC_SHOPSITE_ALLOWED_SLUGS`  | `frontend/.env.local`  | `phutungoto355` (CSV) or `*` for open |
| `PUBLIC_SHOPSITE_ALLOWED_SLUGS`       | `backend/.env`         | `phutungoto355` (mirror)     |

Order of operations:

```bash
# 1. Backend (allowlist mirror only — backend stays permissive otherwise)
cd /var/www/otofine/backend
printf '\nPUBLIC_SHOPSITE_ALLOWED_SLUGS=phutungoto355\n' >> .env
pm2 restart otofine-backend --update-env

# 2. Frontend (the actual user-facing flip)
cd /var/www/otofine/frontend
printf '\nPUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=true\nNEXT_PUBLIC_SHOPSITE_ALLOWED_SLUGS=phutungoto355\n' >> .env.local
pm2 restart otofine-frontend --update-env
```

Rollback (zero downtime):

```bash
# Per-shop: remove from allowlist
sed -i 's/^NEXT_PUBLIC_SHOPSITE_ALLOWED_SLUGS=.*/NEXT_PUBLIC_SHOPSITE_ALLOWED_SLUGS=/' \
       /var/www/otofine/frontend/.env.local
pm2 restart otofine-frontend --update-env

# Full code-path kill switch
sed -i 's/^PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=.*/PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=false/' \
       /var/www/otofine/frontend/.env.local
pm2 restart otofine-frontend --update-env
```

---

## 5. Internal rollout mode (allowlist)

How the allowlist behaves at each layer:

| Layer      | Allowlist effect                                                                  |
| ---------- | --------------------------------------------------------------------------------- |
| DNS / TLS  | None — every `*.otofine.com` host still resolves and terminates TLS.             |
| Nginx      | None — every well-formed slug subdomain proxies to Next.js.                       |
| Middleware | **Filters here.** Non-allowlisted slug → log `middleware.allowlist-skip` and `NextResponse.next()` → falls through to apex routing. |
| Backend    | None (still serves all public shops). Logs `storefront.subdomain-pending` once per slug per process when a non-allowlisted shop's public API is hit. |

User visible behaviour for a non-allowlisted shop, e.g.
`somerandomshop.otofine.com/`:

* DNS / TLS succeed.
* nginx → Next.js → middleware sees subdomain, sees slug NOT in
  allowlist → falls through.
* Apex Next.js router gets the request with the subdomain host. The
  request URL is just `/`, which means the apex home renders **under
  the subdomain host header**. Users will see the marketplace.

This is the correct degradation: nothing breaks, no 404, and the
shop owner can still link `https://otofine.com/shops/<slug>` to share
their storefront. When they're added to the allowlist + a restart
happens, their subdomain "lights up" instantly.

To roll the gate fully open in Phase 6B, set the allowlist to `*`
(or leave it empty) and restart.

---

## 6. Observability — log events to watch

All shopsite events follow the `[shopsite] event=<name> k=v k=v` format.

| Event                                  | Source        | Meaning                                                                |
| -------------------------------------- | ------------- | ---------------------------------------------------------------------- |
| `middleware.rewrite`                   | frontend edge | A subdomain request was rewritten to `/shops/<slug>`. **Success.**     |
| `middleware.allowlist-skip`            | frontend edge | Real shop subdomain, but not on the staging allowlist. Pass-through.   |
| `middleware.reserved-subdomain`        | frontend edge | A reserved label hit middleware (should be rare; nginx returns 404).   |
| `middleware.invalid-subdomain`         | frontend edge | Slug regex failed for an `*.otofine.com` request.                      |
| `middleware.multi-level-host`          | frontend edge | e.g. `foo.bar.otofine.com` — possible abuse.                           |
| `middleware.host-too-long` / `host-invalid-chars` | frontend edge | Host-header poisoning probe.                          |
| `storefront.subdomain-pending`         | backend API   | Public API serving a shop that's not yet on the rollout allowlist.     |
| `storefront.bot-suspected`             | backend API   | Phase 5.7 abuse detector — UA / 404 scan / hot rate hit.               |
| `storefront.rate-limited`              | backend API   | Phase 5.7 token bucket fired a 429.                                    |

Quick tail commands:

```bash
# Frontend edge logs
pm2 logs otofine-frontend --raw --lines 0 | grep -E '\[shopsite\] event=middleware'

# Backend logs
pm2 logs otofine-backend  --raw --lines 0 | grep -E '\[shopsite\] event=storefront\.'
```

What "healthy rollout" looks like in the logs:

```
[shopsite] event=middleware.rewrite slug=phutungoto355 path=/
[shopsite] event=middleware.rewrite slug=phutungoto355 path=/san-pham
[shopsite] event=storefront.subdomain-pending slug=otherrealshop
```

* Many `middleware.rewrite` lines → traffic is flowing.
* `subdomain-pending` lines confirm other shops' public APIs were
  queried (presumably from apex `/shops/<slug>`); they aren't
  hitting their subdomain.

What "investigate" looks like:

```
[shopsite] event=middleware.invalid-subdomain  sub="abc.def"
[shopsite] event=middleware.host-invalid-chars
[shopsite] event=storefront.bot-suspected      ip=anon:xx  reason=hot
```

---

## 7. Safety contract (Phase 6A)

| Concern                                        | How it stays safe                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------- |
| Apex marketplace down                          | Apex server block is untouched. Wildcard block is additive.          |
| Product pages get duplicate-indexed            | `app/product` SEO is untouched; storefronts serve `noindex,nofollow`. |
| Product card link goes to a wrong host         | `ShopProductCard` already emits absolute `https://otofine.com/product/<id>`. |
| Subdomain shows blank / 500 if backend slow    | `*Safe` fetch wrappers (Phase 5.7) degrade gracefully.               |
| Subdomain shows wrong shop                     | Slug regex + reserved-label guard + allowlist all chain together.    |
| TLS misissue (origin cert leaks)               | Origin cert is `*.otofine.com` only; not apex-only. Cloudflare proxy isolates origin. |
| Rollback time                                  | Per-shop: ~5 s (env flip + pm2 restart). Full rollback: ~10 s (rm nginx symlink + reload). |

---

## 8. Test matrix

Reproducible smoke tests. All commands assume DNS + nginx + env are
applied with `phutungoto355` on the allowlist.

| # | Scenario                                  | Command                                                         | Expected                                                                                  |
|---|-------------------------------------------|-----------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| 1 | Apex home                                  | `curl -I https://otofine.com/`                                  | `200`; HTML title is marketplace; `X-Robots-Tag` absent or apex value.                    |
| 2 | Apex product                               | `curl -I https://otofine.com/product/2913`                      | `200`; canonical `<link>` = apex URL; `<meta robots>` = `index,follow`.                   |
| 3 | Apex `/shops/<slug>` (legacy)              | `curl -sS https://otofine.com/shops/phutungoto355 \| grep canonical` | canonical = apex URL; `<meta robots>` = `noindex,nofollow`.                      |
| 4 | RFQ flow                                   | `curl -I https://otofine.com/rfq` (or seller-center RFQ pages) | `200`; unchanged from pre-Phase-6A.                                                       |
| 5 | Admin / auth                               | `curl -I https://otofine.com/admin/login`                      | `200`; same as before.                                                                    |
| 6 | **Allowlisted subdomain** (rewrite)        | `curl -sS https://phutungoto355.otofine.com/ \| grep canonical`  | canonical = `https://phutungoto355.otofine.com/`; `<meta robots>` = `noindex,nofollow`.   |
| 7 | Allowlisted subdomain — products page      | `curl -I https://phutungoto355.otofine.com/san-pham`            | `200`; SSR rendered storefront product list.                                              |
| 8 | Allowlisted subdomain — product detail     | `curl -I https://phutungoto355.otofine.com/product/2913`         | `200`; uses apex product page (middleware passes `/product/*` through).                   |
| 9 | **Non-allowlisted subdomain** (fall-through)| `curl -sS https://anyotherslug.otofine.com/ \| head`             | `200`; renders apex content (NOT the storefront). Log shows `middleware.allowlist-skip`.  |
| 10| Reserved subdomain                         | `curl -sS -o /dev/null -w '%{http_code}\n' https://www.otofine.com/` | apex 200 (literal apex match). For others: `curl -I https://docs.otofine.com/` → `404`. |
| 11| Malformed slug                             | `curl -I 'https://-bad.otofine.com/'`                            | `404` at nginx (slug regex guard rejects before Node).                                    |
| 12| Multi-level abuse                          | `curl -I 'https://a.b.otofine.com/'`                             | nginx forwards (no match on slug regex with `.` in label) → `404`.                        |
| 13| Host header poisoning                      | `curl -I -H 'Host: x'"$(python3 -c 'print("a"*260)')"'.otofine.com' https://otofine.com/` | nginx 400 (host too long).                  |
| 14| Mobile storefront                          | Open `https://phutungoto355.otofine.com/` in Chrome DevTools iPhone emulation | header trust badges, floating CTA bar visible, no horizontal scroll.    |
| 15| OG preview                                 | `curl -sS https://phutungoto355.otofine.com/ \| grep -E 'og:(title|image|url)'` | All present; `og:image` returns 200 via curl.                            |

Run a one-shot script:

```bash
bash /var/www/otofine/scripts/phase6a-smoke.sh
```

(see §10).

---

## 9. Rollout checklist (ops)

Day-of, in order:

- [ ] Backup nginx config: `sudo cp -r /etc/nginx /etc/nginx.pre-phase6a`
- [ ] Cloudflare → DNS → add `CNAME * → otofine.com` (proxied)
- [ ] Cloudflare → SSL/TLS → confirm Universal SSL covers `*.otofine.com`
- [ ] Cloudflare → SSL/TLS → Origin Server → create cert for
      `otofine.com, *.otofine.com`; install to `/etc/ssl/otofine/origin.{pem,key}` (chmod 600)
- [ ] Cloudflare → SSL/TLS → Overview → set to **Full (strict)**
- [ ] Symlink `wildcard-shopsite.conf` → `sites-enabled/otofine-shop-subdomain.conf`
- [ ] `sudo nginx -t` → OK
- [ ] `sudo systemctl reload nginx`
- [ ] Verify apex still responds: `curl -I https://otofine.com/`
- [ ] Append flags to `backend/.env` and `frontend/.env.local`
- [ ] `pm2 restart otofine-backend --update-env`
- [ ] `pm2 restart otofine-frontend --update-env`
- [ ] Run smoke test (§8 / §10)
- [ ] Tail logs for 5 min — confirm `middleware.rewrite` fires; no
      spike of `invalid-subdomain` or `host-too-long`
- [ ] Send the QA link to the demo shop owner

## 10. Rollback checklist

Pick the smallest scope that fixes the issue. All three are valid;
none of them touch apex.

```bash
# A. Per-shop / allowlist
sed -i 's/^NEXT_PUBLIC_SHOPSITE_ALLOWED_SLUGS=.*/NEXT_PUBLIC_SHOPSITE_ALLOWED_SLUGS=/' \
       /var/www/otofine/frontend/.env.local
pm2 restart otofine-frontend --update-env

# B. Code-path kill switch
sed -i 's/^PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=.*/PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=false/' \
       /var/www/otofine/frontend/.env.local
pm2 restart otofine-frontend --update-env

# C. Edge — nginx wildcard off
sudo rm /etc/nginx/sites-enabled/otofine-shop-subdomain.conf
sudo nginx -t && sudo systemctl reload nginx

# D. (only if disaster) — full nginx restore
sudo cp -r /etc/nginx.pre-phase6a/* /etc/nginx/
sudo nginx -t && sudo systemctl reload nginx
```

DNS rollback (Cloudflare):

* Web UI → DNS → row `*` → either toggle to **DNS only** (proxy
  disabled but record stays) or delete the row.
* Apex `A` record is independent — apex stays up.

---

## 11. Final URL verification (post-rollout)

Run these in order. Anything that doesn't match the expected
column is a stop-the-rollout signal.

```bash
# Apex SEO contract
curl -sS https://otofine.com/                       | grep -E 'rel="canonical"|robots"'
curl -sS https://otofine.com/product/2913           | grep -E 'rel="canonical"|robots"'
curl -sS https://otofine.com/shops/phutungoto355    | grep -E 'rel="canonical"|robots"'

# Allowlisted subdomain SEO contract
curl -sS https://phutungoto355.otofine.com/         | grep -E 'rel="canonical"|robots"'
curl -sS https://phutungoto355.otofine.com/san-pham | grep -E 'rel="canonical"|robots"'

# Reserved label
curl -sSI https://docs.otofine.com/                  | head -1   # → HTTP/2 404

# Edge log signal
pm2 logs otofine-frontend --raw --lines 50 | grep -E 'event=middleware\.'
```

Expected SEO contract:

| URL                                                       | canonical                                          | robots                  |
| --------------------------------------------------------- | -------------------------------------------------- | ----------------------- |
| `https://otofine.com/`                                    | `https://otofine.com/`                             | `index,follow`          |
| `https://otofine.com/product/2913`                        | `https://otofine.com/product/2913`                 | `index,follow`          |
| `https://otofine.com/shops/phutungoto355`                 | `https://otofine.com/shops/phutungoto355`          | `noindex,nofollow`      |
| `https://phutungoto355.otofine.com/`                      | `https://phutungoto355.otofine.com/`               | `noindex,nofollow`      |
| `https://phutungoto355.otofine.com/san-pham`              | `https://phutungoto355.otofine.com/san-pham`       | `noindex,nofollow`      |

If all five rows match, Phase 6A is live.
