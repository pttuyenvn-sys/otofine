-- Migration: Add category visibility columns to product_categories
-- Allows filtering categories for menu vs search

ALTER TABLE product_categories
ADD COLUMN is_menu TINYINT(1) DEFAULT 0 COMMENT 'Show in main menu',
ADD COLUMN approved TINYINT(1) DEFAULT 1 COMMENT 'Approved for display',
ADD COLUMN is_searchable TINYINT(1) DEFAULT 1 COMMENT 'Searchable in autocomplete',
ADD COLUMN search_priority INT UNSIGNED DEFAULT 0 COMMENT 'Priority for search ranking (higher = first)',
ADD INDEX idx_menu (is_menu, approved),
ADD INDEX idx_search (is_searchable, approved, search_priority DESC);
