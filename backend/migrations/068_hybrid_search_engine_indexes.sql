-- =====================================================================
-- Migration 068 — Hybrid search engine indexes
-- HYBRID-SEARCH-ENGINE-IMPLEMENT-01
--
-- Idempotent: skip if index already exists (duplicate name error safe to ignore).
-- FULLTEXT on product search text only — not vehicle fields.
-- =====================================================================

-- Product name + descriptions FULLTEXT
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND INDEX_NAME = 'ft_products_search_text'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE products ADD FULLTEXT INDEX ft_products_search_text (partName, shortDescription, description)',
  'SELECT ''skip ft_products_search_text'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Derived search keywords FULLTEXT
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_meta'
    AND INDEX_NAME = 'ft_product_meta_keywords'
);
SET @sql := IF(
  @idx_exists = 0,
  'ALTER TABLE product_meta ADD FULLTEXT INDEX ft_product_meta_keywords (search_keywords)',
  'SELECT ''skip ft_product_meta_keywords'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Slug equality for exact search
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'product_meta'
    AND INDEX_NAME = 'idx_product_meta_slug'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX idx_product_meta_slug ON product_meta (slug)',
  'SELECT ''skip idx_product_meta_slug'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Normalized part number probe (shop-scoped uniqueness already exists; global lookup aid)
SET @idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'products'
    AND INDEX_NAME = 'idx_products_part_number'
);
SET @sql := IF(
  @idx_exists = 0,
  'CREATE INDEX idx_products_part_number ON products (partNumber)',
  'SELECT ''skip idx_products_part_number'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
