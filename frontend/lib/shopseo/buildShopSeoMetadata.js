/**
 * ARCH-07.1 — Metadata builder for shop SEO pages.
 * Robots combine storefront tier (shopIndexGovernance) + landing governance.
 */

import { getShopIndexTier } from "../shopsite/shopIndexGovernance.js";
import { buildShopSeoH1 } from "./buildShopSeoH1.js";
import { SHOP_NAMESPACE } from "./namespace.js";
import { isShopSeoIndexable } from "./shopSeoGovernance.js";

/**
 * @param {object} input
 * @param {Record<string, unknown> | null | undefined} input.shop
 * @param {{ namespace: string, filters?: Record<string, unknown>, productCount?: number }} input.entity
 * @param {string} input.canonical
 * @param {boolean} [input.apexDiscoveryMirror]
 * @param {string} [input.shopName]
 * @returns {import('next').Metadata}
 */
export function buildShopSeoPageMetadata({
  shop,
  entity,
  canonical,
  apexDiscoveryMirror = false,
  shopName,
}) {
  if (!entity) {
    return {
      title: "Không tìm thấy — Otofine Shop",
      robots: { index: false, follow: false },
    };
  }

  const name = shopName || String(shop?.name || "Otofine Shop").trim();
  const h1 = buildShopSeoH1(entity);
  const title = composeTitle(name, entity, h1);
  const description = composeDescription(name, entity, h1);

  const robots = composeRobots({
    shop,
    entity,
    apexDiscoveryMirror,
  });

  return {
    title,
    description,
    alternates: { canonical },
    robots,
    openGraph: {
      type: "website",
      siteName: name,
      title,
      description,
      url: canonical,
      locale: "vi_VN",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
  };
}

/**
 * @param {object} input
 * @returns {{ index: boolean, follow: boolean }}
 */
function composeRobots({ shop, entity, apexDiscoveryMirror }) {
  if (apexDiscoveryMirror) {
    return { index: false, follow: true };
  }

  const shopTier = getShopIndexTier(shop);
  if (shopTier.tier === "BLOCK") {
    return { index: false, follow: false };
  }

  const landingIndexable =
    isStaticNamespace(entity.namespace) ||
    isShopSeoIndexable(entity.namespace, { productCount: entity.productCount });

  if (landingIndexable && shopTier.tier === "INDEX") {
    return { index: true, follow: true };
  }

  if (shopTier.tier === "INDEX" || shopTier.tier === "CRAWL") {
    return { index: false, follow: true };
  }

  return { index: false, follow: false };
}

/**
 * @param {string} namespace
 * @returns {boolean}
 */
function isStaticNamespace(namespace) {
  return (
    namespace === SHOP_NAMESPACE.SHOP_HOME ||
    namespace === SHOP_NAMESPACE.SHOP_COLLECTION ||
    namespace === "ABOUT" ||
    namespace === "CONTACT"
  );
}

/**
 * @param {string} shopName
 * @param {{ namespace: string }} entity
 * @param {string} h1
 * @returns {string}
 */
function composeTitle(shopName, entity, h1) {
  if (entity.namespace === SHOP_NAMESPACE.SHOP_HOME) {
    return `${shopName} | Otofine`;
  }
  if (h1) {
    return `${h1} | ${shopName}`;
  }
  return `${shopName} | Otofine`;
}

/**
 * @param {string} shopName
 * @param {{ namespace: string, filters?: Record<string, unknown> }} entity
 * @param {string} h1
 * @returns {string}
 */
function composeDescription(shopName, entity, h1) {
  if (entity.namespace === SHOP_NAMESPACE.SHOP_COLLECTION) {
    return `Xem toàn bộ danh mục phụ tùng ô tô tại ${shopName}.`;
  }
  if (h1) {
    return `${h1} — mua phụ tùng chính hãng tại ${shopName}.`;
  }
  return `Phụ tùng ô tô chính hãng tại ${shopName}.`;
}
