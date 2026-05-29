-- =============================================================================
-- 059_products_moderation_status.sql
-- Phase 3A Slice 1: Product Moderation Queue Foundation
-- =============================================================================
-- Additive-only: adds moderation_status column + index to products table.
-- Idempotent: checks INFORMATION_SCHEMA before ALTER.
-- =============================================================================

-- 1) Add moderation_status column if missing
SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND COLUMN_NAME = 'moderation_status'
);

SET @sql_add_col := IF(
  @col_exists = 0,
  "ALTER TABLE products ADD COLUMN moderation_status ENUM('draft','pending_review','approved','rejected','hidden') NOT NULL DEFAULT 'draft'",
  "SELECT 1"
);

PREPARE stmt_add_col FROM @sql_add_col;
EXECUTE stmt_add_col;
DEALLOCATE PREPARE stmt_add_col;

-- 2) Add index on moderation_status if missing
SET @idx_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND INDEX_NAME = 'idx_products_moderation_status'
);

SET @sql_add_idx := IF(
  @idx_exists = 0,
  "CREATE INDEX idx_products_moderation_status ON products (moderation_status)",
  "SELECT 1"
);

PREPARE stmt_add_idx FROM @sql_add_idx;
EXECUTE stmt_add_idx;
DEALLOCATE PREPARE stmt_add_idx;

