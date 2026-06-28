import { pool } from "../config/db.js";
import { aggregateVehicleYearRanges, isValidSeoYear } from "../../shared/vehicleYearRangeAggregate.js";
import { getProductsColumnsResolved } from "./productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";
import { slugifyVi } from "./productSlug.js";

const MIN_PRODUCT_COUNT = 10;

function buildBmyRangeSlug(brand, model, yearFrom, yearTo) {
  const brandSlug = slugifyVi(String(brand || "").trim());
  const modelSlug = slugifyVi(String(model || "").trim());
  if (!brandSlug || !modelSlug || !isValidSeoYear(yearFrom) || !isValidSeoYear(yearTo)) {
    return "";
  }
  if (brandSlug === "san-pham" || modelSlug === "san-pham") return "";
  return `phu-tung-${brandSlug}-${modelSlug}-${yearFrom}-${yearTo}`;
}

/**
 * VEHICLE_YEAR_RANGE sitemap inventory from exact fitment year_from/year_to pairs.
 *
 * @returns {Promise<{ brand: string, model: string, yearFrom: number, yearTo: number, productCount: number, slug: string }[]>}
 */
export async function getBmyRangeSitemapListings() {
  const pc = await getProductsColumnsResolved();
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const pid = pc.idExpr("p");

  const [rows] = await pool.query(
    `
    SELECT
      ${pid} AS product_id,
      TRIM(cm.hang_xe) AS brand,
      TRIM(cm.ten_xe) AS model,
      pca.year_from,
      pca.year_to
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    INNER JOIN product_car_applications pca ON pca.productId = ${pid}
    INNER JOIN car_models cm ON cm.id = pca.carModelId
    WHERE TRIM(cm.hang_xe) <> ''
      AND TRIM(cm.ten_xe) <> ''
      AND pca.year_from IS NOT NULL
      AND pca.year_to IS NOT NULL
      AND pca.year_from <> pca.year_to
      ${vis.sql}
    `,
    vis.params,
  );

  return aggregateVehicleYearRanges(rows, { minProductCount: MIN_PRODUCT_COUNT })
    .map((entry) => {
      const slug = buildBmyRangeSlug(
        entry.brand,
        entry.model,
        entry.yearFrom,
        entry.yearTo,
      );
      return { ...entry, slug };
    })
    .filter((row) => row.slug)
    .sort(
      (a, b) =>
        b.productCount - a.productCount ||
        a.slug.localeCompare(b.slug),
    );
}
