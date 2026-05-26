-- RFQ buyer history portal — OTP challenges + 30-day history sessions (no RFQ schema changes)

CREATE TABLE IF NOT EXISTS rfq_history_otp_challenges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  phone_e164 VARCHAR(20) NOT NULL,
  phone_hash CHAR(64) NOT NULL,
  otp_code_hash CHAR(64) NOT NULL,
  otp_expires_at DATETIME(3) NOT NULL,
  otp_attempts INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_rfq_history_otp_phone_hash (phone_hash),
  KEY idx_rfq_history_otp_expires (otp_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rfq_history_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  phone_e164 VARCHAR(20) NOT NULL,
  phone_hash CHAR(64) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  last_seen_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_rfq_history_token_hash (token_hash),
  KEY idx_rfq_history_session_phone_hash (phone_hash),
  KEY idx_rfq_history_session_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
