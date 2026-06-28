-- SEARCH-INVERTED-INDEX-01 — inverted token index on product_search_index
-- Applied idempotently via ensureSearchTokenIndexSchema.js

CREATE TABLE IF NOT EXISTS search_token_index (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token VARCHAR(255) NOT NULL COMMENT 'Folded lowercase token',
  token_type ENUM(
    'WORD',
    'PHRASE',
    'OEM',
    'BRAND',
    'MODEL',
    'CATEGORY',
    'SYNONYM',
    'LOCATION',
    'YEAR'
  ) NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  weight SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  source VARCHAR(64) NOT NULL COMMENT 'Field or alias origin',
  position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  document_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_sti_product_token_type (product_id, token, token_type),
  KEY idx_sti_token_lookup (token, token_type, product_id),
  KEY idx_sti_product (product_id),
  KEY idx_sti_version (document_version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
