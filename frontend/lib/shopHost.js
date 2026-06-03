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
 * Canonical list lives in backend/domains/shopPublic/config/publicShop.config.js
 * (RESERVED_SHOP_SLUGS). Keep this set identical; nginx uses the same labels.
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

/** Labels that must never map to a shop slug (Phase 6B.3a). */
export const IGNORED_SHOP_SUBDOMAIN_LABELS = new Set([
  "www",
  "api",
  "admin",
  "localhost",
  "127.0.0.1",
]);

/** Shop-tenant platform suffixes (*.otofine.com + local dev). */
export const SHOP_PLATFORM_SUFFIXES = Object.freeze([
  ".otofine.com",
  ".localhost",
  ".lvh.me",
  ".nip.io",
]);

/** Internal rewrite target for invalid subdomain slugs (loop-safe). */
export const SUBDOMAIN_INVALID_REWRITE_PATH = "/404";

/** DNS-safe slug regex; matches backend SLUG_REGEX exactly. */
export const SUBDOMAIN_SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

/**
 * Phase 6B.3a — extract a shop slug from Host on *.otofine.com (and
 * local dev suffixes). Returns null for ignored/invalid/non-shop hosts.
 *
 * @param {string} host
 * @returns {string|null}
 */
export function extractShopSlugFromHost(host) {
  const cls = classifyShopSubdomainHost(host);
  return cls.kind === "ok" ? cls.slug : null;
}

/**
 * Classify host for subdomain internal rewrite (Phase 6B.3a).
 *
 * @returns {{ kind: "none"|"ignored"|"invalid"|"ok", slug?: string, label?: string, suffix?: string }}
 */
export function classifyShopSubdomainHost(host) {
  if (!host) return { kind: "none" };
  const raw = String(host);
  if (raw.length > MAX_HOST_LENGTH + 10) return { kind: "none" };
  const hostname = stripPort(raw);
  if (!hostname) return { kind: "none" };
  if (hostname.length > MAX_HOST_LENGTH) return { kind: "none" };
  if (!HOST_CHAR_REGEX.test(hostname)) return { kind: "none" };

  if (
    ROOT_HOSTS.has(hostname) ||
    hostname === "localhost" ||
    hostname.startsWith("127.0.0.1")
  ) {
    return { kind: "none" };
  }
  if (hostname.endsWith(".vercel.app")) return { kind: "none" };

  for (const suffix of SHOP_PLATFORM_SUFFIXES) {
    if (!hostname.endsWith(suffix)) continue;
    const label = hostname.slice(0, -suffix.length);
    if (!label || label.includes(".")) {
      return { kind: "invalid", label: label || "", suffix };
    }
    if (IGNORED_SHOP_SUBDOMAIN_LABELS.has(label) || RESERVED_SUBDOMAINS.has(label)) {
      return { kind: "ignored", label, suffix };
    }
    if (!SUBDOMAIN_SLUG_REGEX.test(label)) {
      return { kind: "invalid", label, suffix };
    }
    return { kind: "ok", slug: label, suffix };
  }

  return { kind: "none" };
}

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

/**
 * True iff this slug is permitted to render via subdomain right now.
 *
 * Decoupled from `classifyHost` so the call site keeps a clean
 * decision matrix: classify → know the slug → THEN check allowlist.
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
  return extractShopSlugFromHost(hostname);
}

/**
 * Phase 6B.3a — internal subdomain rewrite decision.
 * Returns `{ slug, internalPath }`, `{ invalid: true, internalPath }`, or null.
 */
export function resolveSubdomainInternalRewrite({ host, pathname, flagEnabled }) {
  if (!flagEnabled) return null;

  const path = pathname || "/";
  if (
    path === SUBDOMAIN_INVALID_REWRITE_PATH ||
    path.startsWith(`${SUBDOMAIN_INVALID_REWRITE_PATH}/`)
  ) {
    return null;
  }

  const cls = classifyShopSubdomainHost(host);
  if (cls.kind === "none" || cls.kind === "ignored") return null;

  if (cls.kind === "invalid") {
    return {
      invalid: true,
      slug: cls.label || null,
      internalPath: SUBDOMAIN_INVALID_REWRITE_PATH,
    };
  }

  const slug = cls.slug;
  if (!slug) return null;
  if (path.startsWith(`/shops/${slug}`)) return null;

  const cleanPath = path.replace(/\/+$/, "") || "/";
  if (!SHOP_REWRITE_PATHS.has(cleanPath)) return null;

  const internalPath =
    cleanPath === "/" ? `/shops/${slug}` : `/shops/${slug}${cleanPath}`;

  return { slug, internalPath };
}

/**
 * Decide whether a (host, pathname) pair maps to a shop tenant
 * rewrite. Returns `{ slug, internalPath, decision }` or null.
 *
 * @deprecated Prefer resolveSubdomainInternalRewrite for middleware.
 */
export function resolveShopRewrite({ host, pathname, flagEnabled }) {
  const decision = resolveSubdomainInternalRewrite({ host, pathname, flagEnabled });
  if (!decision) return null;
  if (decision.invalid) return decision;
  return {
    slug: decision.slug,
    internalPath: decision.internalPath,
    decision: HOST_DECISIONS.REWRITE_OK,
  };
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

/**
 * Apex domain used for storefront subdomains (`{slug}.otofine.com`).
 * Edge-safe — reads only NEXT_PUBLIC_* env vars.
 */
export function getShopPlatformApexDomain() {
  const explicit = (process.env.NEXT_PUBLIC_SHOP_PLATFORM_APEX || "")
    .trim()
    .replace(/^\.+/, "")
    .replace(/\/+$/, "");
  if (explicit) return explicit;

  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (site) {
    try {
      return new URL(site).hostname.replace(/^www\./i, "");
    } catch {
      /* ignore */
    }
  }
  return "otofine.com";
}

function usesLocalShopSubdomainHost() {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!site) return false;
  try {
    const host = new URL(site).hostname;
    return (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".lvh.me") ||
      host.endsWith(".nip.io") ||
      host.startsWith("127.0.0.1")
    );
  } catch {
    return false;
  }
}

/**
 * Phase 6B.4 — primary storefront canonical URL.
 * Always emits the subdomain form: https://{slug}.otofine.com[/subPath]
 * (or http://{slug}.localhost in local dev).
 *
 * @param {string} slug
 * @param {string} [subPath] e.g. "" | "san-pham" | "gioi-thieu" | "lien-he"
 * @returns {string|null}
 */
export function buildShopPrimaryCanonicalUrl(slug, subPath = "") {
  const normalized = String(slug || "").trim().toLowerCase();
  if (!normalized || !SUBDOMAIN_SLUG_REGEX.test(normalized)) return null;
  if (RESERVED_SUBDOMAINS.has(normalized)) return null;

  const sub = subPath
    ? `/${String(subPath).replace(/^\//, "").replace(/\/$/, "")}`
    : "";

  if (usesLocalShopSubdomainHost()) {
    return `http://${normalized}.localhost${sub || "/"}`;
  }

  const apex = getShopPlatformApexDomain();
  return `https://${normalized}.${apex}${sub || "/"}`;
}
