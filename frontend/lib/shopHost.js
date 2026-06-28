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

import {
  isShopSeoRewritePath,
  resolveShopSeoInternalSuffix,
} from "@/lib/shopseo/isShopSeoRewritePath";

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
 * Only legacy static paths are hardcoded; SEO landings use
 * `isShopSeoRewritePath()` (ARCH-07.2).
 */
export const SHOP_REWRITE_PATHS = new Set([
  "/",
  "/gioi-thieu",
  "/lien-he",
  "/san-pham",
  "/phu-tung-o-to",
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
 * Phase 6A — staged rollout allowlist.
 *
 * Parse a comma-separated list of slugs from
 * `PUBLIC_SHOPSITE_ALLOWED_SLUGS`. When set, ONLY those slugs are
 * eligible for subdomain rewrite; every other shop falls through to
 * apex behaviour even when its DNS resolves.
 *
 * Special tokens:
 *   - empty / unset → allowlist DISABLED → all slugs allowed (open
 *     rollout). This is the steady-state once the staging window ends.
 *   - "*"           → explicit "all slugs"; same as empty.
 *
 * Returns a frozen `{ enabled, set }`:
 *   - `enabled` is true iff the env var contains at least one concrete
 *     slug (not "*"). The middleware uses this to know when to apply
 *     the gate at all.
 *   - `set` is the lowercased slug set (or empty Set when disabled).
 *
 * Module-scope memoisation: process.env is read ONCE per JS bundle.
 * The middleware/edge runtime restarts when env changes (PM2
 * `restart --update-env`), so caching is correct.
 */
function parseAllowlist(raw) {
  const v = String(raw ?? "").trim();
  if (!v || v === "*") return { enabled: false, set: new Set() };
  const set = new Set(
    v
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  if (set.size === 0) return { enabled: false, set: new Set() };
  return { enabled: true, set };
}

const ALLOWLIST = Object.freeze(
  parseAllowlist(
    // Both NEXT_PUBLIC_ (browser) and bare env (server) — middleware
    // runs on the edge runtime where Next exposes only the `process.env`
    // values it has inlined at build time, so we accept either name.
    process.env.NEXT_PUBLIC_SHOPSITE_ALLOWED_SLUGS ??
      process.env.PUBLIC_SHOPSITE_ALLOWED_SLUGS,
  ),
);

/**
 * @returns {{ enabled: boolean, slugs: string[] }}
 */
export function getShopAllowlist() {
  return { enabled: ALLOWLIST.enabled, slugs: Array.from(ALLOWLIST.set).sort() };
}

/** Suffixes that accept `{slug}.<suffix>` storefront hosts. */
export const STOREFRONT_HOST_SUFFIXES = new Set([
  ".otofine.com",
  ".localhost",
  ".lvh.me",
  ".nip.io",
]);

/**
 * Hosts that look like wildcard storefront probes — a single subdomain
 * label under a storefront suffix, excluding apex / reserved / foreign
 * suffixes. Used by middleware to block marketplace-homepage pollution.
 *
 * Returns `null` when the host is outside wildcard protection scope.
 *
 * @returns {{ slug: string | null, invalid: boolean, reason: string, suffix: string } | null}
 */
export function getWildcardStorefrontProbe(hostname) {
  const cls = classifyHost(hostname);
  if (!cls.suffix || !STOREFRONT_HOST_SUFFIXES.has(cls.suffix)) return null;

  switch (cls.decision) {
    case HOST_DECISIONS.APEX:
    case HOST_DECISIONS.UNKNOWN_SUFFIX:
    case HOST_DECISIONS.RESERVED_SUBDOMAIN:
      return null;
    case HOST_DECISIONS.HOST_TOO_LONG:
      return {
        slug: null,
        invalid: true,
        reason: cls.decision,
        suffix: cls.suffix,
      };
    case HOST_DECISIONS.HOST_INVALID_CHARS:
      return {
        slug: null,
        invalid: true,
        reason: cls.decision,
        suffix: cls.suffix,
      };
    case HOST_DECISIONS.MULTI_LEVEL:
      return {
        slug: null,
        invalid: true,
        reason: cls.decision,
        suffix: cls.suffix,
      };
    case HOST_DECISIONS.INVALID_SUBDOMAIN:
      return {
        slug: cls.slug ?? null,
        invalid: true,
        reason: cls.decision,
        suffix: cls.suffix,
      };
    case HOST_DECISIONS.REWRITE_OK:
      return {
        slug: cls.slug,
        invalid: false,
        reason: cls.decision,
        suffix: cls.suffix,
      };
    default:
      return null;
  }
}

/**
 * True iff this slug is permitted to render via subdomain right now
 * during the staged rollout window.
 *
 * Pure / edge-safe.
 */
export function isShopSubdomainAllowed(slug) {
  if (!slug) return false;
  if (!ALLOWLIST.enabled) return true;
  return ALLOWLIST.set.has(String(slug).toLowerCase());
}

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
 * Phase 4.5: exposes the `decision` code on success so the middleware
 * can attribute its metrics without re-running classification.
 *
 * Phase 6A: respects the `PUBLIC_SHOPSITE_ALLOWED_SLUGS` allowlist.
 * When the allowlist is enabled and the slug is NOT on it, returns a
 * sentinel `{ decision: REWRITE_OK, slug, blocked: "not-allowlisted" }`
 * so the middleware can emit a metric and fall through to apex
 * routing. This is the staging-rollout mode that lets us flip DNS
 * on globally but still keep most shops apex-only until QA passes.
 */
export function resolveShopRewrite({ host, pathname, flagEnabled }) {
  if (!flagEnabled) return null;
  const cls = classifyHost(host);
  if (cls.decision !== HOST_DECISIONS.REWRITE_OK) return null;
  const sub = cls.slug;
  if (!isShopSubdomainAllowed(sub)) {
    return { slug: sub, decision: cls.decision, blocked: "not-allowlisted" };
  }
  if (pathname.startsWith(`/shops/${sub}`)) return null;
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  if (!isShopSeoRewritePath(cleanPath)) return null;
  const suffix = resolveShopSeoInternalSuffix(cleanPath);
  if (suffix == null) return null;
  const internalPath = suffix ? `/shops/${sub}${suffix}` : `/shops/${sub}`;
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
