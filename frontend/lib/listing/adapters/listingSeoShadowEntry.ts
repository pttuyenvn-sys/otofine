/**
 * Guarded SEO shadow entry — compares legacy SSR listing SEO vs ListingSeoIdentity.
 *
 * Returns structured diff when LISTING_IDENTITY_SHADOW=true; otherwise null.
 * No console output. No runtime side effects (ARCH-MP-03B.2).
 */

import { compareListingSeoShadow, type SeoShadowComparisonResult } from "./identityShadowCompare";
import { isListingIdentityShadowEnabled } from "./listingShadowConfig";
import { buildLegacyListingSeoFromEntity } from "./legacyListingSeoFromEntity";
import {
  seoIdentityFromMarketplaceEntity,
  type SeoIdentityFromEntityOptions,
} from "./seoIdentityFromMarketplaceEntity";
import type { MarketplaceEntity } from "./identityFromMarketplaceEntity";

export type ListingSeoShadowContext = {
  entity: MarketplaceEntity;
  options?: SeoIdentityFromEntityOptions;
};

/**
 * Compare legacy entity SEO vs ListingIdentity SEO identity pipeline.
 * @returns diff when flag enabled; null when disabled.
 */
export function runListingSeoShadow(
  context: ListingSeoShadowContext,
): SeoShadowComparisonResult | null {
  if (!isListingIdentityShadowEnabled()) {
    return null;
  }

  const legacy = buildLegacyListingSeoFromEntity(context.entity, {
    siteName: context.options?.siteName,
  });
  const next = seoIdentityFromMarketplaceEntity(context.entity, context.options);

  if (!legacy || !next) {
    return null;
  }

  return compareListingSeoShadow(legacy, next);
}

export { isListingIdentityShadowEnabled, LISTING_IDENTITY_SHADOW_ENV } from "./listingShadowConfig";
