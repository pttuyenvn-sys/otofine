SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND INDEX_NAME = 'idx_products_risk_evaluated_at'
);

SET @sql_drop_idx := IF(
  @idx_exists > 0,
  "DROP INDEX idx_products_risk_evaluated_at ON products",
  "SELECT 1"
);

PREPARE stmt_drop_idx FROM @sql_drop_idx;
EXECUTE stmt_drop_idx;
DEALLOCATE PREPARE stmt_drop_idx;

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'risk_evaluated_at'
);

SET @sql_drop_col := IF(
  @col_exists > 0,
  "ALTER TABLE products DROP COLUMN risk_evaluated_at",
  "SELECT 1"
);

PREPARE stmt_drop_col FROM @sql_drop_col;
EXECUTE stmt_drop_col;
DEALLOCATE PREPARE stmt_drop_col;
