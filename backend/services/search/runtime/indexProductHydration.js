/**
 * SEARCH-INDEX-RUNTIME-PHASE-02 — hydrate products after index match (products JOIN allowed here only).
 */

import { pool } from "../../../config/db.js";
import { getProductsColumnsResolved } from "../../../utils/productsTableColumns.server.js";
import { buildListOrderBy } from "../../../repositories/productList.repository.js";
import { buildKeywordRelevanceOrderSql } from "../../../utils/keywordRelevanceRanking.js";
import { isSearchPopupIndexEnabled } from "../../../config/searchPopupIndexConfig.js";
import { SearchIndexDocumentReader } from "./SearchIndexDocumentReader.js";

function productKeywordOrder(indexOrder, pc, query) {
  if (!indexOrder || !String(indexOrder).includes("psi.")) {
    return indexOrder || "";
  }
  const q = String(query || "").trim();
  if (!q) return "";
  const relevance = buildKeywordRelevanceOrderSql({
    titleExpr: pc.partNameExpr("p"),
    partNumberExpr: pc.partNumberExpr("p"),
    shortDescExpr: pc.shortDescriptionExpr("p"),
    descExpr: pc.descriptionExpr("p"),
    query: q,
  });
  return relevance ? `${relevance},` : "";
}

/**
 * @param {number[]} productIds
 * @param {{ keywordOrder?: string, query?: string }} [opts]
 */
export async function hydrateProductsForSearch(productIds, opts = {}) {
  const ids = [...new Set(productIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return [];

  const pc = await getProductsColumnsResolved();
  const pid = pc.idExpr("p");
  const freshnessExpr = pc.orderExprQualified("p");
  const keywordOrder = productKeywordOrder(opts.keywordOrder, pc, opts.query);
  const orderSql = buildListOrderBy({
    keywordOrder,
    sort: "popular",
    freshnessExpr,
    pc,
  });
  const orderInner = orderSql.replace(/^\s*ORDER BY\s*/i, "").trim();

  const [rows] = await pool.query(
    `
    SELECT
      ${pid} AS id,
      ${pc.shopIdSqlSelect("p")},
      ${pc.partNumberSqlSelect("p")},
      ${pc.nameSqlSelect("p")},
      ${pc.priceSqlSelect("p")},
      ${pc.originSqlSelect("p")},
      ${pc.stockSqlSelect("p")},
      ${freshnessExpr} AS updatedAt,
      s.name AS shopName,
      a.tinh_tp AS provinceName,
      (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.productId = ${pid}
        ORDER BY pi.isPrimary DESC, pi.id ASC
        LIMIT 1
      ) AS imageUrl
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    LEFT JOIN address a ON a.id = s.provinceId
    WHERE ${pid} IN (?)
    ORDER BY ${orderInner}
    `,
    [ids],
  );

  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * @param {Array<{ product_id: number, canonical_name?: string, brand?: string, model?: string, fitment_year_from?: number, fitment_year_to?: number }>} indexRows
 * @param {{ keywordOrder?: string, query?: string }} [opts]
 */
export async function hydrateIndexPreviewRows(indexRows, opts = {}) {
  if (isSearchPopupIndexEnabled()) {
    return SearchIndexDocumentReader.readForPreview(
      indexRows.map((r) => ({
        product_id: r.product_id,
        canonical_name: r.canonical_name,
        brand: r.brand,
        model: r.model,
        fitment_year_from: r.fitment_year_from,
        fitment_year_to: r.fitment_year_to,
      })),
    );
  }

  const ids = indexRows.map((r) => Number(r.product_id));
  const hydrated = await hydrateProductsForSearch(ids, opts);
  const indexByProduct = new Map(indexRows.map((r) => [Number(r.product_id), r]));
  return hydrated.map((row) => {
    const idx = indexByProduct.get(Number(row.id));
    return {
      ...row,
      canonical_name: idx?.canonical_name || "",
      brand: idx?.brand || "",
      model: idx?.model || "",
      fitment_brand: idx?.brand || null,
      fitment_model: idx?.model || null,
      fitment_year_from: idx?.fitment_year_from ?? null,
      fitment_year_to: idx?.fitment_year_to ?? null,
      fitment_is_primary: 1,
    };
  });
}
