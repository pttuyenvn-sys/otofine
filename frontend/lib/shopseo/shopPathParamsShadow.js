/**
 * SHOP-OWNERSHIP-01 — Dev-only shadow diff for path → filter params migration.
 */

const DIMENSION_KEYS = ["category", "brand", "model", "year"];

/**
 * @param {Record<string, string | undefined>} a
 * @param {Record<string, string | undefined>} b
 * @returns {boolean}
 */
export function shopPathParamsEqual(a = {}, b = {}) {
  for (const key of DIMENSION_KEYS) {
    const left = a[key] == null || a[key] === "" ? "" : String(a[key]);
    const right = b[key] == null || b[key] === "" ? "" : String(b[key]);
    if (left !== right) return false;
  }
  return true;
}

/**
 * @param {Record<string, string | undefined>} legacyParams
 * @param {Record<string, string | undefined>} nextParams
 * @param {{ pathname?: string, shopBasePath?: string }} [context]
 */
export function warnShopPathParamsShadow(legacyParams, nextParams, context = {}) {
  if (process.env.NODE_ENV !== "development") return;
  if (shopPathParamsEqual(legacyParams, nextParams)) return;

  console.warn("[shop-ownership-01] path params shadow mismatch", {
    pathname: context.pathname,
    shopBasePath: context.shopBasePath,
    legacy: pickDimensions(legacyParams),
    next: pickDimensions(nextParams),
  });
}

function pickDimensions(params) {
  const out = {};
  for (const key of DIMENSION_KEYS) {
    if (params[key]) out[key] = String(params[key]);
  }
  return out;
}
