-- Migration: Create product_categories table
-- This table serves as a smart category layer between products and frontend menu

CREATE TABLE IF NOT EXISTS product_categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_key VARCHAR(100) NOT NULL UNIQUE COMMENT 'Normalized key for category (e.g., "can-truoc")',
  category_name VARCHAR(255) NOT NULL COMMENT 'Display name (e.g., "Cản trước")',
  category_slug VARCHAR(255) NOT NULL UNIQUE COMMENT 'URL slug (e.g., "can-truoc-o-to")',
  canonical_name VARCHAR(255) DEFAULT NULL COMMENT 'Canonical name for menu (e.g., "Giảm xóc" merges "Giảm xóc trước/sau")',
  canonical_slug VARCHAR(255) DEFAULT NULL COMMENT 'URL slug for canonical category',
  h1 VARCHAR(255) DEFAULT NULL COMMENT 'SEO H1 title for listing pages',
  seo_title VARCHAR(255) DEFAULT NULL COMMENT 'Page title for SEO',
  seo_desc TEXT DEFAULT NULL COMMENT 'Meta description for SEO',
  menu_order INT UNSIGNED DEFAULT 0 COMMENT 'Order in frontend menu (lower = first)',
  product_count INT UNSIGNED DEFAULT 0 COMMENT 'Number of products in this category',
  is_active TINYINT(1) DEFAULT 1 COMMENT 'Whether category is visible in menu',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_menu_order (menu_order, product_count),
  INDEX idx_slug (category_slug),
  INDEX idx_canonical_slug (canonical_slug),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Smart category layer for product grouping';
