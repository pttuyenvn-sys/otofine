/**
 * ARCH-07.1 — Resolve a shop SEO entity with governance + presentation fields.
 */

import { buildShopSeoH1 } from "./buildShopSeoH1.js";
import { SHOP_NAMESPACE, SHOP_STATIC_ROUTES } from "./namespace.js";
import { parseShopSeoPath } from "./parseShopSeoPath.js";
import {
  getShopSeoThreshold,
  isShopSeoIndexable,
  isShopSeoSitemapEligible,
} from "./shopSeoGovernance.js";

/**
 * @typedef {import('./parseShopSeoPath.js').ShopSeoEntity} ShopSeoEntity
 */

/**
 * @param {object} input
 * @param {string} input.shopSlug
 * @param {string} [input.subPath]
 * @param {Array<{ slug?: string, name?: string, productCount?: number }>} [input.categories]
 * @param {object} [input.fitments]
 * @param {Record<string, number>} [input.productCountsByPath] keyed by path
 * @param {Record<string, number>} [input.productCountsByNamespace] keyed by namespace+filter hash
 * @returns {{ entity: ShopSeoEntity | null, h1: string, indexable: boolean, sitemapEligible: boolean, threshold: { productCountMin: number } }}
 */
export function resolveShopSeoEntity(input = {}) {
  const subPath = String(input.subPath || "/");
  const entity = parseShopSeoPath(subPath, {
    categories: input.categories,
    fitments: input.fitments,
  });

  if (!entity) {
    return {
      entity: null,
      h1: "",
      indexable: false,
      sitemapEligible: false,
      threshold: { productCountMin: Infinity },
    };
  }

  const productCount = resolveProductCount(entity, input);
  const namespace = normalizeNamespace(entity);
  const threshold = getShopSeoThreshold(namespace);
  const indexable = isStaticAlwaysOn(namespace) || isShopSeoIndexable(namespace, { productCount });
  const sitemapEligible =
    isStaticSitemapKind(namespace) || isShopSeoSitemapEligible(namespace, { productCount });

  return {
    entity: { ...entity, productCount },
    h1: buildShopSeoH1({ ...entity, productCount }),
    indexable,
    sitemapEligible,
    threshold,
  };
}

/**
 * @param {ShopSeoEntity} entity
 * @param {object} input
 * @returns {number}
 */
function resolveProductCount(entity, input) {
  if (entity.productCount != null) {
    return Number(entity.productCount) || 0;
  }
  const byPath = input.productCountsByPath || {};
  if (byPath[entity.path] != null) {
    return Number(byPath[entity.path]) || 0;
  }
  return null;
}

/**
 * @param {ShopSeoEntity} entity
 * @returns {string}
 */
function normalizeNamespace(entity) {
  if (entity.namespace === "ABOUT" || entity.namespace === "CONTACT") {
    return entity.namespace;
  }
  return entity.namespace;
}

/**
 * @param {string} namespace
 * @returns {boolean}
 */
function isStaticAlwaysOn(namespace) {
  return (
    namespace === SHOP_NAMESPACE.SHOP_HOME ||
    namespace === SHOP_NAMESPACE.SHOP_COLLECTION ||
    namespace === "ABOUT" ||
    namespace === "CONTACT"
  );
}

/**
 * @param {string} namespace
 * @returns {boolean}
 */
function isStaticSitemapKind(namespace) {
  return isStaticAlwaysOn(namespace);
}

export { SHOP_STATIC_ROUTES, SHOP_NAMESPACE };
