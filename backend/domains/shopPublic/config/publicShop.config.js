/**
 * Public-shopsite configuration with lazy getters so process.env is
 * always read at access time (consistent with the auth.config pattern
 * documented in audit/auth-runtime-debug.md).
 *
 * Phase 6A adds an optional per-slug rollout allowlist mirroring the
 * frontend `shopHost.ALLOWLIST`. The two are NOT coupled at runtime
 * (the backend can be permissive while the frontend gates), but ops
 * should set them to the same value for predictable behaviour.
 *
 * env shape:
 *   PUBLIC_SHOPSITE_ENABLED=true
 *   PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED=true            # frontend middleware flag
 *   PUBLIC_SHOPSITE_ALLOWED_SLUGS=phutungoto355,demo  # OR "*" / empty = open
 *   PUBLIC_SHOPSITE_PAGE_SIZE=20
 */
function parseFlag(raw) {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function parseAllowlist(raw) {
  const v = String(raw ?? "").trim();
  if (!v || v === "*") return { enabled: false, set: new Set() };
  const set = new Set(
    v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
  if (set.size === 0) return { enabled: false, set: new Set() };
  return { enabled: true, set };
}

export const publicShopConfig = {
  get enabled() {
    return parseFlag(process.env.PUBLIC_SHOPSITE_ENABLED);
  },
  get subdomainEnabled() {
    return parseFlag(process.env.PUBLIC_SHOPSITE_SUBDOMAIN_ENABLED);
  },
  get listPageSize() {
    const n = Number(process.env.PUBLIC_SHOPSITE_PAGE_SIZE);
    return Number.isFinite(n) && n > 0 && n <= 60 ? n : 20;
  },
  /**
   * Returns `{ enabled, slugs }` for the configured allowlist. When
   * `enabled === false`, every public shop is accessible (open rollout).
   * When `enabled === true`, only listed slugs are considered live
   * for subdomain rollout signalling.
   *
   * The backend itself still SERVES every public shop via the API —
   * we don't 404 non-allowlisted shops because the apex page still
   * needs them. The flag is consumed by:
   *   - the rollout/observability layer (`storefront.subdomain-pending`
   *     log when a non-allowlisted shop's API is hit)
   *   - the seller-side rollout panel ("Your shop is queued for
   *     subdomain activation")
   */
  get allowlist() {
    return parseAllowlist(process.env.PUBLIC_SHOPSITE_ALLOWED_SLUGS);
  },
  isSlugAllowed(slug) {
    const a = this.allowlist;
    if (!a.enabled) return true;
    return a.set.has(String(slug || "").toLowerCase());
  },
};

/**
 * Reserved subdomains / slugs that must never resolve to a real shop.
 * Matches audit/shop-subdomain-routing.md §5.
 */
export const RESERVED_SHOP_SLUGS = new Set([
  "www",
  "api",
  "admin",
  "rfq",
  "shop",
  "shops",
  "app",
  "assets",
  "cdn",
  "mail",
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
]);

/** Slug must be DNS-safe and 3-40 chars. Same regex everywhere. */
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
