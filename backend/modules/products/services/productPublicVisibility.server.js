import {
  getProductPublicVisibilitySql,
  isProductPubliclyVisible as utilIsProductPubliclyVisible,
} from "../../../utils/productPublicVisibility.server.js";

export async function isProductPubliclyVisible(productId) {
  return utilIsProductPubliclyVisible(productId);
}

export async function buildPublicProductWhereClause(opts = {}) {
  const { aliasP = "p", aliasS = "s", skipShopGate = false } = opts;
  const sql = await getProductPublicVisibilitySql(aliasP, aliasS, { skipShopGate });
  return { sql: sql || "", params: [] };
}