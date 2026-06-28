/**
 * Canonical product URL owner (backend).
 *
 * Single source of truth is delegated to buildProductIdentity:
 * - products.partName
 * - products.partNumber
 * - product_car_applications.is_primary (or equivalent resolved fitment input)
 */
import {
  buildProductIdentity,
  pickPrimaryFitment,
} from "../../../../frontend/lib/identity/buildProductIdentity.js";

function resolvePrimaryFitmentFromInput(input, carsOverride) {
  if (Array.isArray(carsOverride)) {
    const row = pickPrimaryFitment(carsOverride);
    if (row) return row;
  }

  if (Array.isArray(input?.cars)) {
    const row = pickPrimaryFitment(input.cars);
    if (row) return row;
  }

  const brand = input?.hang_xe ?? input?.brand ?? "";
  const model = input?.ten_xe ?? input?.model ?? "";
  const yearFrom = input?.year_from ?? input?.yearFrom ?? null;
  const yearTo = input?.year_to ?? input?.yearTo ?? null;

  if (brand || model || yearFrom != null || yearTo != null) {
    return {
      hang_xe: brand,
      ten_xe: model,
      year_from: yearFrom,
      year_to: yearTo,
    };
  }

  return null;
}

/**
 * @param {Record<string, unknown>} input
 * @returns {string} slug prefix without trailing -id
 */
export function buildProductSeoSlug(input) {
  if (!input || typeof input !== "object") return "";
  const id = input.id ?? input.productId ?? input.product_id ?? null;
  if (id == null || id === "") return "";
  const identity = buildProductIdentity(
    input,
    resolvePrimaryFitmentFromInput(input),
  );
  const path = String(identity.canonicalPath || "");
  const suffix = `-${id}`;
  if (path.startsWith("/p/")) return "";
  if (path.startsWith("/") && path.endsWith(suffix)) {
    return path.slice(1, -suffix.length);
  }
  return path.startsWith("/") ? path.slice(1) : path;
}

/**
 * @param {Record<string, unknown>} product
 * @returns {string} e.g. "/loc-xang-toyota-vios-2013-2330021010-2913" or "/p/2913"
 */
export function getCanonicalProductPath(product) {
  if (!product || typeof product !== "object") return "/";
  const identity = buildProductIdentity(
    product,
    resolvePrimaryFitmentFromInput(product),
  );
  return identity.canonicalPath || "/";
}

export function getSiteOrigin() {
  const raw =
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://otofine.com";
  return String(raw).trim().replace(/\/+$/, "");
}

/**
 * @param {Record<string, unknown>} product
 * @returns {string} absolute canonical URL
 */
export function getCanonicalProductUrl(product) {
  const identity = buildProductIdentity(
    product,
    resolvePrimaryFitmentFromInput(product),
    { siteOrigin: getSiteOrigin() },
  );
  return identity.canonicalUrl || `${getSiteOrigin()}/`;
}

/**
 * @param {Record<string, unknown>} product
 * @param {unknown[] | null | undefined} [cars]
 * @returns {{ canonicalPath: string, canonicalUrl: string }}
 */
export function buildCanonicalFields(product, cars) {
  const input = cars !== undefined ? { ...product, cars } : product;
  const primaryFitment = resolvePrimaryFitmentFromInput(input, cars);
  const identity = buildProductIdentity(
    input,
    primaryFitment,
    { siteOrigin: getSiteOrigin() },
  );
  return {
    canonicalPath: identity.canonicalPath,
    canonicalUrl: identity.canonicalUrl,
  };
}

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {number[]} productIds
 * @returns {Promise<Map<number, { hang_xe: string, ten_xe: string, year_from: unknown, year_to: unknown }[]>>}
 */
export async function loadPrimaryFitmentCarsByProductIds(executor, productIds) {
  const ids = [...new Set(productIds.map((x) => Number(x)).filter((n) => n > 0))];
  const map = new Map();
  if (!ids.length) return map;

  const [rows] = await executor.query(
    `
    SELECT
      pca.productId,
      cm.hang_xe,
      cm.ten_xe,
      pca.year_from,
      pca.year_to,
      pca.is_primary
    FROM product_car_applications pca
    INNER JOIN car_models cm ON cm.id = pca.carModelId
    WHERE pca.productId IN (?)
    ORDER BY pca.productId, pca.is_primary DESC, pca.id ASC
    `,
    [ids],
  );

  /** @type {Map<number, { hang_xe: string, ten_xe: string, year_from: unknown, year_to: unknown, is_primary?: unknown }[]>} */
  const grouped = new Map();
  for (const row of rows) {
    const pid = Number(row.productId);
    if (!grouped.has(pid)) grouped.set(pid, []);
    grouped.get(pid).push({
      hang_xe: row.hang_xe,
      ten_xe: row.ten_xe,
      year_from: row.year_from,
      year_to: row.year_to,
      is_primary: row.is_primary,
    });
  }

  for (const [pid, cars] of grouped) {
    const primary = pickPrimaryFitment(cars);
    map.set(pid, primary ? [primary] : []);
  }
  return map;
}

/**
 * @param {Record<string, unknown>} product
 * @param {Map<number, { hang_xe: string, ten_xe: string, year_from: unknown, year_to: unknown }[]>} fitmentMap
 */
export function attachCanonicalFieldsFromMap(product, fitmentMap) {
  const id = Number(product?.id ?? product?.productId);
  const cars = Number.isFinite(id) ? fitmentMap.get(id) || [] : [];
  const primaryFitment = pickPrimaryFitment(cars);
  const productIdentity = buildProductIdentity(
    {
      id: product?.id ?? product?.productId,
      partName: product?.partName ?? product?.part_name,
      partNumber: product?.partNumber ?? product?.part_number,
    },
    primaryFitment,
    { siteOrigin: getSiteOrigin() },
  );
  return {
    ...product,
    cars,
    productIdentity,
    ...buildCanonicalFields(product, cars),
  };
}
