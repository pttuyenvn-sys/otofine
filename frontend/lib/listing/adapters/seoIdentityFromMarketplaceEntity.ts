/**
 * SSR adapter: marketplace entity → ListingIdentity → SEO identity.
 * Shadow-capable only — no runtime replacement (ARCH-MP-03B.2).
 */

import { normalizeListingIdentity } from "../normalizeListingIdentity";
import { buildListingSeoIdentity } from "../buildListingSeoIdentity";
import type { ListingSeoIdentity } from "../ListingIdentity.types";
import {
  identityFromMarketplaceEntity,
  type MarketplaceEntity,
  type MarketplaceEntityIngressOptions,
} from "./identityFromMarketplaceEntity";

export type SeoIdentityFromEntityOptions = MarketplaceEntityIngressOptions & {
  siteName?: string;
};

/**
 * ListingSelection → ListingIdentity → SeoIdentity pipeline for SSR shadow.
 */
export function seoIdentityFromMarketplaceEntity(
  entity: MarketplaceEntity | null | undefined,
  options: SeoIdentityFromEntityOptions = {},
): ListingSeoIdentity | null {
  if (!entity || entity.kind === "product" || entity.kind === "unknown") {
    return null;
  }

  const selection = identityFromMarketplaceEntity(entity, options);
  const identity = normalizeListingIdentity(selection);
  return buildListingSeoIdentity(identity, { siteName: options.siteName });
}
