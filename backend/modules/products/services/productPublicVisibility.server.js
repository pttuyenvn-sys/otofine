import {
  getProductPublicVisibilitySql,
  getPdpVisibilitySql,
  isProductPubliclyVisible as utilIsProductPubliclyVisible,
  isProductPdpVisible as utilIsProductPdpVisible,
  resolvePdpArchiveState,
} from "../../../utils/productPublicVisibility.server.js";

export { resolvePdpArchiveState };

export async function isProductPubliclyVisible(productId) {
  return utilIsProductPubliclyVisible(productId);
}

export async function isProductPdpVisible(productId) {
  return utilIsProductPdpVisible(productId);
}

export async function buildPublicProductWhereClause(opts = {}) {
  const { aliasP = "p", aliasS = "s", skipShopGate = false } = opts;
  const sql = await getProductPublicVisibilitySql(aliasP, aliasS, { skipShopGate });
  return { sql: sql || "", params: [] };
}

export async function buildPdpProductWhereClause(opts = {}) {
  const { aliasP = "p" } = opts;
  const sql = await getPdpVisibilitySql(aliasP);
  return { sql: sql || "", params: [] };
}
