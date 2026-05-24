/**
 * Pure host parsing helpers shared between the middleware (edge runtime)
 * and server components that need to know whether the current request
 * arrived on a shop subdomain.
 *
 * IMPORTANT: this file MUST stay edge-safe — no fs, no DB, no
 * @/lib/config (which reads non-edge env vars).
 *
 * Keep in sync with backend/domains/shopPublic/config/publicShop.config.js
 * (slug regex, reserved list).
 */

/** Apex hosts that should NEVER be treated as a shop subdomain. */
export const ROOT_HOSTS = new Set([
  "otofine.com",
  "www.otofine.com",
  "localhost",
  "127.0.0.1",
]);

/**
 * Reserved subdomains — these labels must never resolve to a shop slug.
 * Mirrors the backend RESERVED_SHOP_SLUGS set; keep both in sync.
 */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "api",
  "admin",
  "rfq",
  "shop",
  "shops",
  "mail",
  "assets",
  "cdn",
  "app",
  "static",
  "img",
  "rfq-img",
  "m",
  "mobile",
  "account",
  "auth",
  "seller",
  "support",
  "help",
  "docs",
  "blog",
  "status",
  "staging",
  "dev",
  "qa",
  "test",
  "preview",
  "next",
]);

/** DNS-safe slug regex; matches backend SLUG_REGEX exactly. */
export const SUBDOMAIN_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/**
 * Only the four shop-tenant page paths get rewritten when on a
 * subdomain. Everything else (product detail, _next, api, etc.) is
 * passed through to apex routing untouched.
 */
export const SHOP_REWRITE_PATHS = new Set([
  "/",
  "/san-pham",
  "/gioi-thieu",
  "/lien-he",
]);

export function stripPort(host) {
  if (!host) return "";
  const idx = host.indexOf(":");
  return (idx === -1 ? host : host.slice(0, idx)).toLowerCase().trim();
}

/**
 * Extract a shop subdomain label from a hostname.
 *
 * Returns:
 *   - string  → recognised "<sub>.otofine.com" / "<sub>.localhost" /
 *               "<sub>.lvh.me" / "<sub>.nip.io" style hostname
 *   - null    → apex, *.vercel.app, multi-level subdomain, or anything
 *               we don't recognise (caller MUST treat as "do nothing")
 */
export function extractShopSubdomain(hostname) {
  if (!hostname) return null;
  const host = stripPort(hostname);
  if (ROOT_HOSTS.has(host)) return null;
  if (host.endsWith(".vercel.app")) return null;

  const suffixes = [".otofine.com", ".localhost", ".lvh.me", ".nip.io"];
  for (const suffix of suffixes) {
    if (host.endsWith(suffix)) {
      const sub = host.slice(0, -suffix.length);
      if (!sub || sub.includes(".")) return null;
      return sub;
    }
  }
  return null;
}

/**
 * Decide whether a (host, pathname) pair maps to a shop tenant
 * rewrite. Returns the target internal path, or null to do nothing.
 *
 * Pure function — used by middleware AND by server components that
 * need to know the basePath under which links should be generated.
 */
export function resolveShopRewrite({ host, pathname, flagEnabled }) {
  if (!flagEnabled) return null;
  const sub = extractShopSubdomain(host);
  if (!sub) return null;
  if (RESERVED_SUBDOMAINS.has(sub)) return null;
  if (!SUBDOMAIN_SLUG_REGEX.test(sub)) return null;
  if (pathname.startsWith(`/shops/${sub}`)) return null;
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  if (!SHOP_REWRITE_PATHS.has(cleanPath)) return null;
  const internalPath = cleanPath === "/" ? `/shops/${sub}` : `/shops/${sub}${cleanPath}`;
  return { slug: sub, internalPath };
}

/**
 * True iff the request originated on a *.otofine.com (or local dev)
 * subdomain that maps to a real shop. Used by server components to
 * switch the link basePath from "/shops/<slug>/…" to "/…" so the
 * pretty subdomain URLs stay sticky after a click.
 */
export function isShopSubdomainHost(host, slug) {
  const sub = extractShopSubdomain(host);
  if (!sub) return false;
  if (RESERVED_SUBDOMAINS.has(sub)) return false;
  if (slug && sub !== slug) return false;
  return SUBDOMAIN_SLUG_REGEX.test(sub);
}
