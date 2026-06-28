/**
 * Normalize a shop SEO subPath for `getShopSeoContext` / `getShopCanonicalUrl`.
 * Accepts `""`, `gioi-thieu`, `/phu-tung-o-to`, etc.
 */
export function normalizeShopCanonicalSubPath(subPath = "") {
  const raw = String(subPath || "").trim();
  if (!raw || raw === "/") return "";
  return raw.replace(/^\/+/, "").replace(/\/+$/, "");
}
