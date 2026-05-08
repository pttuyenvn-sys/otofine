import { pool } from "../config/db.js";
import * as redisCache from "../services/redisCache.service.js";
import { productListViewTableExists } from "../repositories/productListView.repository.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";

function normalizeText(str = "") {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function computeCategories({ brand, model, year }) {
  let sql = `
      SELECT p.partName
      FROM products p
      LEFT JOIN product_car_applications pa
        ON pa.productId = p.id
      LEFT JOIN car_models cm
        ON cm.id = pa.carModelId
      WHERE 1=1
    `;

  const params = [];

  if (brand) {
    sql += ` AND cm.hang_xe = ? `;
    params.push(brand);
  }

  if (model) {
    sql += ` AND cm.ten_xe = ? `;
    params.push(model);
  }

  if (year) {
    sql += ` AND pa.year_from <= ? AND pa.year_to >= ? `;
    params.push(year, year);
  }

  const [rows] = await pool.query(sql, params);

  const map = {};

  rows.forEach((r) => {
    const raw = r.partName || "";
    const key = normalizeText(raw);

    if (!key) return;

    if (!map[key]) {
      map[key] = {
        name: raw,
        count: 0,
      };
    }

    map[key].count += 1;
  });

  return Object.values(map)
    .sort((a, b) => b.count - a.count)
    .map((x) => {
      const text = x.name.toLowerCase().trim();

      return text.charAt(0).toUpperCase() + text.slice(1);
    });
}

export async function getCategories(req, res) {
  try {
    const { brand, model, year } = req.query;
    const cacheKey = `categories:${brand || ""}:${model || ""}:${year || ""}`;
    const ttl =
      Number(process.env.CACHE_TTL_CATEGORIES_MS) ||
      Number(process.env.CACHE_TTL_HOME_MS) ||
      60_000;

    const result = await redisCache.getOrSetJson(cacheKey, ttl, () =>
      computeCategories({ brand, model, year }),
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
}

/** Giống output list category (title case), giữ đồng bộ với getCategories. */
function formatCategoryLabel(raw) {
  const text = String(raw || "").toLowerCase().trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Top danh mục (theo partName / category_norm) — điểm từ:
 * - log(1 + số SP trong nhóm)
 * - độ “tươi” theo MAX(updatedAt) nhóm (decay ~14 ngày)
 * - searchBoost / clickBoost: placeholder 0 (mở rộng sau khi có bảng hoặc Redis)
 *
 * SQL (product_list_view, MySQL 8+):
 * WITH per_cat AS (
 *   SELECT category_norm, partName, updatedAt,
 *     COUNT(*) OVER (PARTITION BY category_norm) AS product_count,
 *     MAX(updatedAt) OVER (PARTITION BY category_norm) AS category_max_updated,
 *     ROW_NUMBER() OVER (PARTITION BY category_norm ORDER BY updatedAt DESC, productId DESC) AS rn
 *   FROM product_list_view
 *   WHERE category_norm IS NOT NULL AND TRIM(category_norm) != ''
 * )
 * SELECT ... score = 10*LN(1+cnt) + 15*EXP(-GREATEST(0,DATEDIFF(NOW(),category_max_updated))/14)
 * ORDER BY score DESC, category_norm ASC LIMIT 8
 */
async function computePopularCategoriesFromProductListView() {
  const [rows] = await pool.query(
    `
    WITH per_cat AS (
      SELECT
        category_norm,
        partName,
        updatedAt,
        COUNT(*) OVER (PARTITION BY category_norm) AS product_count,
        MAX(updatedAt) OVER (PARTITION BY category_norm) AS category_max_updated,
        ROW_NUMBER() OVER (
          PARTITION BY category_norm
          ORDER BY updatedAt DESC, productId DESC
        ) AS rn
      FROM product_list_view
      WHERE category_norm IS NOT NULL
        AND TRIM(category_norm) != ''
    )
    SELECT
      category_norm AS categoryNorm,
      partName AS samplePartName,
      product_count AS productCount,
      category_max_updated AS lastUpdatedAt,
      (
        10 * LN(1 + product_count)
        + 15 * IF(
            category_max_updated IS NULL,
            0,
            EXP(
              -GREATEST(0, DATEDIFF(UTC_TIMESTAMP(), category_max_updated)) / 14.0
            )
          )
      ) AS score
    FROM per_cat
    WHERE rn = 1
      AND product_count > 0
    ORDER BY score DESC, product_count DESC, category_norm ASC
    LIMIT 8
    `,
  );

  return (rows || []).map((r) => {
    const name = formatCategoryLabel(r.samplePartName);
    return {
      category_name: name,
      samplePartName: r.samplePartName,
      categoryNorm: r.categoryNorm,
      productCount: Number(r.productCount) || 0,
      lastUpdatedAt: r.lastUpdatedAt
        ? new Date(r.lastUpdatedAt).toISOString()
        : null,
      score:
        r.score != null && r.score !== ""
          ? Number(r.score)
          : 10 * Math.log(1 + (Number(r.productCount) || 0)),
      searchBoost: 0,
      clickBoost: 0,
    };
  });
}

/** Fallback khi không dùng được product_list_view (bảng / cột / lỗi). */
async function computePopularCategoriesFromProducts() {
  const pc = await getProductsColumnsResolved();
  const ord = pc.orderExprQualified("p");

  const [rows] = await pool.query(
    `
    WITH per_cat AS (
      SELECT
        LOWER(TRIM(REGEXP_REPLACE(p.partName, '\\s+', ' '))) AS cat_key,
        p.partName,
        ${ord} AS prod_fresh,
        p.id,
        COUNT(*) OVER (
          PARTITION BY LOWER(TRIM(REGEXP_REPLACE(p.partName, '\\s+', ' ')))
        ) AS product_count,
        MAX(${ord}) OVER (
          PARTITION BY LOWER(TRIM(REGEXP_REPLACE(p.partName, '\\s+', ' ')))
        ) AS category_max_updated,
        ROW_NUMBER() OVER (
          PARTITION BY LOWER(TRIM(REGEXP_REPLACE(p.partName, '\\s+', ' ')))
          ORDER BY ${ord} DESC, p.id DESC
        ) AS rn
      FROM products p
      INNER JOIN shops s ON s.id = p.shopId
      WHERE p.partName IS NOT NULL
        AND TRIM(p.partName) != ''
    )
    SELECT
      cat_key AS categoryNorm,
      partName AS samplePartName,
      product_count AS productCount,
      category_max_updated AS lastUpdatedAt,
      (
        10 * LN(1 + product_count)
        + 15 * IF(
            category_max_updated IS NULL,
            0,
            EXP(
              -GREATEST(0, DATEDIFF(UTC_TIMESTAMP(), category_max_updated)) / 14.0
            )
          )
      ) AS score
    FROM per_cat
    WHERE rn = 1
      AND cat_key IS NOT NULL
      AND TRIM(cat_key) != ''
      AND product_count > 0
    ORDER BY score DESC, product_count DESC, cat_key ASC
    LIMIT 8
    `,
  );

  return (rows || []).map((r) => {
    const name = formatCategoryLabel(r.samplePartName);
    return {
      category_name: name,
      samplePartName: r.samplePartName,
      categoryNorm: r.categoryNorm,
      productCount: Number(r.productCount) || 0,
      lastUpdatedAt: r.lastUpdatedAt
        ? new Date(r.lastUpdatedAt).toISOString()
        : null,
      score:
        r.score != null && r.score !== ""
          ? Number(r.score)
          : 10 * Math.log(1 + (Number(r.productCount) || 0)),
      searchBoost: 0,
      clickBoost: 0,
    };
  });
}

async function computePopularCategories() {
  const plvOk = await productListViewTableExists();
  if (plvOk) {
    try {
      return await computePopularCategoriesFromProductListView();
    } catch (err) {
      if (err.code === "ER_BAD_FIELD_ERROR" || err.code === "ER_NO_SUCH_TABLE") {
        /* fall through */
      } else {
        throw err;
      }
    }
  }
  return computePopularCategoriesFromProducts();
}

/**
 * GET /api/filter/categories/popular  (alias: /api/categories/popular)
 * Trả về top 8 danh mục; cache 6h mặc định (ENV: CACHE_TTL_POPULAR_CATEGORIES_MS).
 * invalidateProductCaches() sau import/sync xóa cache — dữ liệu cập nhật theo sản phẩm.
 */
export async function getPopularCategories(req, res) {
  try {
    const cacheKey = "categories:popular:8";
    const ttl =
      Number(process.env.CACHE_TTL_POPULAR_CATEGORIES_MS) || 6 * 60 * 60 * 1000;

    const result = await redisCache.getOrSetJson(cacheKey, ttl, () =>
      computePopularCategories(),
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
}
