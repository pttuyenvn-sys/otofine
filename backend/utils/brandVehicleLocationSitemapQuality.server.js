import { pool } from "../config/db.js";
import { getProductsColumnsResolved } from "./productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";
import { slugifyVi } from "./productSlug.js";

function buildBrandVehicleLocationSlug(brand, model, location) {
  const brandSlug = slugifyVi(String(brand || "").trim());
  const modelSlug = slugifyVi(String(model || "").trim());
  const locationSlug = slugifyVi(String(location || "").trim());
  if (
    !brandSlug ||
    !modelSlug ||
    !locationSlug ||
    brandSlug === "san-pham" ||
    modelSlug === "san-pham"
  ) {
    return "";
  }
  return `phu-tung-${brandSlug}-${modelSlug}-tai-${locationSlug}`;
}

/**
 * Inventory-backed brand × model × province listings for marketplace sitemap.
 * @returns {Promise<{ brand: string, model: string, brandSlug: string, modelSlug: string, location: string, locationSlug: string, productCount: number }[]>}
 */
export async function getBrandVehicleLocationSitemapListings() {
  const pc = await getProductsColumnsResolved();
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const pid = pc.idExpr("p");

  const [rows] = await pool.query(
    `
    SELECT
      TRIM(cm.hang_xe) AS brand,
      TRIM(cm.ten_xe) AS model,
      TRIM(COALESCE(REPLACE(a.tinh_tp, 'TP ', ''), a.tinh_tp)) AS location,
      ${pid} AS product_id
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    INNER JOIN address a ON a.id = s.provinceId
    INNER JOIN product_car_applications pca ON pca.productId = ${pid}
    INNER JOIN car_models cm ON cm.id = pca.carModelId
    WHERE TRIM(cm.hang_xe) <> ''
      AND TRIM(cm.ten_xe) <> ''
      AND TRIM(a.tinh_tp) <> ''
      ${vis.sql}
    `,
    vis.params,
  );

  /** @type {Map<string, { brand: string, model: string, location: string, ids: Set<number> }>} */
  const groups = new Map();
  for (const r of rows) {
    const brand = String(r.brand || "").trim();
    const model = String(r.model || "").trim();
    const location = String(r.location || "").trim();
    const productId = Number(r.product_id);
    if (!brand || !model || !location || !Number.isFinite(productId)) continue;

    const key = `${brand}\0${model}\0${location}`;
    if (!groups.has(key)) {
      groups.set(key, { brand, model, location, ids: new Set() });
    }
    groups.get(key).ids.add(productId);
  }

  return [...groups.values()]
    .map((g) => {
      const brandSlug = slugifyVi(g.brand);
      const modelSlug = slugifyVi(g.model);
      const locationSlug = slugifyVi(g.location);
      const slug = buildBrandVehicleLocationSlug(g.brand, g.model, g.location);
      if (!slug) return null;
      return {
        brand: g.brand,
        model: g.model,
        brandSlug,
        modelSlug,
        location: g.location,
        locationSlug,
        productCount: g.ids.size,
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
