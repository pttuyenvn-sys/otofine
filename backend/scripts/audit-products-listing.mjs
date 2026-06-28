/**
 * Phase 3 backend audit — read-only SQL/EXPLAIN dump.
 * Usage: node scripts/audit-products-listing.mjs
 */
import { performance } from "node:perf_hooks";
import { pool } from "../config/db.js";
import * as productListRepo from "../repositories/productList.repository.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";

const SCENARIOS = [
  { label: "A", query: { page: 1, sort: "popular" } },
  { label: "B", query: { page: 1, sort: "popular", brand: "Toyota" } },
  { label: "C", query: { page: 1, sort: "popular", brand: "Toyota", model: "Vios" } },
  { label: "D", query: { page: 1, sort: "popular", brand: "Toyota", model: "Vios", year: 2025 } },
];

async function buildSqlBundle(pc, query) {
  const { where: baseWhere, params, keywordOrder } =
    productListRepo.buildProductListFilters(pc, query);
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const where = baseWhere + vis.sql;
  const limit = 16;
  const offset = 0;
  const sort = "popular";
  const joinCategoryMap = Boolean(query.category);
  const joinVehicleFitment = Boolean(
    query.brand || query.model || (query.year != null && Number.isFinite(Number(query.year))),
  );

  const freshnessExpr = pc.orderExprQualified("p");
  const orderSql = productListRepo.buildListOrderBy({
    keywordOrder,
    sort,
    freshnessExpr,
    pc,
  });
  const fromSql = productListRepo.buildProductListingJoinSql(pc, {
    joinCategoryMap,
    joinVehicleFitment,
  });

  const selectSql = `
    SELECT
      ${pc.idExpr("p")},
      ${pc.shopIdSqlSelect("p")},
      ${pc.partNumberSqlSelect("p")},
      ${pc.nameSqlSelect("p")},
      ${pc.priceSqlSelect("p")},
      ${pc.shortDescriptionSqlSelect("p")},
      ${pc.descriptionSqlSelect("p")},
      ${pc.originSqlSelect("p")},
      ${pc.stockSqlSelect("p")},
      ${freshnessExpr} AS updatedAt,
      MAX(s.name) AS shopName,
      MAX(s.phone) AS phone,
      MAX(a.tinh_tp) AS provinceName,
      (
        SELECT TRIM(BOTH ' ' FROM CONCAT_WS(' ',
          NULLIF(TRIM(cmx.hang_xe), ''),
          NULLIF(TRIM(cmx.ten_xe), ''),
          NULLIF(
            IF(
              pax.year_from IS NULL OR pax.year_to IS NULL,
              NULL,
              IF(
                pax.year_from = pax.year_to,
                CAST(pax.year_from AS CHAR),
                CONCAT(pax.year_from, '–', pax.year_to)
              )
            ),
            ''
          )
        ))
        FROM product_car_applications pax
        LEFT JOIN car_models cmx ON cmx.id = pax.carModelId
        WHERE pax.productId = ${pc.idExpr("p")}
        ORDER BY pax.id ASC
        LIMIT 1
      ) AS compatibilityLine
    ${fromSql}
    ${where}
    GROUP BY
      ${pc.idExpr("p")}, ${pc.shopIdExpr("p")}, ${pc.partNumberExpr("p")}, ${pc.partNameExpr("p")},
      ${pc.priceExpr("p")},
      ${pc.shortDescriptionSqlSelect("p").split(" AS ")[0]},
      ${pc.descriptionSqlSelect("p").split(" AS ")[0]},
      ${pc.originExpr("p")},
      ${pc.stockExpr("p")},
      ${freshnessExpr}
    ${orderSql}
    LIMIT ? OFFSET ?
  `.replace(/\s+/g, " ").trim();

  const countSql = `
    SELECT COUNT(DISTINCT ${pc.idExpr("p")}) total
    ${fromSql}
    ${where}
  `.replace(/\s+/g, " ").trim();

  return {
    joinCategoryMap,
    joinVehicleFitment,
    visibilitySql: vis.sql,
    where,
    params,
    selectSql,
    countSql,
    execSelectParams: [...params, limit, offset],
    countParams: params,
  };
}

async function explain(sql, params) {
  const [rows] = await pool.query(`EXPLAIN ${sql}`, params);
  return rows;
}

async function timed(label, fn) {
  const t0 = performance.now();
  const result = await fn();
  return { label, ms: Math.round(performance.now() - t0), result };
}

async function main() {
  const tSchema = performance.now();
  const pc = await getProductsColumnsResolved();
  const schemaMs = Math.round(performance.now() - tSchema);

  const report = { schemaResolutionMs: schemaMs, scenarios: [] };

  for (const s of SCENARIOS) {
    const bundle = await buildSqlBundle(pc, s.query);

    const [selectTime, countTime, explainSelect, explainCount] = await Promise.all([
      timed("select", () => pool.query(bundle.selectSql, bundle.execSelectParams)),
      timed("count", () => pool.query(bundle.countSql, bundle.countParams)),
      explain(bundle.selectSql, bundle.execSelectParams),
      explain(bundle.countSql, bundle.countParams),
    ]);

    const rows = selectTime.result[0];
    const ids = rows.map((r) => r.id);
    const imagesTime = await timed("images", () =>
      productListRepo.selectPrimaryImagesForProducts(ids),
    );

    report.scenarios.push({
      label: s.label,
      query: s.query,
      joinCategoryMapFlag: bundle.joinCategoryMap,
      joinVehicleFitmentFlag: bundle.joinVehicleFitment,
      visibilitySql: bundle.visibilitySql.trim(),
      whereClause: bundle.where.replace(/\s+/g, " ").trim(),
      selectSql: bundle.selectSql,
      countSql: bundle.countSql,
      timingsMs: {
        select: selectTime.ms,
        count: countTime.ms,
        images: imagesTime.ms,
        totalDb: selectTime.ms + countTime.ms + imagesTime.ms,
      },
      rowCount: rows.length,
      explainSelect,
      explainCount,
    });
  }

  // Table sizes
  const [tableStats] = await pool.query(`
    SELECT table_name, table_rows, data_length, index_length
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN (
        'products','shops','product_category_map','product_categories',
        'product_car_applications','car_models','product_images','address'
      )
    ORDER BY table_rows DESC
  `);

  report.tableStats = tableStats;
  console.log(JSON.stringify(report, null, 2));
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
