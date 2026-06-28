import { slugifyVi } from "../seo/slugify";
import type { ListingIdentity } from "./ListingIdentity.types";
import {
  buildListingDisplayLabel,
  isListingHomeIdentity,
} from "./buildListingDisplayLabel";

/**
 * URL slug segment derived from DisplayLabel.
 * Example: "Cản trước Kia Sedona 2014-2020" → "can-truoc-kia-sedona-2014-2020"
 */
export function buildListingSlug(identity: ListingIdentity): string {
  if (isListingHomeIdentity(identity)) return "";
  const label = buildListingDisplayLabel(identity);
  return slugifyVi(label);
}

/**
 * Marketplace listing pathname (no query string).
 */
export function buildListingPath(identity: ListingIdentity): string {
  const slug = buildListingSlug(identity);
  return slug ? `/${slug}` : "/";
}
