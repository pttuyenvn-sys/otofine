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
 * Phase 4.5 hardening: a Host header longer than 253 chars (DNS spec
 * cap) can be a poisoning probe or a bug; refuse to even parse it.
 */
export const MAX_HOST_LENGTH = 253;

/** Phase 4.5: legal DNS hostname charset (RFC 1035 — letters/digits/dot/hyphen). */
const HOST_CHAR_REGEX = /^[a-z0-9.\-]+$/;

/**
 * Decision codes returned by `classifyHost` — used by the middleware
 * to emit structured metric events and decide rewrite vs pass-through.
 *
 *   "rewrite_ok"          → real shop subdomain, route to internal path
 *   "apex"                → apex host (do nothing)
 *   "reserved_subdomain"  → reserved label (api/admin/...) — pass through
 *   "invalid_subdomain"   → slug regex failed or empty — pass through
 *   "multi_level"         → e.g. "foo.bar.otofine.com" — pass through
 *   "host_too_long"       → > 253 chars — pass through
 *   "host_invalid_chars"  → non-DNS chars — pass through
 *   "unknown_suffix"      → e.g. "*.vercel.app" — pass through
 */
export const HOST_DECISIONS = Object.freeze({
  REWRITE_OK: "rewrite_ok",
  APEX: "apex",
  RESERVED_SUBDOMAIN: "reserved_subdomain",
  INVALID_SUBDOMAIN: "invalid_subdomain",
  MULTI_LEVEL: "multi_level",
  HOST_TOO_LONG: "host_too_long",
  HOST_INVALID_CHARS: "host_invalid_chars",
  UNKNOWN_SUFFIX: "unknown_suffix",
});

/**
 * Single source of truth for "what should the middleware do with this
 * host?". Returns `{ decision, slug?, suffix? }`. NEVER throws.
 *
 * Centralizing this here lets us unit-test the matrix and lets the
 * middleware emit per-decision metrics without ad-hoc branches.
 */
export function classifyHost(hostname) {
  if (!hostname) return { decision: HOST_DECISIONS.APEX };
  const raw = String(hostname);
  if (raw.length > MAX_HOST_LENGTH + 10 /* port + brackets margin */) {
    return { decision: HOST_DECISIONS.HOST_TOO_LONG };
  }
  const host = stripPort(raw);
  if (!host) return { decision: HOST_DECISIONS.APEX };
  if (host.length > MAX_HOST_LENGTH) {
    return { decision: HOST_DECISIONS.HOST_TOO_LONG };
  }
  if (!HOST_CHAR_REGEX.test(host)) {
    return { decision: HOST_DECISIONS.HOST_INVALID_CHARS };
  }
  if (ROOT_HOSTS.has(host)) return { decision: HOST_DECISIONS.APEX };
  if (host.endsWith(".vercel.app")) return { decision: HOST_DECISIONS.UNKNOWN_SUFFIX };

  const suffixes = [".otofine.com", ".localhost", ".lvh.me", ".nip.io"];
  for (const suffix of suffixes) {
    if (!host.endsWith(suffix)) continue;
    const sub = host.slice(0, -suffix.length);
    if (!sub) return { decision: HOST_DECISIONS.INVALID_SUBDOMAIN, suffix };
    if (sub.includes(".")) return { decision: HOST_DECISIONS.MULTI_LEVEL, suffix };
    if (RESERVED_SUBDOMAINS.has(sub)) {
      return { decision: HOST_DECISIONS.RESERVED_SUBDOMAIN, slug: sub, suffix };
    }
    if (!SUBDOMAIN_SLUG_REGEX.test(sub)) {
      return { decision: HOST_DECISIONS.INVALID_SUBDOMAIN, slug: sub, suffix };
    }
    return { decision: HOST_DECISIONS.REWRITE_OK, slug: sub, suffix };
  }
  return { decision: HOST_DECISIONS.UNKNOWN_SUFFIX };
}

/**
 * Extract a shop subdomain label from a hostname.
 * Thin wrapper around `classifyHost` for backward-compat callers.
 *
 * Returns the slug ONLY when the decision is `rewrite_ok`; otherwise
 * null. Reserved / invalid / multi-level all return null so the
 * existing call sites (basePath, canonical) keep their old semantics.
 */
export function extractShopSubdomain(hostname) {
  const { decision, slug } = classifyHost(hostname);
  return decision === HOST_DECISIONS.REWRITE_OK ? slug : null;
}

/**
 * Decide whether a (host, pathname) pair maps to a shop tenant
 * rewrite. Returns `{ slug, internalPath, decision }` or null.
 *
 * Phase 4.5: now also exposes the `decision` code on success so the
 * middleware can attribute its metrics without re-running classification.
 */
export function resolveShopRewrite({ host, pathname, flagEnabled }) {
  if (!flagEnabled) return null;
  const cls = classifyHost(host);
  if (cls.decision !== HOST_DECISIONS.REWRITE_OK) return null;
  const sub = cls.slug;
  if (pathname.startsWith(`/shops/${sub}`)) return null;
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  if (!SHOP_REWRITE_PATHS.has(cleanPath)) return null;
  const internalPath = cleanPath === "/" ? `/shops/${sub}` : `/shops/${sub}${cleanPath}`;
  return { slug: sub, internalPath, decision: cls.decision };
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
