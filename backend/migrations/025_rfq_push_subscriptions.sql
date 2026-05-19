-- RFQ buyer web push subscriptions (anonymous viewer / no JWT)
-- Run: npm run migrate:rfq:push-subscriptions

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS rfq_push_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rfq_request_id BIGINT UNSIGNED NOT NULL,
  onesignal_subscription_id VARCHAR(128) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rfq_push_rfq_sub (rfq_request_id, onesignal_subscription_id),
  KEY idx_rfq_push_rfq (rfq_request_id),
  CONSTRAINT fk_rfq_push_rfq FOREIGN KEY (rfq_request_id) REFERENCES rfq_requests (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
