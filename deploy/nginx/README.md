# deploy/nginx — example reverse-proxy configs

This folder holds **reference** Nginx configurations. None of the files
in here are auto-deployed; you copy or symlink the ones you want into
`/etc/nginx/sites-available/` and reload Nginx.

Production apex configuration (`otofine.com`, `www.otofine.com`,
`api.otofine.com`, `rfq.otofine.com`) lives on the host and is **NOT**
shipped from this repo. The files here only describe net-new server
blocks that complement the existing setup.

## Files

| File                              | Purpose                                                       |
|-----------------------------------|---------------------------------------------------------------|
| `shop-subdomain.example.conf`     | Wildcard `*.otofine.com` proxy → Next.js (Phase 3 of shopsite).|

See each file's header for activation steps and rollback instructions.

## Phase 3 quick-start checklist

1. Provision wildcard TLS for `*.otofine.com` (DNS-01 via Cloudflare or
   Cloudflare Universal SSL — both options documented in the example
   file).
2. Add a `CNAME *  →  otofine.com` (or wildcard A record) in DNS.
3. Symlink `shop-subdomain.example.conf` into `sites-enabled` and
   `nginx -t && systemctl reload nginx`.
4. Set on the Next.js process:
   ```
   PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=true
   ```
5. Smoke-test: `curl -I https://cuahangoto355.otofine.com/`

## Rollback

Two independent kill switches:

* **Code path**  — set `PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=false` on
  the Next.js process and restart with `pm2 restart otofine-frontend
  --update-env`. The middleware then short-circuits to a no-op for
  all subdomain logic; the legacy `/product` redirect still runs.
* **Edge**       — `sudo rm /etc/nginx/sites-enabled/otofine-shop-subdomain.conf
  && sudo systemctl reload nginx`. Subdomains then return whatever
  the default-server block does (444 in the example, or the platform's
  default 404). Apex is untouched in both cases.
