-- RFQ auto-wave delayed dispatch jobs (per RFQ queue; no global RFQ cron).
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS rfq_auto_wave_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rfq_request_id BIGINT UNSIGNED NOT NULL,
  round_sequence INT UNSIGNED NOT NULL COMMENT '2 = first delayed wave after open dispatch; increments for chained rounds',
  idempotency_key CHAR(64) NOT NULL,
  status ENUM('queued', 'processing', 'sent', 'skipped', 'dead') NOT NULL DEFAULT 'queued',
  run_at DATETIME(3) NOT NULL,
  locked_until DATETIME(3) NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  skip_reason VARCHAR(128) NULL,
  last_error VARCHAR(512) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rfq_auto_wave_idem (idempotency_key),
  KEY idx_rfq_auto_wave_due (status, run_at, id),
  CONSTRAINT fk_rfq_auto_wave_rfq FOREIGN KEY (rfq_request_id) REFERENCES rfq_requests (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK (manual): DROP TABLE IF EXISTS rfq_auto_wave_jobs;
