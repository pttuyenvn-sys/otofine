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
 *   `/phu-tung/...` link would resolve to
 *   `cuahangoto355.otofine.com/phu-tung/...`, which (1) currently
 *   rewrites through the shop layout (per Phase 3 middleware) and
 *   (2) would create a duplicate canonical surface for crawlers when
 *   we eventually enable indexing. Product pages live ONLY on the
 *   apex domain. This util keeps that contract centralized.
 */
import { buildProductSeoUrl } from "@/lib/seo/productSeoUrl";

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

/**
 * Apex absolute URL to a product detail page.
 *
 * Accepts either a bare numeric id (legacy callers) OR a full product
 * shape with descriptive fields (`name` / `brand` / `model` / `cars`
 * / `partNumber`). When a full shape is provided we emit the canonical
 * SEO URL directly — saves the visitor one redirect hop when they
 * cross from a shop subdomain back to apex. When only the id is
 * available we emit the minimal `/phu-tung/<id>` form and rely on the
 * canonical-enforcement route to repair the slug.
 */
export function apexProductUrl(productOrId) {
  if (productOrId == null || productOrId === "") return APEX_ORIGIN + "/";
  if (typeof productOrId === "object") {
    const path = buildProductSeoUrl(productOrId);
    return path === "/" ? APEX_ORIGIN + "/" : `${APEX_ORIGIN}${path}`;
  }
  return `${APEX_ORIGIN}/phu-tung/${productOrId}`;
}
