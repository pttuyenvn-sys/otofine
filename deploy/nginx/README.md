# deploy/nginx — example reverse-proxy configs

This folder holds **reference** Nginx configurations. None of the files
in here are auto-deployed; you copy or symlink the ones you want into
`/etc/nginx/sites-available/` and reload Nginx.

Production apex configuration (`otofine.com`, `www.otofine.com`,
`api.otofine.com`, `rfq.otofine.com`) lives on the host and is **NOT**
shipped from this repo. The files here only describe net-new server
blocks that complement the existing setup.

## Files

| File                              | Purpose                                                                |
|-----------------------------------|------------------------------------------------------------------------|
| `wildcard-shopsite.conf`          | **Phase 6A** production drop-in: wildcard `*.otofine.com` → Next.js.   |
| `shop-subdomain.example.conf`     | Original Phase 3 reference. Kept for historical context; do not deploy.|

The production drop-in is `wildcard-shopsite.conf`. Activation +
rollback live in its header. End-to-end rollout instructions
(DNS, SSL, env activation, allowlist, monitoring) are in
`/var/www/otofine/audit/shop-public-phase6a-staging-rollout.md`.

## Phase 6A quick-start

```
# 1. Drop the prod wildcard server block in (apex block UNCHANGED).
sudo cp /var/www/otofine/deploy/nginx/wildcard-shopsite.conf \
        /etc/nginx/sites-available/otofine-shop-subdomain.conf
sudo ln -s ../sites-available/otofine-shop-subdomain.conf \
           /etc/nginx/sites-enabled/

# 2. Verify and reload (apex traffic uninterrupted).
sudo nginx -t && sudo systemctl reload nginx

# 3. Flip the frontend flag + staging allowlist, then restart Next.
echo 'PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=true'             >> /var/www/otofine/frontend/.env.local
echo 'NEXT_PUBLIC_SHOPSITE_ALLOWED_SLUGS=phutungoto355'   >> /var/www/otofine/frontend/.env.local
pm2 restart otofine-frontend --update-env

# 4. (optional) Mirror the allowlist on the backend so the seller
#    rollout panel + logs report the same view.
echo 'PUBLIC_SHOPSITE_ALLOWED_SLUGS=phutungoto355'        >> /var/www/otofine/backend/.env
pm2 restart otofine-backend --update-env

# 5. Smoke-test one allowlisted shop + one non-allowlisted shop.
curl -I https://phutungoto355.otofine.com/
curl -I https://somerandomshop.otofine.com/   # should resolve but fall through to apex
```

## Rollback

Three independent kill switches, in order of granularity (cheap → nuclear):

* **Per-shop / allowlist** — remove a slug from
  `NEXT_PUBLIC_SHOPSITE_ALLOWED_SLUGS`, then
  `pm2 restart otofine-frontend --update-env`. That single shop falls
  back to apex `/shops/<slug>` rendering immediately.
* **Code path** — set `PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=false`, then
  `pm2 restart otofine-frontend --update-env`. The middleware
  short-circuits to a no-op for all subdomain logic; the legacy
  `/product` redirect still runs. Edge nginx still answers
  `*.otofine.com`, but the upstream rewrites stop happening so every
  storefront subdomain renders apex content under its subdomain Host
  header. Use this when you want subdomains to keep terminating TLS
  (e.g. SEO crawl in progress) but not yet route through the rewrite.
* **Edge** — `sudo rm /etc/nginx/sites-enabled/otofine-shop-subdomain.conf
  && sudo systemctl reload nginx`. Subdomains then return whatever
  the platform default-server does (404 / connection drop). Apex is
  untouched in all three cases.
