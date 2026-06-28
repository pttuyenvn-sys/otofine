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
import { buildShopStorefrontUrl } from "@/lib/shopsite/buildShopStorefrontUrl";

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
    return { brands: [], modelsByBrand: {}, years: [], vehicleYearRanges: [] };
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
 * Phase 7.1 — public shop directory + facets + related shops.
 *
 * All four helpers are SSR-friendly: each request is wrapped with
 * Next's `revalidate` so a single backend can serve the per-IP rate
 * limited directory listing efficiently across N tab refreshes.
 *
 * The `*Safe` variants degrade to empty payloads so a slow / down
 * backend can never break a directory page render — the empty state
 * already handles "no shops found".
 */
export async function fetchPublicShopDirectory(params = {}) {
  return publicFetch(`/public/shops`, params);
}

export async function fetchPublicShopDirectorySafe(params = {}) {
  try {
    return await fetchPublicShopDirectory(params);
  } catch (err) {
    console.warn("[shopPublic.service] directory fallback", { err: err?.message });
    return {
      items: [],
      total: 0,
      page: Number(params?.page) || 1,
      perPage: Number(params?.perPage) || 12,
      sort: "rank",
      rankMax: 100,
      filters: {},
    };
  }
}

export async function fetchPublicShopProvinces() {
  return publicFetch(`/public/shops/_facets/provinces`);
}

export async function fetchPublicShopProvincesSafe() {
  try {
    return await fetchPublicShopProvinces();
  } catch (err) {
    console.warn("[shopPublic.service] provinces fallback", { err: err?.message });
    return { items: [] };
  }
}

export async function fetchPublicShopBrands() {
  return publicFetch(`/public/shops/_facets/brands`);
}

export async function fetchPublicShopBrandsSafe() {
  try {
    return await fetchPublicShopBrands();
  } catch (err) {
    console.warn("[shopPublic.service] brands fallback", { err: err?.message });
    return { items: [] };
  }
}

export async function fetchRelatedShops(slug, limit = 6) {
  if (!slug) return null;
  return publicFetch(
    `/public/shops/${encodeURIComponent(slug)}/related`,
    { limit },
  );
}

export async function fetchRelatedShopsSafe(slug, limit = 6) {
  try {
    return await fetchRelatedShops(slug, limit);
  } catch (err) {
    console.warn("[shopPublic.service] related fallback", { slug, err: err?.message });
    return { seedSlug: slug, items: [] };
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
 * True when the active request arrived on a shop subdomain for `slug`.
 * Server-only — calls `next/headers`.
 */
export async function isShopSubdomainRequest(slug) {
  const hostHeader = (await headers()).get("host") || "";
  return isShopSubdomainHost(hostHeader, slug);
}

/**
 * Canonical URL + robots mirror flag for a shop subpage.
 *
 * `subPath` is the path BELOW the slug, e.g. "" / "san-pham" / "gioi-thieu" / "lien-he".
 */
export async function getShopSeoContext(slug, subPath = "") {
  const h = await headers();
  const hostHeader = h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || "https";
  const onSubdomain = isShopSubdomainHost(hostHeader, slug);
  const cleanedSubPath = String(subPath || "")
    .replace(/^\//, "")
    .replace(/\/$/, "");

  let canonical;
  if (onSubdomain) {
    const sub = cleanedSubPath ? `/${cleanedSubPath}` : "";
    const cleanedHostHeader = hostHeader.replace(/:\d+$/, "");
    canonical = `${proto}://${cleanedHostHeader}${sub || "/"}`;
  } else {
    const storefrontUrl = buildShopStorefrontUrl(slug, { subPath: cleanedSubPath });
    const sub = cleanedSubPath ? `/${cleanedSubPath}` : "";
    canonical =
      storefrontUrl || `https://otofine.com/shops/${slug}${sub}`;
  }

  return {
    canonical,
    apexDiscoveryMirror: !onSubdomain,
  };
}

/**
 * Compute the canonical URL for a shop subpage.
 *
 * Rules (ARCH-06.2B):
 *   - Subdomain request → self canonical on `{slug}.otofine.com`.
 *   - Apex `/shops/<slug>` mirror → canonical on subdomain via
 *     `buildShopStorefrontUrl()` (single storefront owner).
 *
 * `subPath` is the path BELOW the slug, e.g. "" / "san-pham" / "gioi-thieu" / "lien-he".
 */
export async function getShopCanonicalUrl(slug, subPath = "") {
  const { canonical } = await getShopSeoContext(slug, subPath);
  return canonical;
}
