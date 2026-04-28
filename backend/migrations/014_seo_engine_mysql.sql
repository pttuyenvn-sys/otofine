-- Otofine SEO Engine: programmatic part pages (slug ↔ part_knowledge).
-- Idempotent: CREATE TABLE IF NOT EXISTS only.

CREATE TABLE IF NOT EXISTS seo_routes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(191) NOT NULL,
  h1 VARCHAR(255) NOT NULL,
  part_knowledge_id BIGINT UNSIGNED NOT NULL,
  car_model_id BIGINT UNSIGNED NULL,
  page_type VARCHAR(50) DEFAULT 'part',
  canonical_url VARCHAR(255) NULL,
  priority_score INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_seo_routes_slug (slug),
  KEY idx_seo_routes_part_knowledge (part_knowledge_id),
  KEY idx_seo_routes_car_model (car_model_id),
  KEY idx_seo_routes_page_type (page_type),
  KEY idx_seo_routes_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS seo_page_cache (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  route_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NULL,
  meta_description TEXT NULL,
  intro_html LONGTEXT NULL,
  article_html LONGTEXT NULL,
  faq_json JSON NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_seo_page_cache_route (route_id),
  KEY idx_seo_page_cache_route (route_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
