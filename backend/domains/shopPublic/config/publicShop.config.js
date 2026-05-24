/**
 * Public-shopsite configuration with lazy getters so process.env is
 * always read at access time (consistent with the auth.config pattern
 * documented in audit/auth-runtime-debug.md).
 */
export const publicShopConfig = {
  get enabled() {
    const raw = String(process.env.PUBLIC_SHOPSITE_ENABLED ?? "").trim().toLowerCase();
    return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
  },
  get listPageSize() {
    const n = Number(process.env.PUBLIC_SHOPSITE_PAGE_SIZE);
    return Number.isFinite(n) && n > 0 && n <= 60 ? n : 16;
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
