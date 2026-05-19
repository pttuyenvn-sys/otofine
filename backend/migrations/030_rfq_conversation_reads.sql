-- RFQ conversation read cursors — per participant (buyer / shop).
-- Unread = opponent messages with id > last_read_message_id (indexed, no full scans).
-- Buyer rows use participant_shop_id = 0 (NULL breaks UNIQUE in MySQL).
-- npm run migrate:rfq:conversation-reads

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS rfq_conversation_reads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  participant_type ENUM('buyer', 'shop') NOT NULL,
  participant_shop_id INT NOT NULL DEFAULT 0 COMMENT 'shop id for shop; 0 for buyer',
  last_read_message_id BIGINT UNSIGNED NULL,
  last_read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rfq_conv_read_participant (conversation_id, participant_type, participant_shop_id),
  KEY idx_rfq_conv_read_last_read_at (last_read_at),
  CONSTRAINT fk_rfq_conv_read_conv FOREIGN KEY (conversation_id) REFERENCES rfq_conversations (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK (manual):
-- DROP TABLE IF EXISTS rfq_conversation_reads;
