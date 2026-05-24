/**
 * Public shop site — server-side fetch helpers.
 *
 * Used exclusively by `app/(shopsite)/shops/[slug]/**` server
 * components. Browser code does NOT import this file; tabs and
 * filter widgets that need data run server-side at this layer.
 *
 * Endpoint contract: see backend/routes/publicShop.routes.js.
 */
import { headers } from "next/headers";
import { API_BASE } from "@/lib/config";
import { isShopSubdomainHost } from "@/lib/shopHost";

const REVALIDATE_SECONDS = 60;

function buildUrl(path, params) {
  const u = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v == null || v === "") continue;
      u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

async function publicFetch(path, params) {
  const url = buildUrl(path, params);
  const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error("[shopPublic.service] fetch failed", { url, status: res.status });
    throw new Error(`shopPublic fetch ${res.status}`);
  }
  return res.json();
}

export async function fetchPublicShop(slug) {
  if (!slug) return null;
  return publicFetch(`/public/shops/${encodeURIComponent(slug)}`);
}

export async function fetchPublicShopProducts(slug, query = {}) {
  if (!slug) return null;
  return publicFetch(`/public/shops/${encodeURIComponent(slug)}/products`, query);
}

export async function fetchPublicShopCategories(slug) {
  if (!slug) return null;
  return publicFetch(`/public/shops/${encodeURIComponent(slug)}/categories`);
}

export async function fetchPublicShopContact(slug) {
  if (!slug) return null;
  return publicFetch(`/public/shops/${encodeURIComponent(slug)}/contact`);
}

/**
 * Fitment dropdown options (brands, models per brand, year list)
 * scoped to a single shop's product catalogue. Backend cache TTL =
 * 5 min (same as categories) — change rarely, large savings.
 */
export async function fetchPublicShopFitments(slug) {
  if (!slug) return null;
  return publicFetch(`/public/shops/${encodeURIComponent(slug)}/fitments`);
}

/** Helper used by metadata generators. Same as fetchPublicShop but quiet on errors. */
export async function fetchPublicShopSafe(slug) {
  try {
    return await fetchPublicShop(slug);
  } catch {
    return null;
  }
}

/**
 * Phase 5.7 — graceful-degradation wrappers.
 *
 * The page handlers Promise.all over `shop`, `products`, `categories`,
 * `fitments`. Before hardening, a single failed fetch in that array
 * (transient 500, rate-limit 429, transient network blip) would throw
 * out of the `await` and surface a full Next.js error boundary.
 *
 * For non-essential pieces (categories, fitments) we'd much rather
 * degrade to "no filters available" than break the whole page. These
 * `*Safe` helpers swallow the error, log a warning to the SSR
 * console (PM2 logs), and return a sentinel that the page can render
 * around.
 *
 * For the shop fetch itself we intentionally do NOT add a safe
 * variant — if the shop doesn't load, the page must `notFound()`.
 */
export async function fetchPublicShopProductsSafe(slug, query = {}) {
  try {
    return await fetchPublicShopProducts(slug, query);
  } catch (err) {
    console.warn("[shopPublic.service] products fallback", { slug, err: err?.message });
    return { items: [], total: 0, page: query?.page || 1, perPage: query?.perPage || 20 };
  }
}

export async function fetchPublicShopCategoriesSafe(slug) {
  try {
    return await fetchPublicShopCategories(slug);
  } catch (err) {
    console.warn("[shopPublic.service] categories fallback", { slug, err: err?.message });
    return { items: [] };
  }
}

export async function fetchPublicShopFitmentsSafe(slug) {
  try {
    return await fetchPublicShopFitments(slug);
  } catch (err) {
    console.warn("[shopPublic.service] fitments fallback", { slug, err: err?.message });
    return { brands: [], modelsByBrand: {}, years: [] };
  }
}

export async function fetchPublicShopContactSafe(slug) {
  try {
    return await fetchPublicShopContact(slug);
  } catch (err) {
    console.warn("[shopPublic.service] contact fallback", { slug, err: err?.message });
    return null;
  }
}

/**
 * Compute the basePath for in-shop links given the current request host.
 *
 * - On `cuahangoto355.otofine.com` (and local *.localhost variants):
 *     returns ""  → tabs/sidebar emit "/", "/san-pham", … so the
 *     browser URL stays sticky on the subdomain after a click.
 * - On apex `https://otofine.com/shops/<slug>`:
 *     returns "/shops/<slug>" → links stay routable on apex.
 *
 * Server-only — calls `next/headers`. Do NOT import from client code.
 */
export async function getShopBasePath(slug) {
  const hostHeader = (await headers()).get("host") || "";
  return isShopSubdomainHost(hostHeader, slug) ? "" : `/shops/${slug}`;
}

/**
 * Compute the self-canonical URL for a shop subpage.
 *
 * Rules (Phase 4 SEO contract):
 *   - On a real shop subdomain (`cuahangoto355.otofine.com`) the
 *     canonical points to the subdomain version of the page.
 *     `cuahangoto355.otofine.com/san-pham`.
 *   - When the page is reached via apex `/shops/<slug>/<sub>` the
 *     canonical points back to the apex URL — we treat that as the
 *     authoritative version for cross-linked discovery.
 *   - We still keep robots = noindex,nofollow until Phase 5 flips it
 *     on. The canonical is harmless under noindex but ensures we have
 *     ZERO duplicate canonical surface ready for go-live.
 *
 * `subPath` is the path BELOW the slug, e.g. "" / "san-pham" / "gioi-thieu" / "lien-he".
 */
export async function getShopCanonicalUrl(slug, subPath = "") {
  const h = await headers();
  const hostHeader = h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || "https";
  const onSubdomain = isShopSubdomainHost(hostHeader, slug);
  const cleanedHostHeader = hostHeader.replace(/:\d+$/, "");
  const sub = subPath ? `/${subPath.replace(/^\//, "").replace(/\/$/, "")}` : "";
  if (onSubdomain) {
    return `${proto}://${cleanedHostHeader}${sub || "/"}`;
  }
  return `https://otofine.com/shops/${slug}${sub}`;
}
