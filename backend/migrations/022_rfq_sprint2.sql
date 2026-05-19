-- RFQ Sprint 2 — seller inbox optimization + Zalo escalation queue + quote line_type
-- Run after 021. Usage: npm run migrate:rfq:sprint2

SET NAMES utf8mb4;

SET @sch := DATABASE();

-- rfq_quotes.line_type (quick quote UX)
SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'rfq_quotes' AND COLUMN_NAME = 'line_type'
);
SET @sql := IF(
  @exists = 0,
  "ALTER TABLE rfq_quotes ADD COLUMN line_type ENUM('unknown','oem','aftermarket','used','other') NOT NULL DEFAULT 'unknown' AFTER note",
  'SELECT "rfq_quotes.line_type exists" AS msg'
);
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;

CREATE TABLE IF NOT EXISTS rfq_escalation_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dispatch_id BIGINT UNSIGNED NOT NULL,
  channel ENUM('zalo') NOT NULL DEFAULT 'zalo',
  idempotency_key CHAR(64) NOT NULL,
  run_at DATETIME(3) NOT NULL,
  status ENUM('queued','processing','sent','skipped','dead') NOT NULL DEFAULT 'queued',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  skip_reason VARCHAR(64) NULL,
  last_error VARCHAR(512) NULL,
  locked_until DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_esc_job_idem (idempotency_key),
  KEY idx_esc_run (status, run_at),
  KEY idx_esc_dispatch (dispatch_id),
  CONSTRAINT fk_esc_dispatch FOREIGN KEY (dispatch_id) REFERENCES rfq_dispatches (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*
ROLLBACK (manual): DROP TABLE rfq_escalation_jobs; ALTER TABLE rfq_quotes DROP COLUMN line_type;
*/
