/**
 * SEARCH-INVERTED-INDEX-BUILDER-OPTIMIZATION-01 — ensure inverted index schema + token hash column.
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').Connection} db
 */
export async function ensureSearchTokenIndexSchema(db) {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  const migration = fs.readFileSync(
    path.join(__dirname, "../../../migrations/074_search_token_index.sql"),
    "utf8",
  );
  await db.query(migration);

  const [hashCol] = await db.query(
    `
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'product_search_index'
      AND COLUMN_NAME = 'inverted_token_hash'
    LIMIT 1
    `,
  );
  if (!hashCol.length) {
    await db.query(
      `
      ALTER TABLE product_search_index
        ADD COLUMN inverted_token_hash CHAR(64) NULL
          COMMENT 'SHA-256 of search_token_index token set for skip-rebuild'
      `,
    );
  }
}
