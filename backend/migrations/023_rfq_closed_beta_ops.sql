-- RFQ Closed Beta — ops analytics hooks + moderation flags + customer UX events
-- Run after 022. Usage: npm run migrate:rfq:closed-beta

SET NAMES utf8mb4;

SET @sch := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'rfq_requests' AND COLUMN_NAME = 'spam_flag'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE rfq_requests ADD COLUMN spam_flag TINYINT(1) NOT NULL DEFAULT 0, ADD KEY idx_rfq_spam (spam_flag)',
  'SELECT "rfq_requests.spam_flag exists" AS msg'
);
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS rfq_customer_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rfq_request_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(48) NOT NULL,
  metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_rfq_evt_rfq_time (rfq_request_id, created_at),
  KEY idx_rfq_evt_type_time (event_type, created_at),
  CONSTRAINT fk_rfq_cust_evt_rfq FOREIGN KEY (rfq_request_id) REFERENCES rfq_requests (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*
ROLLBACK (manual): DROP TABLE rfq_customer_events; ALTER TABLE rfq_requests DROP COLUMN spam_flag;
*/
