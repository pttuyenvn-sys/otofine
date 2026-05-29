-- =============================================================================
-- 066_seller_product_governance.sql
-- Seller soft-delete + extended moderation lifecycle states
-- =============================================================================

SET @col_deleted_at := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'seller_deleted_at'
);

SET @sql_add_deleted_at := IF(
  @col_deleted_at = 0,
  "ALTER TABLE products ADD COLUMN seller_deleted_at DATETIME NULL DEFAULT NULL AFTER moderation_status",
  "SELECT 1"
);
PREPARE stmt FROM @sql_add_deleted_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Extend moderation_status enum (additive: archived, deleted)
SET @enum_has_archived := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'moderation_status'
    AND COLUMN_TYPE LIKE '%archived%'
);

SET @sql_enum := IF(
  @enum_has_archived = 0,
  "ALTER TABLE products MODIFY COLUMN moderation_status ENUM('draft','pending_review','approved','rejected','hidden','archived','deleted') NOT NULL DEFAULT 'draft'",
  "SELECT 1"
);
PREPARE stmt2 FROM @sql_enum;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;

SET @idx_deleted := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND INDEX_NAME = 'idx_products_seller_deleted_at'
);

SET @sql_idx := IF(
  @idx_deleted = 0,
  "CREATE INDEX idx_products_seller_deleted_at ON products (seller_deleted_at)",
  "SELECT 1"
);
PREPARE stmt3 FROM @sql_idx;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;
