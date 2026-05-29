-- =============================================================================
-- 064_products_risk_evaluated_at.sql
-- Governance Stability Sprint: track last risk evaluation timestamp per product.
-- Additive-only, idempotent.
-- =============================================================================

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'risk_evaluated_at'
);

SET @sql_add_col := IF(
  @col_exists = 0,
  "ALTER TABLE products ADD COLUMN risk_evaluated_at DATETIME NULL DEFAULT NULL",
  "SELECT 1"
);

PREPARE stmt_add_col FROM @sql_add_col;
EXECUTE stmt_add_col;
DEALLOCATE PREPARE stmt_add_col;

SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND INDEX_NAME = 'idx_products_risk_evaluated_at'
);

SET @sql_add_idx := IF(
  @idx_exists = 0,
  "CREATE INDEX idx_products_risk_evaluated_at ON products (risk_evaluated_at)",
  "SELECT 1"
);

PREPARE stmt_add_idx FROM @sql_add_idx;
EXECUTE stmt_add_idx;
DEALLOCATE PREPARE stmt_add_idx;
