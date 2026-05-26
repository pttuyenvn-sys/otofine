-- RFQ buyer reminder attribution + conversion outcomes
-- npm run migrate:rfq:reminder-attribution

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS rfq_reminder_sends (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rfq_request_id BIGINT UNSIGNED NOT NULL,
  reminder_type VARCHAR(32) NOT NULL,
  phone_hash VARCHAR(64) NULL,
  subscription_ids JSON NULL,
  sent_log_event_type VARCHAR(48) NOT NULL,
  sent_log_event_key VARCHAR(128) NOT NULL,
  onesignal_notification_id VARCHAR(64) NULL,
  sent_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_rrs_sent (sent_at),
  KEY idx_rrs_rfq_sent (rfq_request_id, sent_at),
  KEY idx_rrs_type_sent (reminder_type, sent_at),
  KEY idx_rrs_phone_sent (phone_hash, sent_at),
  CONSTRAINT fk_rrs_rfq FOREIGN KEY (rfq_request_id) REFERENCES rfq_requests (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rfq_reminder_outcomes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  send_id BIGINT UNSIGNED NOT NULL,
  outcome VARCHAR(24) NOT NULL,
  conversion_kind VARCHAR(24) NOT NULL DEFAULT '',
  subscription_id VARCHAR(128) NULL,
  metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rr_outcome (send_id, outcome, conversion_kind),
  KEY idx_rr_outcome_send (send_id),
  KEY idx_rr_outcome_type (outcome, created_at),
  CONSTRAINT fk_rr_outcome_send FOREIGN KEY (send_id) REFERENCES rfq_reminder_sends (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
