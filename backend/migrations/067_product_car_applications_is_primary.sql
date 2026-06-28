-- =============================================================================
-- 067_product_car_applications_is_primary.sql
-- ARCH-01G: lock primary fitment ownership (is_primary on junction table).
-- Additive + idempotent. Backfill: MIN(id) per product => is_primary = 1.
-- =============================================================================

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_car_applications'
    AND COLUMN_NAME = 'is_primary'
);

SET @sql_add_col := IF(
  @col_exists = 0,
  "ALTER TABLE product_car_applications
     ADD COLUMN is_primary TINYINT(1) NOT NULL DEFAULT 0
     AFTER year_to",
  "SELECT 1"
);

PREPARE stmt_add_col FROM @sql_add_col;
EXECUTE stmt_add_col;
DEALLOCATE PREPARE stmt_add_col;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_car_applications'
    AND INDEX_NAME = 'idx_pca_product_primary'
);

SET @sql_add_idx := IF(
  @idx_exists = 0,
  "CREATE INDEX idx_pca_product_primary
     ON product_car_applications (productId, is_primary)",
  "SELECT 1"
);

PREPARE stmt_add_idx FROM @sql_add_idx;
EXECUTE stmt_add_idx;
DEALLOCATE PREPARE stmt_add_idx;

-- Backfill: exactly one primary per product (MIN junction id).
UPDATE product_car_applications SET is_primary = 0;

UPDATE product_car_applications pca
INNER JOIN (
  SELECT productId, MIN(id) AS min_id
  FROM product_car_applications
  GROUP BY productId
) m ON m.productId = pca.productId AND pca.id = m.min_id
SET pca.is_primary = 1;
