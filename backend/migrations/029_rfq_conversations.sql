-- RFQ conversation foundation — 1 dispatch = 1 buyer↔shop room (additive).
-- dispatch_id is the canonical conversation anchor (not rfq_request_id alone).
-- npm run migrate:rfq:conversations

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS rfq_conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rfq_request_id BIGINT UNSIGNED NOT NULL,
  dispatch_id BIGINT UNSIGNED NOT NULL,
  shop_id INT NOT NULL,
  status ENUM('active', 'closed') NOT NULL DEFAULT 'active',
  last_message_at DATETIME(3) NULL,
  last_quote_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rfq_conv_dispatch (dispatch_id),
  KEY idx_rfq_conv_shop_status (shop_id, status),
  KEY idx_rfq_conv_rfq (rfq_request_id),
  CONSTRAINT fk_rfq_conv_rfq FOREIGN KEY (rfq_request_id) REFERENCES rfq_requests (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_rfq_conv_dispatch FOREIGN KEY (dispatch_id) REFERENCES rfq_dispatches (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_rfq_conv_shop FOREIGN KEY (shop_id) REFERENCES shops (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rfq_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_type ENUM('buyer', 'shop', 'system') NOT NULL,
  sender_shop_id INT NULL,
  message_type ENUM('text', 'quote', 'image', 'system') NOT NULL,
  message_text TEXT NULL,
  attachments_json JSON NULL,
  metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_rfq_msg_conv_created (conversation_id, created_at),
  KEY idx_rfq_msg_type (message_type),
  CONSTRAINT fk_rfq_msg_conv FOREIGN KEY (conversation_id) REFERENCES rfq_conversations (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK (manual):
-- DROP TABLE IF EXISTS rfq_messages;
-- DROP TABLE IF EXISTS rfq_conversations;
