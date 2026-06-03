import { pool } from "../config/db.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";
import { listSitemapEligibleStorefronts } from "../domains/shopPublic/repositories/shopPublic.repository.js";
import {
  RESERVED_SHOP_SLUGS,
  SLUG_REGEX,
} from "../domains/shopPublic/config/publicShop.config.js";
import { evaluateStorefrontSeoIndexability } from "../domains/shopPublic/utils/storefrontSeoIndexability.util.js";

/**
 * Dữ liệu gọn cho sitemap Next.js (sản phẩm + cặp hãng/dòng có SP).
 */
function projectStorefrontSitemapRow(row) {
  const slug = String(row?.slug || "").trim().toLowerCase();
  if (!slug || slug.length < 4) return null;
  if (!SLUG_REGEX.test(slug)) return null;
  if (RESERVED_SHOP_SLUGS.has(slug)) return null;

  const indexEval = evaluateStorefrontSeoIndexability({
    row,
    productCount: row.publicProductCount,
    approvedModerationCount: row.approvedModerationCount,
    rejectedModerationCount: row.rejectedModerationCount,
    lastStorefrontActivityAt: row.lastStorefrontActivityAt,
    latestProductAt: row.latestProductAt,
  });
  if (!indexEval.indexable) return null;

  const shopUpdatedAt = row.shopUpdatedAt || null;
  const latestProductAt = row.latestProductAt || null;
  const shopTs = shopUpdatedAt ? new Date(shopUpdatedAt).getTime() : 0;
  const productTs = latestProductAt ? new Date(latestProductAt).getTime() : 0;
  const lastModified =
    shopTs || productTs
      ? new Date(Math.max(shopTs, productTs)).toISOString()
      : null;

  return {
    slug,
    shopUpdatedAt: shopUpdatedAt ? new Date(shopUpdatedAt).toISOString() : null,
    latestProductAt: latestProductAt ? new Date(latestProductAt).toISOString() : null,
    lastModified,
  };
}

export async function getSitemapData(req, res) {
  try {
    const pc = await getProductsColumnsResolved();
    const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
    const [products, storefrontRows] = await Promise.all([
      pool.query(
      `
      SELECT ${pc.sitemapSelectList()}
      FROM products p
      INNER JOIN shops s ON s.id = p.shopId
      WHERE (${pc.seoWhereHasReadableSlug("p")})
      ${vis.sql}
      `,
      ),
      listSitemapEligibleStorefronts(),
    ]);

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

    const storefronts = (storefrontRows || [])
      .map(projectStorefrontSitemapRow)
      .filter(Boolean);

    res.json({
      products: products[0] || [],
      brandModels,
      partNames: partNameRows.map((r) => r.partName).filter(Boolean),
      storefronts,
    });
  } catch (err) {
    console.error("getSitemapData:", err);
    res.status(500).json({
      products: [],
      brandModels: [],
      partNames: [],
      storefronts: [],
    });
  }
}

