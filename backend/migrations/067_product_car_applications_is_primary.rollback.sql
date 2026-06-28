-- Rollback 067 — drops is_primary column and index (destructive to primary lock data).

SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_car_applications'
    AND INDEX_NAME = 'idx_pca_product_primary'
);

SET @sql_drop_idx := IF(
  @idx_exists > 0,
  "DROP INDEX idx_pca_product_primary ON product_car_applications",
  "SELECT 1"
);

PREPARE stmt_drop_idx FROM @sql_drop_idx;
EXECUTE stmt_drop_idx;
DEALLOCATE PREPARE stmt_drop_idx;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_car_applications'
    AND COLUMN_NAME = 'is_primary'
);

SET @sql_drop_col := IF(
  @col_exists > 0,
  "ALTER TABLE product_car_applications DROP COLUMN is_primary",
  "SELECT 1"
);

PREPARE stmt_drop_col FROM @sql_drop_col;
EXECUTE stmt_drop_col;
DEALLOCATE PREPARE stmt_drop_col;
