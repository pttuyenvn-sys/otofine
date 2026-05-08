-- Migration: Add canonical columns to product_categories table
-- This adds canonical_name and canonical_slug for merging directional variants

ALTER TABLE product_categories
ADD COLUMN canonical_name VARCHAR(255) DEFAULT NULL COMMENT 'Canonical name for menu (e.g., "Giảm xóc" merges "Giảm xóc trước/sau")',
ADD COLUMN canonical_slug VARCHAR(255) DEFAULT NULL COMMENT 'URL slug for canonical category',
ADD INDEX idx_canonical_slug (canonical_slug);
