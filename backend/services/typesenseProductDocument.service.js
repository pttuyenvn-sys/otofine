import { pool } from "../config/db.js";
import { sqlCategoryKeyFromPartName } from "../utils/categoryKey.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";

/**
 * Một dòng product + facet xe → document Typesense (dùng sync batch + realtime).
 */
export function rowToTypesenseDocument(row) {
  const brands = row.brand_blob
    ? String(row.brand_blob)
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const models = row.model_blob
    ? String(row.model_blob)
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const search_blob = [
    row.partNumber,
    row.partName,
    brands.join(" "),
    models.join(" "),
  ]
    .filter(Boolean)
    .join(" ");

  const ts = row.updatedAt
    ? Math.floor(new Date(row.updatedAt).getTime() / 1000)
    : 0;

  const doc = {
    id: String(row.id),
    partNumber: String(row.partNumber || ""),
    partName: String(row.partName || ""),
    search_blob: search_blob.slice(0, 6000),
    slug:
      row.slug != null && String(row.slug).trim()
        ? String(row.slug).trim()
        : "",
    category_norm: sqlCategoryKeyFromPartName(row.partName),
    brands,
    models,
    updated_at: ts,
  };

  if (row.year_min != null && Number.isFinite(Number(row.year_min))) {
    doc.year_min = Number(row.year_min);
  }
  if (row.year_max != null && Number.isFinite(Number(row.year_max))) {
    doc.year_max = Number(row.year_max);
  }
  return doc;
}

export async function loadProductRowForTypesense(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const pc = await getProductsColumnsResolved();
  const ord = pc.orderExprQualified("p");
  const slugEx = pc.slugSqlExpr("p");

  const [rows] = await pool.query(
    `
    SELECT
      p.id,
      p.partNumber,
      p.partName,
      ${pc.slugSqlSelect("p")},
      ${ord} AS updatedAt,
      GROUP_CONCAT(DISTINCT cm.hang_xe ORDER BY cm.hang_xe SEPARATOR '|') AS brand_blob,
      GROUP_CONCAT(DISTINCT cm.ten_xe ORDER BY cm.ten_xe SEPARATOR '|') AS model_blob,
      MIN(pa.year_from) AS year_min,
      MAX(pa.year_to) AS year_max
    FROM products p
    LEFT JOIN product_car_applications pa ON pa.productId = p.id
    LEFT JOIN car_models cm ON cm.id = pa.carModelId
    WHERE p.id = ?
    GROUP BY p.id, p.partNumber, p.partName, ${slugEx}, ${ord}
    `,
    [id],
  );

  return rows[0] || null;
}
