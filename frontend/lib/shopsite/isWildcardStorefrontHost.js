/**
 * Branded-storefront host detection — server-only.
 *
 * Returns `true` iff the current request is being served from a
 * wildcard shop subdomain (e.g. `phutungoto355.otofine.com`),
 * meaning we're rendering the seller's "branded website" surface
 * and should treat marketplace-cross-discovery widgets as off-brand.
 *
 * Returns `false` for:
 *   - apex marketplace pages   `otofine.com/shops/<slug>/...`
 *   - reserved subdomains      `www.`, `api.`, `admin.`, …
 *   - localhost / IP / preview deploys
 *
 * Why a helper:
 *   Several components (RelatedShops, ShopRecommendations, any future
 *   "you may also like" widgets) need the same decision. Centralising
 *   it keeps the rule one-grep away and avoids host-string compares
 *   sprinkled across the component tree.
 *
 * Server-only contract:
 *   Reads from `next/headers`, so importing from a Client Component
 *   will throw at runtime. Server Components (RSC layer) only.
 */

import { headers } from "next/headers";
import { extractShopSubdomain } from "@/lib/shopHost";

/**
 * @returns {Promise<boolean>}
 */
export async function isWildcardStorefrontHost() {
  const hostHeader = (await headers()).get("host") || "";
  if (!hostHeader) return false;
  // `extractShopSubdomain` already encapsulates the reserved-subdomain
  // list + the apex/IP/localhost rejections (see lib/shopHost.js). It
  // returns the slug on a real shop subdomain, null otherwise.
  const sub = extractShopSubdomain(hostHeader);
  return typeof sub === "string" && sub.length > 0;
}
