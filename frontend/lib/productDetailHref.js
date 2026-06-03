import {
  buildProductSeoUrl,
  devWarnMissingMarketplaceContext,
  isMarketplaceListingNavigation,
} from "@/lib/seo/productSeoUrl";
import {
  isEmptyMarketplaceContext,
  resolveMarketplaceContextForHref,
} from "@/lib/marketplace/marketplaceContext";

/**
 * Public product detail href (root-level canonical SEO format).
 *
 * Marketplace context still shapes slug fitment (listing vehicle) but is
 * not serialized into product URLs. Navigation continuity is preserved via
 * sessionStorage (`saveBeforeProductNavigate`) and listing restore — not
 * `vb`/`vm`/`vy`/`cat` query params on new links.
 *
 * On marketplace listing/search surfaces, missing explicit context is
 * recovered from session + URL before slug generation so hrefs never
 * fall back to `cars[]` fitment heuristics.
 *
 * @param {{ id?: string | number; productId?: string | number } & Record<string, unknown>} item
 * @param {{
 *   marketplaceContext?: import("@/lib/marketplace/marketplaceContext").MarketplaceContext,
 *   listingVehicle?: { brand?: string, model?: string, year?: string | number },
 * }} [options]
 * @returns {string}
 */
export function getProductDetailHref(item, options = {}) {
  if (!item) return "/";

  const allowRecovery = isMarketplaceListingNavigation();
  const marketplaceContext = resolveMarketplaceContextForHref(options, {
    allowRecovery,
  });

  devWarnMissingMarketplaceContext(item, {
    ...options,
    marketplaceContext: isEmptyMarketplaceContext(marketplaceContext)
      ? undefined
      : marketplaceContext,
  });

  const listingVehicle = isEmptyMarketplaceContext(marketplaceContext)
    ? undefined
    : {
        brand: marketplaceContext.brand,
        model: marketplaceContext.model,
        year: marketplaceContext.year,
      };

  return buildProductSeoUrl(item, {
    listingVehicle,
    marketplaceContext,
  });
}
