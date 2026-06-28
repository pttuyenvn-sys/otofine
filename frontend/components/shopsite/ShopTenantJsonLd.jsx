import ShopJsonLd from "@/components/shopsite/ShopJsonLd";
import { buildShopJsonLd } from "@/lib/shopsite/buildShopJsonLd";
import { normalizeShopCanonicalSubPath } from "@/lib/shopsite/normalizeShopCanonicalSubPath";
import {
  fetchPublicShop,
  getShopSeoContext,
} from "@/services/shopPublic.service";

/**
 * Page-scoped storefront JSON-LD — `url` / `@id` follow the same
 * canonical source as `generateMetadata` (`getShopSeoContext`).
 */
export default async function ShopTenantJsonLd({ slug, subPath = "", shop: shopProp }) {
  const shop = shopProp || (await fetchPublicShop(slug));
  if (!shop) return null;

  const cleanedSubPath = normalizeShopCanonicalSubPath(subPath);
  const { canonical } = await getShopSeoContext(slug, cleanedSubPath);
  const payload = buildShopJsonLd({ shop, canonicalUrl: canonical });

  return <ShopJsonLd payload={payload} />;
}
