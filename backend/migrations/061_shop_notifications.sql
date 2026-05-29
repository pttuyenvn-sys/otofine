/* Migration 061 — create shop_notifications table (idempotent) */
SET @schema := DATABASE();

IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'shop_notifications'
) THEN
  CREATE TABLE shop_notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    shop_id BIGINT NOT NULL,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    related_entity_type VARCHAR(64) NULL,
    related_entity_id BIGINT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at DATETIME NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

  CREATE INDEX idx_shop_notifications_shop_id ON shop_notifications (shop_id);
  CREATE INDEX idx_shop_notifications_created_at ON shop_notifications (created_at);
  CREATE INDEX idx_shop_notifications_is_read ON shop_notifications (is_read);
END IF;

