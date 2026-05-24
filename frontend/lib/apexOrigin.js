/**
 * Apex marketing origin for outbound product / canonical links from the
 * shop subdomain pages.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_APEX_URL  — explicit override (set per env)
 *   2. NEXT_PUBLIC_SITE_URL  — generic Next.js convention if set
 *   3. https://otofine.com   — production default
 *
 * Why this exists:
 *   When a visitor is on `cuahangoto355.otofine.com`, a relative
 *   `/product/123` link would resolve to `cuahangoto355.otofine.com/product/123`,
 *   which (1) currently rewrites through the shop layout (per Phase 3
 *   middleware) and (2) would create a duplicate canonical surface for
 *   crawlers when we eventually enable indexing. Product pages live ONLY
 *   on the apex domain. This util keeps that contract centralized.
 */
const FALLBACK = "https://otofine.com";

function clean(raw) {
  if (!raw) return "";
  const trimmed = String(raw).trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(trimmed)) return "";
  return trimmed;
}

export const APEX_ORIGIN =
  clean(process.env.NEXT_PUBLIC_APEX_URL) ||
  clean(process.env.NEXT_PUBLIC_SITE_URL) ||
  FALLBACK;

export function apexUrl(pathOrUrl) {
  if (!pathOrUrl) return APEX_ORIGIN;
  const s = String(pathOrUrl);
  if (/^https?:\/\//i.test(s)) return s;
  return APEX_ORIGIN + (s.startsWith("/") ? s : "/" + s);
}

export function apexProductUrl(productId) {
  if (productId == null || productId === "") return APEX_ORIGIN + "/";
  return `${APEX_ORIGIN}/product/${productId}`;
}
