-- =====================================================================
-- Migration 069 — product_search_index (SEARCH-INDEX-ARCHITECTURE-PHASE-01)
-- Dedicated search index table. Phase 1: schema only — no runtime search usage.
-- One document per product × vehicle fitment row.
-- =====================================================================

CREATE TABLE IF NOT EXISTS product_search_index (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id      BIGINT UNSIGNED NOT NULL,
  category_id     BIGINT UNSIGNED NULL,
  category_name   VARCHAR(255)    NULL,
  brand_id        BIGINT UNSIGNED NULL COMMENT 'Reserved; brand resolved via car_models.hang_xe today',
  brand_name      VARCHAR(128)    NULL,
  model_id        BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'car_models.id; 0 = no fitment',
  model_name      VARCHAR(128)    NULL,
  year_from       SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 = unknown',
  year_to         SMALLINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 = unknown',
  location_id     BIGINT UNSIGNED NULL COMMENT 'shops.provinceId',
  location_name   VARCHAR(255)    NULL,
  part_number     VARCHAR(128)    NULL,
  product_name    VARCHAR(512)    NULL,
  search_keywords TEXT            NULL,
  search_text     TEXT            NULL COMMENT 'Denormalized text for FULLTEXT — product fields only',
  status          ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  updated_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_product_search_vehicle (
    product_id,
    model_id,
    year_from,
    year_to
  ),
  KEY idx_psi_product_id (product_id),
  KEY idx_psi_brand_id (brand_id),
  KEY idx_psi_model_id (model_id),
  KEY idx_psi_category_id (category_id),
  KEY idx_psi_location_id (location_id),
  KEY idx_psi_part_number (part_number),
  KEY idx_psi_status (status),
  FULLTEXT KEY ft_psi_search_text (search_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Search index documents: one row per product × vehicle fitment';
