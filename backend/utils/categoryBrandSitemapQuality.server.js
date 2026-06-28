import { pool } from "../config/db.js";
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

/**
 * Inventory-backed category × brand listings for marketplace sitemap.
 * @returns {Promise<{ category: string, categorySlug: string, brand: string, brandSlug: string, productCount: number }[]>}
 */
export async function getCategoryBrandSitemapListings() {
  const pc = await getProductsColumnsResolved();
  const vis = await buildPublicProductWhereClause({ aliasP: "p", aliasS: "s" });
  const pid = pc.idExpr("p");

  const [rows] = await pool.query(
    `
    SELECT
      COALESCE(NULLIF(TRIM(pc_cat.canonical_name), ''), NULLIF(TRIM(pc_cat.category_name), '')) AS category,
      TRIM(pc_cat.canonical_slug) AS canonical_slug,
      TRIM(cm.hang_xe) AS brand,
      ${pid} AS product_id
    FROM products p
    INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
    INNER JOIN product_category_map pcm ON pcm.product_id = ${pid}
    INNER JOIN product_categories pc_cat ON pc_cat.id = pcm.category_id
    INNER JOIN product_car_applications pca ON pca.productId = ${pid}
    INNER JOIN car_models cm ON cm.id = pca.carModelId
    WHERE TRIM(cm.hang_xe) <> ''
      AND TRIM(pc_cat.canonical_slug) <> ''
      ${vis.sql}
    `,
    vis.params,
  );

  /** @type {Map<string, { category: string, canonicalSlug: string, brand: string, ids: Set<number> }>} */
  const groups = new Map();
  for (const r of rows) {
    const category = String(r.category || "").trim();
    const canonicalSlug = String(r.canonical_slug || "").trim();
    const brand = String(r.brand || "").trim();
    const productId = Number(r.product_id);
    if (!category || !canonicalSlug || !brand || !Number.isFinite(productId)) continue;

    const key = `${category}\0${brand}`;
    if (!groups.has(key)) {
      groups.set(key, { category, canonicalSlug, brand, ids: new Set() });
    }
    groups.get(key).ids.add(productId);
  }

  return [...groups.values()]
    .map((g) => {
      const categorySlug = categoryCoreFromCanonicalSlug(g.canonicalSlug);
      const brandSlug = slugifyVi(g.brand);
      if (!categorySlug || !brandSlug) return null;
      return {
        category: g.category,
        categorySlug,
        brand: g.brand,
        brandSlug,
        productCount: g.ids.size,
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        `${a.categorySlug}-${a.brandSlug}`.localeCompare(
          `${b.categorySlug}-${b.brandSlug}`,
        ),
    );
}
