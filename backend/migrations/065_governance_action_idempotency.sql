-- =============================================================================
-- 065_governance_action_idempotency.sql
-- Additive idempotency store for shop governance actions (SAFE MODE).
-- =============================================================================

CREATE TABLE IF NOT EXISTS governance_action_idempotency (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  idempotency_key VARCHAR(191) NOT NULL,
  shop_id BIGINT NOT NULL,
  action VARCHAR(64) NOT NULL,
  action_id VARCHAR(36) NOT NULL,
  response_json JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_governance_idempotency (idempotency_key, shop_id, action),
  INDEX idx_governance_idempotency_shop (shop_id, action),
  INDEX idx_governance_idempotency_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
