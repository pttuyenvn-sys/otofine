import { pool } from "../config/db.js";
import { legacySlugForId } from "../utils/productSlug.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import {
  collectSynonymPhrasesForProduct,
  tokenizePartName,
} from "../utils/partSynonyms.js";

function stripHtml(html = "") {
  return String(html)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NORM_PN_EXPR = `LOWER(TRIM(REGEXP_REPLACE(COALESCE(p.partName, ''), '\\s+', ' ')))`;

/** Tiểu mục “danh mục”: 2 từ đầu của partName (không dùng full partName — trước đây gần như không trùng giữa SKU khác nhau). */
function twoWordCategoryKey(partName) {
  const norm = stripHtml(partName || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!norm) return "";
  const w = norm.split(" ").filter(Boolean);
  if (w.length >= 2) return `${w[0]} ${w[1]}`;
  return w[0] || "";
}

const TIER = {
  SAME_CATEGORY_PREFIX: 1,
  NAME_LIKE: 2,
  SAME_CAR_MODEL: 3,
  SAME_BRAND: 4,
  SAME_YEAR_WINDOW: 5,
  FALLBACK_NEW: 6,
};

/**
 * @param {number} productId
 * @param {{ limit?: number }} [opts]
 */
export async function getRelatedProductsForDetail(productId, opts = {}) {
  const limit = Math.min(24, Math.max(1, Number(opts.limit) || 12));
  const poolSize = Math.min(80, Math.max(limit * 4, 32));
  const id = Number(productId);
  if (!Number.isFinite(id) || id < 1) return [];

  const [[anchor]] = await pool.query(
    `
    SELECT
      p.id,
      p.partNumber,
      p.partName,
      p.shortDescription,
      p.shopId
    FROM products p
    WHERE p.id = ?
    LIMIT 1
    `,
    [id],
  );

  if (!anchor) return [];

  const _pcCols = await getProductsColumnsResolved();
  const pu = _pcCols.orderExprQualified("p");

  const r2Base = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");

  const mapRow = (r) => {
    const pn = String(r.partNumber ?? "")
      .trim()
      .toUpperCase();
    return {
      id: r.id,
      slug: r.slug || legacySlugForId(r.id),
      partNumber: r.partNumber,
      partName: r.partName,
      shortDescription: r.shortDescription,
      price: r.price != null ? Number(r.price) : null,
      shopId: r.shopId,
      shopName: r.shopName,
      image:
        r2Base && r.shopId && pn
          ? `${r2Base}/shops/${r.shopId}/${pn}.webp`
          : null,
    };
  };

  /**
   * @type {Map<number, { r: any, tier: number, t: number }>}
   */
  const byId = new Map();

  const consider = (rows, tier) => {
    for (const r of rows) {
      const pid = Number(r.id);
      if (!Number.isFinite(pid) || pid === id) continue;
      const t = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
      const cur = byId.get(pid);
      if (!cur || tier < cur.tier) {
        byId.set(pid, { r, tier, t });
      }
    }
  };

  const cat2 = twoWordCategoryKey(anchor.partName);
  if (cat2) {
    const [rows] = await pool.query(
      `
      SELECT p.id, p.partNumber, p.partName, p.price, p.shortDescription, p.shopId,
             s.name AS shopName, ${pu} AS updatedAt
      FROM products p
      LEFT JOIN shops s ON s.id = p.shopId
      WHERE p.id <> ?
        AND SUBSTRING_INDEX(${NORM_PN_EXPR}, ' ', 2) = ?
      ORDER BY ${pu} DESC
      LIMIT ${poolSize}
      `,
      [id, cat2],
    );
    consider(rows, TIER.SAME_CATEGORY_PREFIX);
  }

  const syn = collectSynonymPhrasesForProduct(
    anchor.partName,
    stripHtml(anchor.shortDescription || ""),
  );
  const tokens = tokenizePartName(anchor.partName);

  let carModels = [];
  try {
    const [cm] = await pool.query(
      `
      SELECT DISTINCT
        LOWER(TRIM(cm.ten_xe)) AS ten,
        LOWER(TRIM(cm.hang_xe)) AS hang
      FROM product_car_applications pca
      INNER JOIN car_models cm ON cm.id = pca.carModelId
      WHERE pca.productId = ?
        AND (cm.ten_xe IS NOT NULL AND TRIM(cm.ten_xe) <> '')
      LIMIT 12
      `,
      [id],
    );
    carModels = cm;
  } catch {
    carModels = [];
  }

  const fromCars = carModels
    .flatMap((m) => [m.ten, m.hang])
    .filter((x) => x && String(x).length >= 2);
  const phrases = [...new Set([...syn, ...tokens, ...fromCars])].filter(
    (p) => String(p).length >= 2,
  );

  if (phrases.length) {
    const slice = phrases.slice(0, 10);
    const cond = slice
      .map(
        () =>
          `(LOWER(CONCAT(IFNULL(p.partName,''), ' ', IFNULL(p.shortDescription,''))) LIKE ?)`,
      )
      .join(" OR ");
    const params = [id, ...slice.map((p) => `%${String(p).toLowerCase()}%`)];
    const [rows] = await pool.query(
      `
      SELECT p.id, p.partNumber, p.partName, p.price, p.shortDescription, p.shopId,
             s.name AS shopName, ${pu} AS updatedAt
      FROM products p
      LEFT JOIN shops s ON s.id = p.shopId
      WHERE p.id <> ?
        AND (${cond})
      ORDER BY ${pu} DESC
      LIMIT ${poolSize}
      `,
      params,
    );
    consider(rows, TIER.NAME_LIKE);
  }

  const [modelRows] = await pool.query(
    `
    SELECT p.id, p.partNumber, p.partName, p.price, p.shortDescription, p.shopId,
           s.name AS shopName, ${pu} AS updatedAt
    FROM products p
    LEFT JOIN shops s ON s.id = p.shopId
    WHERE p.id <> ?
      AND p.id IN (
        SELECT pca.productId FROM product_car_applications pca
        INNER JOIN car_models cm ON cm.id = pca.carModelId
        WHERE CONCAT(cm.hang_xe, '|', cm.ten_xe) IN (
          SELECT DISTINCT CONCAT(cm2.hang_xe, '|', cm2.ten_xe)
          FROM product_car_applications pca2
          INNER JOIN car_models cm2 ON cm2.id = pca2.carModelId
          WHERE pca2.productId = ?
        )
      )
    ORDER BY ${pu} DESC
    LIMIT ${poolSize}
    `,
    [id, id],
  );
  consider(modelRows, TIER.SAME_CAR_MODEL);

  const [brandRows] = await pool.query(
    `
    SELECT p.id, p.partNumber, p.partName, p.price, p.shortDescription, p.shopId,
           s.name AS shopName, ${pu} AS updatedAt
    FROM products p
    LEFT JOIN shops s ON s.id = p.shopId
    WHERE p.id <> ?
      AND p.id IN (
        SELECT pca.productId FROM product_car_applications pca
        INNER JOIN car_models cm ON cm.id = pca.carModelId
        WHERE cm.hang_xe IN (
          SELECT DISTINCT cm2.hang_xe
          FROM product_car_applications pca2
          INNER JOIN car_models cm2 ON cm2.id = pca2.carModelId
          WHERE pca2.productId = ?
        )
      )
    ORDER BY ${pu} DESC
    LIMIT ${poolSize}
    `,
    [id, id],
  );
  consider(brandRows, TIER.SAME_BRAND);

  const [yearRows] = await pool.query(
    `
    SELECT p.id, p.partNumber, p.partName, p.price, p.shortDescription, p.shopId,
           s.name AS shopName, ${pu} AS updatedAt
    FROM products p
    LEFT JOIN shops s ON s.id = p.shopId
    WHERE p.id <> ?
      AND EXISTS (
        SELECT 1
        FROM product_car_applications pca1
        INNER JOIN product_car_applications pca0
          ON pca0.productId = ?
         AND pca0.carModelId = pca1.carModelId
         AND pca1.productId = p.id
         AND (
           COALESCE(pca1.year_to, 3000) >= COALESCE(pca0.year_from, 0)
           AND COALESCE(pca1.year_from, 0) <= COALESCE(pca0.year_to, 3000)
         )
      )
    ORDER BY ${pu} DESC
    LIMIT ${poolSize}
    `,
    [id, id],
  );
  consider(yearRows, TIER.SAME_YEAR_WINDOW);

  if (byId.size < limit) {
    const existing = [id, ...[...byId.keys()]];
    const ph = existing.map(() => "?").join(",");
    const [fallRows] = await pool.query(
      `
      SELECT p.id, p.partNumber, p.partName, p.price, p.shortDescription, p.shopId,
             s.name AS shopName, ${pu} AS updatedAt
      FROM products p
      LEFT JOIN shops s ON s.id = p.shopId
      WHERE p.id NOT IN (${ph})
      ORDER BY ${pu} DESC
      LIMIT ${poolSize}
      `,
      existing,
    );
    consider(fallRows, TIER.FALLBACK_NEW);
  }

  const sorted = [...byId.values()].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return b.t - a.t;
  });

  return sorted
    .slice(0, limit)
    .map(({ r }) => mapRow(r));
}
