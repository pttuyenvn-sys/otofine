-- =====================================================================
-- Migration 070 — product_search_index sync metadata
-- SEARCH-INDEX-SYNC-IMPLEMENT-01
-- =====================================================================

SET @col_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_search_index'
    AND COLUMN_NAME = 'document_hash'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE product_search_index
     ADD COLUMN document_hash CHAR(64) NULL COMMENT ''SHA-256 of searchable fields'',
     ADD COLUMN search_version SMALLINT UNSIGNED NOT NULL DEFAULT 1 COMMENT ''Schema version for CLI rebuild'',
     ADD KEY idx_psi_search_version (search_version)',
  'SELECT ''skip 070 columns'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
