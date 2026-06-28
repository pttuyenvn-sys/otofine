import { pool } from "../config/db.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";
import { getBrandLocationSitemapListings } from "../utils/brandLocationSitemapQuality.server.js";
import { getBrandVehicleYearRangeLocationSitemapListings } from "../utils/brandVehicleYearRangeLocationSitemapQuality.server.js";
import { getBrandVehicleLocationSitemapListings } from "../utils/brandVehicleLocationSitemapQuality.server.js";
import { getBmySitemapListings } from "../utils/bmySitemapQuality.server.js";
import { getBmyRangeSitemapListings } from "../utils/bmyRangeSitemapQuality.server.js";
import { getCbmyRangeSitemapListings } from "../utils/cbmyRangeSitemapQuality.server.js";
import { getCategoryBrandVehicleYearRangeLocationSitemapListings } from "../utils/categoryBrandVehicleYearRangeLocationSitemapQuality.server.js";
import { getCategoryBrandVehicleLocationSitemapListings } from "../utils/categoryBrandVehicleLocationSitemapQuality.server.js";
import { getCategoryBrandLocationSitemapListings } from "../utils/categoryBrandLocationSitemapQuality.server.js";
import { getCategoryBrandSitemapListings } from "../utils/categoryBrandSitemapQuality.server.js";
import { getCbmSitemapListings } from "../utils/cbmSitemapQuality.server.js";
import { buildCanonicalFields } from "../modules/products/services/canonicalPath.server.js";
import { selectPrimaryImagesForProducts } from "../repositories/productList.repository.js";
import { getYearRangeLinksData } from "../services/seoYearRangeLinks.service.js";

function mapSitemapImageUrl(url) {
  if (!url) return null;
  const raw = String(url).trim();
  if (!raw) return null;
  if (raw.startsWith("http")) return raw;
  const base = String(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/${decodeURIComponent(raw).replace(/^\/+/, "")}`;
}

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

    const [carRows] = await pool.query(
      `
      SELECT
        pca.productId,
        cm.hang_xe,
        cm.ten_xe,
        pca.year_from,
        pca.year_to
      FROM product_car_applications pca
      JOIN car_models cm ON cm.id = pca.carModelId
      JOIN products p ON p.id = pca.productId
      INNER JOIN shops s ON s.id = p.shopId
      WHERE (${pc.seoWhereHasReadableSlug("p")})
      ${vis.sql}
      ORDER BY pca.productId, pca.is_primary DESC, pca.id ASC
      `,
    );

    /** @type {Map<number, { hang_xe: string, ten_xe: string, year_from: unknown, year_to: unknown }[]>} */
    const carsByProductId = new Map();
    for (const row of carRows) {
      const productId = Number(row.productId);
      if (!Number.isFinite(productId) || productId <= 0) continue;
      if (!carsByProductId.has(productId)) carsByProductId.set(productId, []);
      carsByProductId.get(productId).push({
        hang_xe: row.hang_xe,
        ten_xe: row.ten_xe,
        year_from: row.year_from,
        year_to: row.year_to,
      });
    }

    const enrichedProducts = products.map((p) => {
      const cars = carsByProductId.get(Number(p.id)) || [];
      return {
        ...p,
        cars,
        ...buildCanonicalFields(
          {
            id: p.id,
            partName: p.partName,
            partNumber: p.partNumber,
          },
          cars,
        ),
      };
    });

    const productIds = enrichedProducts
      .map((p) => Number(p.id))
      .filter((id) => Number.isFinite(id) && id > 0);
    const primaryImageRows = await selectPrimaryImagesForProducts(productIds);
    /** @type {Map<number, string>} */
    const primaryImageByProductId = new Map();
    for (const row of primaryImageRows) {
      const pid = Number(row.productId);
      if (primaryImageByProductId.has(pid)) continue;
      const abs = mapSitemapImageUrl(row.url);
      if (abs) primaryImageByProductId.set(pid, abs);
    }

    const productsWithImages = enrichedProducts.map((p) => ({
      ...p,
      primaryImageUrl: primaryImageByProductId.get(Number(p.id)) || null,
    }));

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

    const [
      categoryBrandListings,
      cbmListings,
      bmyListings,
      bmyRangeListings,
      cbmyRangeListings,
      brandLocationListings,
      brandVehicleLocationListings,
      categoryBrandLocationListings,
      categoryBrandVehicleLocationListings,
      brandVehicleYearRangeLocationListings,
      categoryBrandVehicleYearRangeLocationListings,
    ] = await Promise.all([
      getCategoryBrandSitemapListings(),
      getCbmSitemapListings(),
      getBmySitemapListings(),
      getBmyRangeSitemapListings(),
      getCbmyRangeSitemapListings(),
      getBrandLocationSitemapListings(),
      getBrandVehicleLocationSitemapListings(),
      getCategoryBrandLocationSitemapListings(),
      getCategoryBrandVehicleLocationSitemapListings(),
      getBrandVehicleYearRangeLocationSitemapListings(),
      getCategoryBrandVehicleYearRangeLocationSitemapListings(),
    ]);

    const pid = pc.idExpr("p");

    const [brandModelCounts] = await pool.query(
      `
      SELECT
        TRIM(cm.hang_xe) AS brand,
        TRIM(cm.ten_xe) AS model,
        COUNT(DISTINCT ${pid}) AS productCount
      FROM products p
      INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
      INNER JOIN product_car_applications pca ON pca.productId = ${pid}
      INNER JOIN car_models cm ON cm.id = pca.carModelId
      WHERE TRIM(cm.hang_xe) <> ''
        AND TRIM(cm.ten_xe) <> ''
        ${vis.sql}
      GROUP BY cm.hang_xe, cm.ten_xe
      `,
      vis.params,
    );

    const [brandCounts] = await pool.query(
      `
      SELECT
        TRIM(cm.hang_xe) AS brand,
        COUNT(DISTINCT ${pid}) AS productCount
      FROM products p
      INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
      INNER JOIN product_car_applications pca ON pca.productId = ${pid}
      INNER JOIN car_models cm ON cm.id = pca.carModelId
      WHERE TRIM(cm.hang_xe) <> ''
        ${vis.sql}
      GROUP BY cm.hang_xe
      `,
      vis.params,
    );

    const [locationHubs] = await pool.query(
      `
      SELECT
        TRIM(COALESCE(REPLACE(a.tinh_tp, 'TP ', ''), a.tinh_tp)) AS location,
        COUNT(DISTINCT ${pid}) AS productCount,
        COUNT(DISTINCT p.shopId) AS sellerCount
      FROM products p
      INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
      INNER JOIN address a ON a.id = s.provinceId
      WHERE TRIM(a.tinh_tp) <> ''
        ${vis.sql}
      GROUP BY location
      `,
      vis.params,
    );

    const [categoryLocationPairs] = await pool.query(
      `
      SELECT
        COALESCE(NULLIF(TRIM(pc.canonical_name), ''), TRIM(pc.category_name)) AS category,
        TRIM(COALESCE(REPLACE(a.tinh_tp, 'TP ', ''), a.tinh_tp)) AS location,
        COUNT(DISTINCT ${pid}) AS productCount,
        COUNT(DISTINCT p.shopId) AS sellerCount
      FROM products p
      INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
      INNER JOIN address a ON a.id = s.provinceId
      INNER JOIN product_category_map pcm ON pcm.product_id = ${pid}
      INNER JOIN product_categories pc ON pc.id = pcm.category_id
      WHERE TRIM(pc.canonical_slug) <> ''
        ${vis.sql}
      GROUP BY category, location
      `,
      vis.params,
    );

    res.json({
      products: productsWithImages,
      brandModels,
      partNames: partNameRows.map((r) => r.partName).filter(Boolean),
      categoryBrandListings,
      cbmListings,
      bmyListings,
      bmyRangeListings,
      cbmyRangeListings,
      brandLocationListings,
      brandVehicleLocationListings,
      categoryBrandLocationListings,
      categoryBrandVehicleLocationListings,
      brandVehicleYearRangeLocationListings,
      categoryBrandVehicleYearRangeLocationListings,
      governanceInventory: {
        brandModelCounts: brandModelCounts.map((row) => ({
          brand: row.brand,
          model: row.model,
          productCount: Number(row.productCount) || 0,
        })),
        brandCounts: brandCounts.map((row) => ({
          brand: row.brand,
          productCount: Number(row.productCount) || 0,
        })),
        locationHubs: locationHubs.map((row) => ({
          location: row.location,
          productCount: Number(row.productCount) || 0,
          sellerCount: Number(row.sellerCount) || 0,
        })),
        categoryLocationPairs: categoryLocationPairs.map((row) => ({
          category: row.category,
          location: row.location,
          productCount: Number(row.productCount) || 0,
          sellerCount: Number(row.sellerCount) || 0,
        })),
      },
    });
  } catch (err) {
    console.error("getSitemapData:", err);
    res.status(500).json({
      products: [],
      brandModels: [],
      partNames: [],
      categoryBrandListings: [],
      cbmListings: [],
      bmyListings: [],
      bmyRangeListings: [],
      cbmyRangeListings: [],
      brandLocationListings: [],
      brandVehicleLocationListings: [],
      categoryBrandLocationListings: [],
      categoryBrandVehicleLocationListings: [],
      brandVehicleYearRangeLocationListings: [],
      categoryBrandVehicleYearRangeLocationListings: [],
      governanceInventory: {
        brandModelCounts: [],
        brandCounts: [],
        locationHubs: [],
        categoryLocationPairs: [],
      },
    });
  }
}

const YEAR_RANGE_LINKS_CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

/**
 * Slim BMY_RANGE + CBMY_RANGE rows for listing year-range crawl links (no products/locations).
 */
export async function getYearRangeLinks(req, res) {
  try {
    const payload = await getYearRangeLinksData();
    res.set("Cache-Control", YEAR_RANGE_LINKS_CACHE_CONTROL);
    res.json(payload);
  } catch (err) {
    console.error("getYearRangeLinks:", err);
    res.status(500).json({
      bmyRangeListings: [],
      cbmyRangeListings: [],
    });
  }
}

