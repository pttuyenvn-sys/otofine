/**
 * Backward-compatible SQL for “product has at least one usable image”.
 *
 * Production (Otofine) stores gallery rows in `product_images`; the `products`
 * table has no image_path column. Older deployments may still have legacy
 * scalar columns — we OR them in when present (INFORMATION_SCHEMA probe).
 */

import { pool } from "../config/db.js";

/** @type {Promise<{ hasProductImages: boolean, legacyImageColumns: string[] }> | null} */
let schemaProbePromise = null;

const LEGACY_PRODUCT_IMAGE_COLUMNS = Object.freeze([
  "image_path",
  "image",
  "image_url",
  "thumbnail_url",
  "thumbnail",
  "photo",
  "main_image",
  "images",
  "gallery_json",
]);

const JSON_LIKE_IMAGE_COLUMNS = new Set(["images", "gallery_json"]);

function qualAlias(alias) {
  const clean = String(alias || "p").replace(/`/g, "");
  return `\`${clean}\``;
}

async function probeProductImageSources() {
  if (!schemaProbePromise) {
    schemaProbePromise = (async () => {
      const [[piTable]] = await pool.query(
        `
          SELECT 1 AS ok
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'product_images'
          LIMIT 1
        `,
      );

      const [productCols] = await pool.query(
        `
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'products'
        `,
      );

      const colSet = new Set(productCols.map((r) => String(r.COLUMN_NAME)));
      const legacyImageColumns = LEGACY_PRODUCT_IMAGE_COLUMNS.filter((c) => colSet.has(c));

      return {
        hasProductImages: Boolean(piTable?.ok),
        legacyImageColumns,
      };
    })().catch((err) => {
      schemaProbePromise = null;
      throw err;
    });
  }
  return schemaProbePromise;
}

/**
 * Boolean SQL expression: product row has image coverage.
 * @param {string} [productAlias]
 */
export async function getProductHasImageConditionSql(productAlias = "p") {
  const { hasProductImages, legacyImageColumns } = await probeProductImageSources();
  const a = qualAlias(productAlias);
  const idRef = `${a}.\`id\``;
  const parts = [];

  if (hasProductImages) {
    parts.push(`EXISTS (
      SELECT 1
      FROM product_images pi_cov
      WHERE pi_cov.productId = ${idRef}
        AND TRIM(COALESCE(pi_cov.url, '')) <> ''
    )`);
  }

  for (const col of legacyImageColumns) {
    const colRef = `${a}.\`${col}\``;
    if (JSON_LIKE_IMAGE_COLUMNS.has(col)) {
      parts.push(`TRIM(COALESCE(${colRef}, '')) NOT IN ('', '[]', '{}', 'null')`);
    } else {
      parts.push(`TRIM(COALESCE(${colRef}, '')) <> ''`);
    }
  }

  if (parts.length === 0) return "0=1";
  if (parts.length === 1) return parts[0];
  return `(${parts.join(" OR ")})`;
}

/**
 * Aggregate fragment for approved products with image coverage.
 * @param {string} [productAlias]
 */
export async function buildApprovedWithImageCountSumSql(productAlias = "p") {
  const hasImage = await getProductHasImageConditionSql(productAlias);
  const a = qualAlias(productAlias);
  return `SUM(
      CASE
        WHEN TRIM(LOWER(${a}.\`moderation_status\`)) = 'approved'
          AND (${hasImage})
        THEN 1 ELSE 0
      END
    ) AS approvedWithImageCount`;
}

/** @internal */
export function resetProductImageCoverageSqlCacheForTests() {
  schemaProbePromise = null;
}
