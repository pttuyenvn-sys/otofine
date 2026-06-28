import type { ListingIdentity, ListingSeoIdentity } from "./ListingIdentity.types";
import { buildListingDisplayLabel } from "./buildListingDisplayLabel";
import { buildListingPath } from "./buildListingSlug";

const DEFAULT_SITE_NAME = "Otofine";

export type BuildListingSeoIdentityOptions = {
  siteName?: string;
};

/**
 * Canonical SEO identity derived from ListingIdentity only (ARCH-MP-03B.2).
 *
 * Pipeline:
 *   ListingIdentity → DisplayLabel → h1 / title / description / canonicalPath
 */
export function buildListingSeoIdentity(
  identity: ListingIdentity,
  options: BuildListingSeoIdentityOptions = {},
): ListingSeoIdentity {
  const siteName = options.siteName || DEFAULT_SITE_NAME;
  const displayLabel = buildListingDisplayLabel(identity);
  const h1 = displayLabel;
  const canonicalPath = buildListingPath(identity);
  const title = `${h1} | ${siteName}`;
  const description = h1;

  return {
    displayLabel,
    h1,
    title,
    description,
    canonicalPath,
  };
}
