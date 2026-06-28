import type { ListingIdentity, ListingSeo } from "./ListingIdentity.types";
import { buildListingSeoIdentity } from "./buildListingSeoIdentity";

export type BuildListingSeoOptions = {
  siteName?: string;
};

/**
 * SEO bundle derived from ListingIdentity via buildListingSeoIdentity.
 */
export function buildListingSeo(
  identity: ListingIdentity,
  options: BuildListingSeoOptions = {},
): ListingSeo {
  return buildListingSeoIdentity(identity, options);
}
