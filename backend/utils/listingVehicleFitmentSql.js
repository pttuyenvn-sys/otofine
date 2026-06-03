import {
  cleanHttpQueryValue,
  isPresentNonEmptyFilterString,
  normalizeListFilterYear,
} from "./listingQueryNormalize.js";

function sqlLowerTrim(expr) {
  return `LOWER(TRIM(${expr}))`;
}

/**
 * Same-row vehicle fitment EXISTS — brand, model, and year must match
 * one product_car_applications row (aligned with marketplace listing JOIN).
 *
 * @param {string} productIdSql — e.g. `p.id` or adapter id expression
 * @param {{ brand?: string, model?: string, year?: unknown }} filters
 * @returns {{ sql: string, params: unknown[] } | null}
 */
export function buildSameRowVehicleFitmentExistsSql(productIdSql, filters = {}) {
  const brand = cleanHttpQueryValue(filters.brand);
  const model = cleanHttpQueryValue(filters.model);
  const yearNum = normalizeListFilterYear(filters.year);

  const hasBrand = isPresentNonEmptyFilterString(brand);
  const hasModel = isPresentNonEmptyFilterString(model);
  const hasYear = yearNum != null;

  if (!hasBrand && !hasModel && !hasYear) return null;

  /** @type {string[]} */
  const conditions = [`pa.productId = ${productIdSql}`];
  /** @type {unknown[]} */
  const params = [];

  if (hasBrand) {
    conditions.push(`${sqlLowerTrim("cm.hang_xe")} = ?`);
    params.push(String(brand).trim().toLowerCase());
  }
  if (hasModel) {
    conditions.push(`${sqlLowerTrim("cm.ten_xe")} = ?`);
    params.push(String(model).trim().toLowerCase());
  }
  if (hasYear) {
    conditions.push("(pa.year_from IS NULL OR pa.year_from <= ?)");
    conditions.push("(pa.year_to IS NULL OR pa.year_to >= ?)");
    params.push(yearNum, yearNum);
  }

  return {
    sql: ` AND EXISTS (
      SELECT 1
      FROM product_car_applications pa
      INNER JOIN car_models cm ON cm.id = pa.carModelId
      WHERE ${conditions.join(" AND ")}
    ) `,
    params,
  };
}

/**
 * @param {string[]} whereParts
 * @param {unknown[]} params
 * @param {string} productIdSql
 * @param {{ brand?: string, model?: string, year?: unknown }} filters
 */
export function appendSameRowVehicleFitmentExists(
  whereParts,
  params,
  productIdSql,
  filters,
) {
  const built = buildSameRowVehicleFitmentExistsSql(productIdSql, filters);
  if (!built) return;
  whereParts.push(built.sql);
  params.push(...built.params);
}
