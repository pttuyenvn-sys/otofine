import { pool } from "../config/db.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";

/**
 * Dữ liệu gọn cho sitemap Next.js (sản phẩm + cặp hãng/dòng có SP).
 */
export async function getSitemapData(req, res) {
  try {
    const pc = await getProductsColumnsResolved();
    const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
    const [products] = await pool.query(
      `
      SELECT ${pc.sitemapSelectList()}
      FROM products p
      INNER JOIN shops s ON s.id = p.shopId
      WHERE (${pc.seoWhereHasReadableSlug("p")})
      ${vis.sql}
      `,
    );

    const [brandModels] = await pool.query(
      `
      SELECT DISTINCT cm.hang_xe AS brand, cm.ten_xe AS model
      FROM product_car_applications pa
      JOIN car_models cm ON cm.id = pa.carModelId
      JOIN products p ON p.id = pa.productId
      INNER JOIN shops s ON s.id = p.shopId
      WHERE 1=1 ${vis.sql}
      `,
    );

    const [partNameRows] = await pool.query(
      `
      SELECT DISTINCT TRIM(p.partName) AS partName
      FROM products p
      INNER JOIN shops s ON s.id = p.shopId
      WHERE p.partName IS NOT NULL AND TRIM(p.partName) <> ''
      ${vis.sql}
      LIMIT 5000
      `,
    );

    res.json({
      products,
      brandModels,
      partNames: partNameRows.map((r) => r.partName).filter(Boolean),
    });
  } catch (err) {
    console.error("getSitemapData:", err);
    res.status(500).json({
      products: [],
      brandModels: [],
      partNames: [],
    });
  }
}

