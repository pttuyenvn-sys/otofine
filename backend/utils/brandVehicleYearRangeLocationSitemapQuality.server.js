import { pool } from "../config/db.js";
import {
  aggregateVehicleYearRangeLocations,
  isValidSeoYear,
} from "../../shared/vehicleYearRangeAggregate.js";
import { getProductsColumnsResolved } from "./productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";
import { slugifyVi } from "./productSlug.js";

function buildBrandVehicleYearRangeLocationSlug(
  brand,
  model,
  yearFrom,
  yearTo,
  location,
) {
  const brandSlug = slugifyVi(String(brand || "").trim());
  const modelSlug = slugifyVi(String(model || "").trim());
  const locationSlug = slugifyVi(String(location || "").trim());
  if (
    !brandSlug ||
    !modelSlug ||
    !locationSlug ||
    !isValidSeoYear(yearFrom) ||
    !isValidSeoYear(yearTo) ||
    brandSlug === "san-pham" ||
    modelSlug === "san-pham"
  ) {
    return "";
  }
  return `phu-tung-${brandSlug}-${modelSlug}-${yearFrom}-${yearTo}-tai-${locationSlug}`;
}

/**
 * BRAND_VEHICLE_YEAR_RANGE_LOCATION sitemap inventory from exact fitment pairs.
 *
 * @returns {Promise<{ brand: string, model: string, brandSlug: string, modelSlug: string, location: string, locationSlug: string, yearFrom: number, yearTo: number, productCount: number, slug: string }[]>}
 */
export async function getBrandVehicleYearRangeLocationSitemapListings() {
  const pc = await getProductsColumnsResolved();
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const pid = pc.idExpr("p");

  const [rows] = await pool.query(
    `
    SELECT
      ${pid} AS product_id,
      TRIM(cm.hang_xe) AS brand,
      TRIM(cm.ten_xe) AS model,
      TRIM(COALESCE(REPLACE(a.tinh_tp, 'TP ', ''), a.tinh_tp)) AS location,
      pca.year_from,
      pca.year_to
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    INNER JOIN address a ON a.id = s.provinceId
    INNER JOIN product_car_applications pca ON pca.productId = ${pid}
    INNER JOIN car_models cm ON cm.id = pca.carModelId
    WHERE TRIM(cm.hang_xe) <> ''
      AND TRIM(cm.ten_xe) <> ''
      AND TRIM(a.tinh_tp) <> ''
      AND pca.year_from IS NOT NULL
      AND pca.year_to IS NOT NULL
      AND pca.year_from <> pca.year_to
      ${vis.sql}
    `,
    vis.params,
  );

  return aggregateVehicleYearRangeLocations(rows, { minProductCount: 0 })
    .map((entry) => {
      const brandSlug = slugifyVi(entry.brand);
      const modelSlug = slugifyVi(entry.model);
      const locationSlug = slugifyVi(entry.location);
      const slug = buildBrandVehicleYearRangeLocationSlug(
        entry.brand,
        entry.model,
        entry.yearFrom,
        entry.yearTo,
        entry.location,
      );
      if (!slug) return null;
      return {
        brand: entry.brand,
        model: entry.model,
        brandSlug,
        modelSlug,
        location: entry.location,
        locationSlug,
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
