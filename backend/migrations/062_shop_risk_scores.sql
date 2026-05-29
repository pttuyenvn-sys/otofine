/* Migration 062 — create shop_risk_scores table (idempotent) */
SET @schema := DATABASE();

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'shop_risk_scores'
) THEN
  CREATE TABLE shop_risk_scores (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shop_id BIGINT NOT NULL,
    risk_score INT NOT NULL DEFAULT 0,
    risk_level VARCHAR(32) NOT NULL DEFAULT 'low',
    rejected_products_count INT NOT NULL DEFAULT 0,
    prohibited_content_count INT NOT NULL DEFAULT 0,
    duplicate_listing_count INT NOT NULL DEFAULT 0,
    spam_reject_count INT NOT NULL DEFAULT 0,
    hidden_products_count INT NOT NULL DEFAULT 0,
    last_calculated_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  CREATE INDEX idx_shop_risk_scores_shop_id ON shop_risk_scores (shop_id);
  CREATE INDEX idx_shop_risk_scores_risk_level ON shop_risk_scores (risk_level);
  CREATE INDEX idx_shop_risk_scores_risk_score ON shop_risk_scores (risk_score);
END IF;

