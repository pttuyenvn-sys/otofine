/**
 * ARCH-06.2E — Shop subdomain index governance.
 *
 * Single source of truth for storefront robots tiers. Pure function —
 * no headers(), no DB, no env flags.
 *
 * Tiers:
 *   INDEX — qualified storefronts → index,follow
 *   CRAWL — public with inventory, below index bar → noindex,follow
 *   BLOCK — everything else → noindex,nofollow
 */

/** @typedef {"INDEX" | "CRAWL" | "BLOCK"} ShopIndexTier */

const TIER_ROBOTS = Object.freeze({
  INDEX: Object.freeze({ index: true, follow: true }),
  CRAWL: Object.freeze({ index: false, follow: true }),
  BLOCK: Object.freeze({ index: false, follow: false }),
});

function nonEmpty(value) {
  if (value == null) return false;
  return String(value).trim().length > 0;
}

function productCount(shop) {
  return Math.max(0, Number(shop?.productCount) || 0);
}

function isPublicShop(shop) {
  if (!shop) return false;
  const status = shop.publicStatus ?? shop.public_status;
  // Public API only serves published shops; absent status implies public.
  if (status == null || status === "") return true;
  return String(status).toLowerCase() === "public";
}

function hasLogoOrCover(shop) {
  return (
    nonEmpty(shop?.avatar) ||
    nonEmpty(shop?.cover) ||
    nonEmpty(shop?.cover_image)
  );
}

function hasDescription(shop) {
  return (
    nonEmpty(shop?.introHtml) ||
    nonEmpty(shop?.descriptionHtml) ||
    nonEmpty(shop?.intro_html) ||
    nonEmpty(shop?.shortDescription) ||
    nonEmpty(shop?.bio)
  );
}

function hasPhone(shop) {
  return nonEmpty(shop?.phone);
}

function hasProvince(shop) {
  if (shop?.provinceId != null && String(shop.provinceId).trim() !== "") {
    return true;
  }
  return nonEmpty(shop?.province);
}

function meetsIndexRequirements(shop) {
  return (
    isPublicShop(shop) &&
    productCount(shop) >= 20 &&
    hasLogoOrCover(shop) &&
    hasDescription(shop) &&
    hasPhone(shop) &&
    hasProvince(shop)
  );
}

function meetsCrawlRequirements(shop) {
  return isPublicShop(shop) && productCount(shop) >= 5;
}

/**
 * @param {Record<string, unknown> | null | undefined} shop
 * @returns {{ tier: ShopIndexTier, robots: { index: boolean, follow: boolean } }}
 */
export function getShopIndexTier(shop) {
  if (!shop) {
    return { tier: "BLOCK", robots: TIER_ROBOTS.BLOCK };
  }
  if (meetsIndexRequirements(shop)) {
    return { tier: "INDEX", robots: TIER_ROBOTS.INDEX };
  }
  if (meetsCrawlRequirements(shop)) {
    return { tier: "CRAWL", robots: TIER_ROBOTS.CRAWL };
  }
  return { tier: "BLOCK", robots: TIER_ROBOTS.BLOCK };
}
