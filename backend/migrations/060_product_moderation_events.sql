CREATE TABLE IF NOT EXISTS product_moderation_events (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT NOT NULL,
  moderator_admin_id BIGINT NULL,
  old_status VARCHAR(64) NOT NULL,
  new_status VARCHAR(64) NOT NULL,
  reject_reason VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product_moderation_events_product_id (product_id),
  INDEX idx_product_moderation_events_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;