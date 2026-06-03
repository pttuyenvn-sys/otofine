import { permanentRedirect, headers } from "next/navigation";
import { fetchPublicShop, getShopCanonicalUrl } from "@/services/shopPublic.service";

const SHOP_SUBPATHS = new Set(["", "san-pham", "gioi-thieu", "lien-he"]);

function shopSubPathFromPathname(pathname, slug) {
  const normalized = String(slug || "").trim();
  if (!normalized) return "";
  const prefix = `/shops/${normalized}`;
  if (!pathname || !pathname.startsWith(prefix)) return "";
  const rest = pathname.slice(prefix.length).replace(/^\//, "");
  const segment = rest.split("/")[0] || "";
  return SHOP_SUBPATHS.has(segment) ? segment : "";
}

function subdomainSubPath(pathname) {
  const segment = String(pathname || "/").replace(/^\//, "").split("/")[0] || "";
  return SHOP_SUBPATHS.has(segment) ? segment : "";
}

/**
 * Fetch a public shop and 308-redirect when the URL slug was renamed.
 * Preserves the storefront sub-path when available.
 */
export async function ensureCanonicalShopSlug(slug, subPathOverride) {
  const shop = await fetchPublicShop(slug);
  if (!shop) return null;
  if (shop.redirectSlug && shop.redirectSlug !== slug) {
    const h = await headers();
    const pathname = h.get("x-otofine-pathname") || "";
    const onSubdomain = h.get("x-otofine-shop-slug") === slug;
    let subPath = subPathOverride;
    if (subPath === undefined) {
      subPath = onSubdomain
        ? subdomainSubPath(pathname)
        : shopSubPathFromPathname(pathname, slug);
    }
    permanentRedirect(await getShopCanonicalUrl(shop.redirectSlug, subPath));
  }
  return shop;
}

/**
 * Canonical slug for metadata when a rename redirect is pending.
 */
export function canonicalShopSlug(shop, requestedSlug) {
  if (!shop) return requestedSlug;
  return shop.redirectSlug || shop.slug || requestedSlug;
}
