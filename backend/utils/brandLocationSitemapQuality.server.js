import { pool } from "../config/db.js";
import { getProductsColumnsResolved } from "./productsTableColumns.server.js";
import { buildPublicProductWhereClause } from "../modules/products/services/productPublicVisibility.server.js";
import { slugifyVi } from "./productSlug.js";

function buildBrandLocationSlug(brand, location) {
  const brandSlug = slugifyVi(String(brand || "").trim());
  const locationSlug = slugifyVi(String(location || "").trim());
  if (!brandSlug || !locationSlug || brandSlug === "san-pham") return "";
  return `phu-tung-${brandSlug}-tai-${locationSlug}`;
}

/**
 * Inventory-backed brand × province listings for marketplace sitemap.
 * @returns {Promise<{ brand: string, brandSlug: string, location: string, locationSlug: string, productCount: number }[]>}
 */
export async function getBrandLocationSitemapListings() {
  const pc = await getProductsColumnsResolved();
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const pid = pc.idExpr("p");

  const [rows] = await pool.query(
    `
    SELECT
      TRIM(cm.hang_xe) AS brand,
      TRIM(COALESCE(REPLACE(a.tinh_tp, 'TP ', ''), a.tinh_tp)) AS location,
      ${pid} AS product_id
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    INNER JOIN address a ON a.id = s.provinceId
    INNER JOIN product_car_applications pca ON pca.productId = ${pid}
    INNER JOIN car_models cm ON cm.id = pca.carModelId
    WHERE TRIM(cm.hang_xe) <> ''
      AND TRIM(a.tinh_tp) <> ''
      ${vis.sql}
    `,
    vis.params,
  );

  /** @type {Map<string, { brand: string, location: string, ids: Set<number> }>} */
  const groups = new Map();
  for (const r of rows) {
    const brand = String(r.brand || "").trim();
    const location = String(r.location || "").trim();
    const productId = Number(r.product_id);
    if (!brand || !location || !Number.isFinite(productId)) continue;

    const key = `${brand}\0${location}`;
    if (!groups.has(key)) {
      groups.set(key, { brand, location, ids: new Set() });
    }
    groups.get(key).ids.add(productId);
  }

  return [...groups.values()]
    .map((g) => {
      const brandSlug = slugifyVi(g.brand);
      const locationSlug = slugifyVi(g.location);
      const slug = buildBrandLocationSlug(g.brand, g.location);
      if (!slug) return null;
      return {
        brand: g.brand,
        brandSlug,
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
