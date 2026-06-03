-- =============================================================================
-- 067_shop_slug_history.sql
-- Lightweight slug redirect history for storefront SEO continuity (Phase 3).
-- =============================================================================

CREATE TABLE IF NOT EXISTS shop_slug_history (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  shop_id BIGINT NOT NULL,
  old_slug VARCHAR(64) NOT NULL,
  new_slug VARCHAR(64) NOT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_shop_slug_history_old (old_slug),
  INDEX idx_shop_slug_history_shop (shop_id, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
