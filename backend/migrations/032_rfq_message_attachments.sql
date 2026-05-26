-- RFQ conversation image attachments (additive; rfq_messages.message_type = 'image').
-- npm run migrate:rfq:message-attachments

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS rfq_message_attachments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id BIGINT UNSIGNED NULL,
  conversation_id BIGINT UNSIGNED NOT NULL,
  url VARCHAR(512) NOT NULL,
  mime_type VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
  byte_size INT UNSIGNED NULL,
  width INT UNSIGNED NULL,
  height INT UNSIGNED NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_rfq_att_msg (message_id),
  KEY idx_rfq_att_conv (conversation_id),
  KEY idx_rfq_att_staged (conversation_id, message_id, created_at),
  CONSTRAINT fk_rfq_att_msg FOREIGN KEY (message_id) REFERENCES rfq_messages (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_rfq_att_conv FOREIGN KEY (conversation_id) REFERENCES rfq_conversations (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK (manual):
-- DROP TABLE IF EXISTS rfq_message_attachments;
