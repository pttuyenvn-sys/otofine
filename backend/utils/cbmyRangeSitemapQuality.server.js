import { pool } from "../config/db.js";
import {
  aggregateCategoryVehicleYearRanges,
  isValidSeoYear,
} from "../../shared/vehicleYearRangeAggregate.js";
import { getProductsColumnsResolved } from "./productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";
import { slugifyVi } from "./productSlug.js";

/**
 * Normalize DB canonical_slug to category URL core (strip trailing -o-to).
 * @param {string} canonicalSlug
 * @returns {string}
 */
function categoryCoreFromCanonicalSlug(canonicalSlug) {
  const cs = String(canonicalSlug || "")
    .trim()
    .toLowerCase();
  if (!cs) return "";
  return cs.endsWith("-o-to") ? cs.slice(0, -"-o-to".length) : cs;
}

function buildCbmyRangeSlug(categorySlug, brand, model, yearFrom, yearTo) {
  const categoryCore = categoryCoreFromCanonicalSlug(categorySlug);
  const brandSlug = slugifyVi(String(brand || "").trim());
  const modelSlug = slugifyVi(String(model || "").trim());
  if (
    !categoryCore ||
    !brandSlug ||
    !modelSlug ||
    !isValidSeoYear(yearFrom) ||
    !isValidSeoYear(yearTo)
  ) {
    return "";
  }
  if (brandSlug === "san-pham" || modelSlug === "san-pham") return "";
  return `${categoryCore}-${brandSlug}-${modelSlug}-${yearFrom}-${yearTo}`;
}

/**
 * CATEGORY_BRAND_VEHICLE_YEAR_RANGE sitemap inventory from exact fitment pairs.
 *
 * @returns {Promise<{ category: string, categorySlug: string, brand: string, brandSlug: string, model: string, modelSlug: string, yearFrom: number, yearTo: number, productCount: number }[]>}
 */
export async function getCbmyRangeSitemapListings() {
  const pc = await getProductsColumnsResolved();
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const pid = pc.idExpr("p");

  const [rows] = await pool.query(
    `
    SELECT
      COALESCE(NULLIF(TRIM(pc_cat.canonical_name), ''), NULLIF(TRIM(pc_cat.category_name), '')) AS category,
      TRIM(pc_cat.canonical_slug) AS canonical_slug,
      TRIM(cm.hang_xe) AS brand,
      TRIM(cm.ten_xe) AS model,
      pca.year_from,
      pca.year_to,
      ${pid} AS product_id
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    INNER JOIN product_category_map pcm ON pcm.product_id = ${pid}
    INNER JOIN product_categories pc_cat ON pc_cat.id = pcm.category_id
    INNER JOIN product_car_applications pca ON pca.productId = ${pid}
    INNER JOIN car_models cm ON cm.id = pca.carModelId
    WHERE TRIM(cm.hang_xe) <> ''
      AND TRIM(cm.ten_xe) <> ''
      AND TRIM(pc_cat.canonical_slug) <> ''
      AND pca.year_from IS NOT NULL
      AND pca.year_to IS NOT NULL
      AND pca.year_from <> pca.year_to
      ${vis.sql}
    `,
    vis.params,
  );

  return aggregateCategoryVehicleYearRanges(rows, { minProductCount: 0 })
    .map((entry) => {
      const categorySlug = categoryCoreFromCanonicalSlug(entry.canonicalSlug);
      const brandSlug = slugifyVi(entry.brand);
      const modelSlug = slugifyVi(entry.model);
      if (!categorySlug || !brandSlug || !modelSlug) return null;
      const slug = buildCbmyRangeSlug(
        entry.canonicalSlug,
        entry.brand,
        entry.model,
        entry.yearFrom,
        entry.yearTo,
      );
      if (!slug) return null;
      return {
        category: entry.category,
        categorySlug,
        brand: entry.brand,
        brandSlug,
        model: entry.model,
        modelSlug,
        yearFrom: entry.yearFrom,
        yearTo: entry.yearTo,
        productCount: entry.productCount,
        slug,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        b.productCount - a.productCount ||
        a.slug.localeCompare(b.slug),
    );
}
