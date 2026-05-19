import { pool } from "../config/db.js";
import {
  buildProductListFilters,
  buildProductListingJoinSql,
} from "../repositories/productList.repository.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import {
  listingQueryNeedsVehicleFitmentJoin,
  normalizeListingQuery,
} from "../utils/listingQueryNormalize.js";

/**
 * Normalize Vietnamese text for search
 * Removes diacritics and converts to lowercase
 */
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasCategoryFilters(query = {}) {
  const n = normalizeListingQuery(query);
  return Boolean(
    n.brand ||
    n.model ||
    n.year != null ||
    n.location ||
    n.city ||
    n.cityId != null ||
    n.keyword,
  );
}

/**
 * Get all active product categories for frontend menu
 * Returns variant categories for product filters
 * Ordered by menu_order ASC, product_count DESC
 */
export async function getProductCategories(req, res) {
  try {
    if (hasCategoryFilters(req.query)) {
      const productColumns = await getProductsColumnsResolved();
      const { where, params } = buildProductListFilters(productColumns, req.query);
      const joinV = listingQueryNeedsVehicleFitmentJoin(req.query);
      const fromSql = buildProductListingJoinSql(productColumns, joinV);
      const [rows] = await pool.query(`
        SELECT
          pc.id,
          pc.category_key,
          pc.category_name,
          pc.category_slug,
          pc.h1,
          pc.seo_title,
          pc.seo_desc,
          pc.menu_order,
          COUNT(DISTINCT ${productColumns.idExpr("p")}) AS product_count,
          pc.is_active,
          pc.created_at,
          pc.updated_at
        ${fromSql}
        ${where}
          AND pc.is_active = 1
        GROUP BY
          pc.id,
          pc.category_key,
          pc.category_name,
          pc.category_slug,
          pc.h1,
          pc.seo_title,
          pc.seo_desc,
          pc.menu_order,
          pc.is_active,
          pc.created_at,
          pc.updated_at
        HAVING product_count > 0
        ORDER BY pc.menu_order ASC, product_count DESC
      `, params);

      return res.json(rows);
    }

    const [rows] = await pool.query(`
      SELECT 
        id,
        category_key,
        category_name,
        category_slug,
        h1,
        seo_title,
        seo_desc,
        menu_order,
        product_count,
        is_active,
        created_at,
        updated_at
      FROM product_categories
      WHERE is_active = 1
      ORDER BY menu_order ASC, product_count DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error("[PRODUCT CATEGORIES] Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
}

/**
 * Get canonical categories for frontend menu
 * Returns merged canonical categories (no directional variants)
 * Aggregates product counts across variants, ordered by total_product_count DESC
 * Filters: approved=1 AND is_active=1
 * Limited to 30 for homepage menu
 */
export async function getCanonicalCategories(req, res) {
  try {
    if (hasCategoryFilters(req.query)) {
      const productColumns = await getProductsColumnsResolved();
      const { where, params } = buildProductListFilters(productColumns, req.query);
      const joinV = listingQueryNeedsVehicleFitmentJoin(req.query);
      const fromSql = buildProductListingJoinSql(productColumns, joinV);
      const [rows] = await pool.query(`
        SELECT
          COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) AS canonical_name,
          COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug) AS canonical_slug,
          COUNT(DISTINCT ${productColumns.idExpr("p")}) AS total_product_count
        ${fromSql}
        ${where}
          AND COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) IS NOT NULL
          AND COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) != ''
          AND COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug) IS NOT NULL
          AND COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug) != ''
          AND pc.approved = 1
          AND pc.is_active = 1
        GROUP BY
          COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name),
          COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug)
        HAVING total_product_count > 0
        ORDER BY total_product_count DESC
        LIMIT 30
      `, params);

      return res.json(rows);
    }

    const [rows] = await pool.query(`
      SELECT
        canonical_name,
        canonical_slug,
        SUM(product_count) AS total_product_count
      FROM product_categories
      WHERE canonical_name IS NOT NULL
        AND canonical_name != ''
        AND canonical_slug IS NOT NULL
        AND canonical_slug != ''
        AND approved = 1
        AND is_active = 1
      GROUP BY canonical_name, canonical_slug
      ORDER BY total_product_count DESC
      LIMIT 30
    `);

    res.json(rows);
  } catch (error) {
    console.error("[PRODUCT CATEGORIES] Error fetching canonical categories:", error);
    res.status(500).json({ error: "Failed to fetch canonical categories" });
  }
}

/**
 * Search categories for autocomplete
 * Returns categories matching query with prefix match first
 * Filters: is_searchable=1 AND approved=1
 * Order: prefix match first, contains second, search_priority DESC, product_count DESC
 */
export async function searchCategories(req, res) {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.json([]);
    }

    const searchTerm = `%${q}%`;
    const prefixTerm = `${q}%`;

    const [rows] = await pool.query(`
      SELECT
        id,
        category_name,
        category_slug,
        canonical_name,
        canonical_slug,
        product_count,
        search_priority,
        CASE
          WHEN category_name LIKE ? THEN 1
          WHEN canonical_name LIKE ? THEN 2
          ELSE 3
        END as match_type
      FROM product_categories
      WHERE is_searchable = 1
        AND approved = 1
        AND (category_name LIKE ? OR canonical_name LIKE ?)
      ORDER BY match_type ASC, search_priority DESC, product_count DESC
      LIMIT 10
    `, [prefixTerm, prefixTerm, searchTerm, searchTerm]);

    res.json(rows);
  } catch (error) {
    console.error("[PRODUCT CATEGORIES] Error searching categories:", error);
    res.status(500).json({ error: "Failed to search categories" });
  }
}

/**
 * Search categories for sidebar suggestions
 * Returns grouped canonical categories matching query
 * Match priority: canonical_name prefix, canonical_name contains, category_name contains
 * Filters: is_active=1 AND approved=1
 * Returns: canonical_name, canonical_slug, total_count (grouped)
 * Order: total_count DESC
 * Limit: none (returns all matching categories)
 */
export async function searchSidebarCategories(req, res) {
  try {
    const keyword = req.query.keyword || req.query.q;

    if (!keyword || keyword.trim().length < 1) {
      return res.json([]);
    }

    const productColumns = await getProductsColumnsResolved();

    // 🔥 luôn join vehicle nếu có filter
    const joinV = listingQueryNeedsVehicleFitmentJoin(req.query);
    const fromSql = buildProductListingJoinSql(productColumns, joinV);

    // 🔥 dùng chung filter với product (KEY POINT)
    const { where, params } = buildProductListFilters(productColumns, {
      ...req.query,
      keyword, // 🔥 ép keyword vào filter
    });

    const [rows] = await pool.query(`
      SELECT
        COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name) AS canonical_name,
        COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug) AS canonical_slug,
        COUNT(DISTINCT ${productColumns.idExpr("p")}) AS total_count
      ${fromSql}
      ${where}
      GROUP BY
        COALESCE(NULLIF(pc.canonical_name, ''), pc.category_name),
        COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug)
      HAVING total_count > 0
      ORDER BY total_count DESC
    `, params);

    return res.json(rows);

  } catch (error) {
    console.error("[PRODUCT CATEGORIES] Error:", error);
    res.status(500).json({ error: "Failed" });
  }
}

/**
 * Get a single category by slug
 */
export async function getProductCategoryBySlug(req, res) {
  try {
    const { slug } = req.params;

    const [rows] = await pool.query(`
      SELECT 
        id,
        category_key,
        category_name,
        category_slug,
        h1,
        seo_title,
        seo_desc,
        menu_order,
        product_count,
        is_active,
        created_at,
        updated_at
      FROM product_categories
      WHERE category_slug = ? AND is_active = 1
    `, [slug]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("[PRODUCT CATEGORIES] Error fetching category by slug:", error);
    res.status(500).json({ error: "Failed to fetch category" });
  }
}
