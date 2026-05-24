/**
 * Public shop site — server-side fetch helpers.
 *
 * Used exclusively by `app/(shopsite)/shops/[slug]/**` server
 * components. Browser code does NOT import this file; tabs and
 * filter widgets that need data run server-side at this layer.
 *
 * Endpoint contract: see backend/routes/publicShop.routes.js.
 */
import { API_BASE } from "@/lib/config";

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

/** Helper used by metadata generators. Same as fetchPublicShop but quiet on errors. */
export async function fetchPublicShopSafe(slug) {
  try {
    return await fetchPublicShop(slug);
  } catch {
    return null;
  }
}
