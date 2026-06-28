/**
 * Apply product_search_index schema (069 table + 070 sync columns).
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').Connection} db
 */
export async function ensureSearchIndexSchema(db) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  const migration069 = fs.readFileSync(
    path.join(__dirname, "../../migrations/069_product_search_index.sql"),
    "utf8",
  );
  await db.query(migration069);

  const [hashCol] = await db.query(
    `
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'product_search_index'
      AND COLUMN_NAME = 'document_hash'
    LIMIT 1
    `,
  );
  if (!hashCol.length) {
    await db.query(
      `
      ALTER TABLE product_search_index
        ADD COLUMN document_hash CHAR(64) NULL COMMENT 'SHA-256 of searchable fields',
        ADD COLUMN search_version SMALLINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Schema version for CLI rebuild',
        ADD KEY idx_psi_search_version (search_version)
      `,
    );
  }

  const runtimeCols = [
    ["canonical_slug", "VARCHAR(255) NULL COMMENT 'Denormalized category slug'"],
    ["search_priority", "SMALLINT NOT NULL DEFAULT 0 COMMENT 'Category search_priority'"],
    ["part_number_norm", "VARCHAR(128) NULL COMMENT 'Normalized part number for exact match'"],
  ];
  for (const [name, ddl] of runtimeCols) {
    const [exists] = await db.query(
      `
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_search_index'
        AND COLUMN_NAME = ?
      LIMIT 1
      `,
      [name],
    );
    if (!exists.length) {
      await db.query(`ALTER TABLE product_search_index ADD COLUMN ${name} ${ddl}`);
    }
  }

  const documentCols = [
    ["title", "VARCHAR(512) NULL COMMENT 'Popup display title (identity h1)'"],
    ["canonical_path", "VARCHAR(512) NULL COMMENT 'Product SEO path'"],
    ["canonical_url", "VARCHAR(768) NULL COMMENT 'Absolute product SEO URL'"],
    ["thumbnail_url", "VARCHAR(512) NULL COMMENT 'Primary product image URL'"],
    ["brand_slug", "VARCHAR(128) NULL COMMENT 'Slugified brand name'"],
    ["model_slug", "VARCHAR(128) NULL COMMENT 'Slugified model name'"],
    ["vehicle_label", "VARCHAR(255) NULL COMMENT 'Formatted fitment label'"],
    ["category_slug", "VARCHAR(255) NULL COMMENT 'Category canonical slug'"],
    ["shop_name", "VARCHAR(255) NULL COMMENT 'Shop display name'"],
    ["price", "DECIMAL(15,2) NULL COMMENT 'Product price for popup'"],
    ["stock_status", "VARCHAR(32) NOT NULL DEFAULT 'out_of_stock' COMMENT 'in_stock | out_of_stock'"],
    ["popularity_score", "BIGINT NOT NULL DEFAULT 0 COMMENT 'Freshness tie-break unix ms'"],
    ["search_score", "INT NOT NULL DEFAULT 0 COMMENT 'Reserved ranking hint'"],
    ["primary_brand_name", "VARCHAR(128) NULL COMMENT 'Primary fitment brand for popup display'"],
    ["primary_model_name", "VARCHAR(128) NULL COMMENT 'Primary fitment model for popup display'"],
    ["primary_year_from", "SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Primary fitment year from'"],
    ["primary_year_to", "SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Primary fitment year to'"],
  ];
  for (const [name, ddl] of documentCols) {
    const [exists] = await db.query(
      `
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_search_index'
        AND COLUMN_NAME = ?
      LIMIT 1
      `,
      [name],
    );
    if (!exists.length) {
      await db.query(`ALTER TABLE product_search_index ADD COLUMN ${name} ${ddl}`);
    }
  }

  const matcherCols = [
    ["search_tokens", "MEDIUMTEXT NULL COMMENT 'Space-padded raw search tokens'"],
    ["normalized_tokens", "MEDIUMTEXT NULL COMMENT 'Space-padded folded tokens for matcher retrieval'"],
    ["synonym_tokens", "MEDIUMTEXT NULL COMMENT 'Space-padded synonym-expanded tokens'"],
  ];
  for (const [name, ddl] of matcherCols) {
    const [exists] = await db.query(
      `
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_search_index'
        AND COLUMN_NAME = ?
      LIMIT 1
      `,
      [name],
    );
    if (!exists.length) {
      await db.query(`ALTER TABLE product_search_index ADD COLUMN ${name} ${ddl}`);
    }
  }
}
