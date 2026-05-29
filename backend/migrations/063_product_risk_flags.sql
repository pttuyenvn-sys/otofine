CREATE TABLE IF NOT EXISTS product_risk_flags (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  flag_code VARCHAR(64) NOT NULL,
  severity VARCHAR(16) NOT NULL DEFAULT 'low',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product_risk_flags_product_id (product_id),
  INDEX idx_product_risk_flags_flag_code (flag_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

