-- Buyer push comeback: preferences + send deduplication log
-- npm run migrate:rfq:push-buyer-comeback

SET NAMES utf8mb4;

ALTER TABLE rfq_push_subscriptions
  ADD COLUMN pref_messages TINYINT(1) NOT NULL DEFAULT 1 AFTER viewer_path,
  ADD COLUMN pref_quotes TINYINT(1) NOT NULL DEFAULT 1 AFTER pref_messages,
  ADD COLUMN pref_reminders TINYINT(1) NOT NULL DEFAULT 1 AFTER pref_quotes;

CREATE TABLE IF NOT EXISTS rfq_push_sent_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rfq_request_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(32) NOT NULL,
  event_key VARCHAR(128) NOT NULL,
  sent_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rfq_push_sent (rfq_request_id, event_type, event_key),
  KEY idx_rfq_push_sent_rfq (rfq_request_id),
  CONSTRAINT fk_rfq_push_sent_rfq FOREIGN KEY (rfq_request_id) REFERENCES rfq_requests (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
