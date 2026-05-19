-- Otofine RFQ Sprint 1 MVP — additive only, MySQL 8+
-- Run manually or: npm run migrate:rfq
-- Rollback: see bottom comment block

SET NAMES utf8mb4;

-- 1. customer_profiles
CREATE TABLE IF NOT EXISTS customer_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  phone_e164 VARCHAR(20) NOT NULL,
  phone_hash CHAR(64) NOT NULL,
  display_name VARCHAR(128) NULL,
  verified_at DATETIME(3) NOT NULL,
  status ENUM('active', 'blocked') NOT NULL DEFAULT 'active',
  metadata_json JSON NULL,
  deleted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_profiles_phone_e164 (phone_e164),
  UNIQUE KEY uq_customer_profiles_phone_hash (phone_hash),
  KEY idx_customer_profiles_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. customer_vehicles
CREATE TABLE IF NOT EXISTS customer_vehicles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_profile_id BIGINT UNSIGNED NOT NULL,
  brand_label VARCHAR(128) NULL,
  model_label VARCHAR(128) NULL,
  year SMALLINT UNSIGNED NULL,
  car_model_id BIGINT UNSIGNED NULL,
  nickname VARCHAR(64) NULL,
  deleted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_cv_profile (customer_profile_id),
  CONSTRAINT fk_cv_profile FOREIGN KEY (customer_profile_id) REFERENCES customer_profiles (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. rfq_requests
CREATE TABLE IF NOT EXISTS rfq_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(32) NOT NULL,
  viewer_token_hash CHAR(64) NULL,
  status ENUM(
    'pending_otp',
    'open',
    'dispatching',
    'quoted',
    'closed',
    'expired',
    'cancelled'
  ) NOT NULL DEFAULT 'pending_otp',
  customer_profile_id BIGINT UNSIGNED NULL,
  guest_phone_e164 VARCHAR(20) NULL,
  guest_phone_hash CHAR(64) NULL,
  otp_code_hash VARCHAR(128) NULL,
  otp_expires_at DATETIME(3) NULL,
  otp_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  vehicle_json JSON NULL,
  part_description TEXT NOT NULL,
  category_key VARCHAR(128) NULL,
  location_json JSON NULL,
  images_json JSON NULL,
  expires_at DATETIME(3) NULL,
  verified_at DATETIME(3) NULL,
  deleted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_rfq_public_id (public_id),
  UNIQUE KEY uq_rfq_viewer_hash (viewer_token_hash),
  KEY idx_rfq_status_created (status, created_at),
  KEY idx_rfq_customer (customer_profile_id),
  CONSTRAINT fk_rfq_customer FOREIGN KEY (customer_profile_id) REFERENCES customer_profiles (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. rfq_dispatches
CREATE TABLE IF NOT EXISTS rfq_dispatches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rfq_request_id BIGINT UNSIGNED NOT NULL,
  shop_id INT NOT NULL,
  wave TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM(
    'pending',
    'web_notified',
    'viewed',
    'accepted',
    'quoted',
    'skipped',
    'expired',
    'failed'
  ) NOT NULL DEFAULT 'pending',
  escalation_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
  web_notified_at DATETIME(3) NULL,
  web_viewed_at DATETIME(3) NULL,
  zalo_notified_at DATETIME(3) NULL,
  sms_notified_at DATETIME(3) NULL,
  match_score DECIMAL(9, 4) NULL,
  respond_by DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_dispatch_rfq_shop (rfq_request_id, shop_id),
  KEY idx_dispatch_shop_status (shop_id, status),
  KEY idx_dispatch_rfq (rfq_request_id),
  CONSTRAINT fk_dispatch_rfq FOREIGN KEY (rfq_request_id) REFERENCES rfq_requests (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_dispatch_shop FOREIGN KEY (shop_id) REFERENCES shops (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. rfq_quotes
CREATE TABLE IF NOT EXISTS rfq_quotes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rfq_request_id BIGINT UNSIGNED NOT NULL,
  shop_id INT NOT NULL,
  status ENUM('draft', 'submitted', 'withdrawn') NOT NULL DEFAULT 'submitted',
  price_amount DECIMAL(14, 2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'VND',
  note TEXT NULL,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_quote_rfq (rfq_request_id),
  KEY idx_quote_shop (shop_id),
  CONSTRAINT fk_quote_rfq FOREIGN KEY (rfq_request_id) REFERENCES rfq_requests (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_quote_shop FOREIGN KEY (shop_id) REFERENCES shops (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. rfq_notifications
CREATE TABLE IF NOT EXISTS rfq_notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rfq_request_id BIGINT UNSIGNED NOT NULL,
  dispatch_id BIGINT UNSIGNED NULL,
  channel ENUM('in_app', 'zalo', 'sms', 'email') NOT NULL DEFAULT 'in_app',
  recipient_type ENUM('customer', 'shop') NOT NULL DEFAULT 'shop',
  recipient_shop_id INT NULL,
  payload_json JSON NOT NULL,
  status ENUM('queued', 'sent', 'failed') NOT NULL DEFAULT 'queued',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_notif_rfq (rfq_request_id),
  KEY idx_notif_dispatch (dispatch_id),
  CONSTRAINT fk_notif_rfq FOREIGN KEY (rfq_request_id) REFERENCES rfq_requests (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_notif_dispatch FOREIGN KEY (dispatch_id) REFERENCES rfq_dispatches (id)
    ON DELETE SET NULL,
  CONSTRAINT fk_notif_shop FOREIGN KEY (recipient_shop_id) REFERENCES shops (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. rfq_status_logs
CREATE TABLE IF NOT EXISTS rfq_status_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rfq_request_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  actor_type ENUM('system', 'customer', 'shop', 'admin') NOT NULL DEFAULT 'system',
  actor_shop_id INT NULL,
  metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_log_rfq_created (rfq_request_id, created_at),
  CONSTRAINT fk_log_rfq FOREIGN KEY (rfq_request_id) REFERENCES rfq_requests (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_log_shop FOREIGN KEY (actor_shop_id) REFERENCES shops (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- shops.last_seen_at (ignore duplicate column error on re-run)
SET @sch := DATABASE();
SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'last_seen_at'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE shops ADD COLUMN last_seen_at DATETIME(3) NULL, ADD KEY idx_shops_last_seen (last_seen_at)',
  'SELECT "shops.last_seen_at already exists" AS msg'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

/*
ROLLBACK (manual, staging):
SET FOREIGN_KEY_CHECKS=0;
DROP TABLE IF EXISTS rfq_status_logs;
DROP TABLE IF EXISTS rfq_notifications;
DROP TABLE IF EXISTS rfq_quotes;
DROP TABLE IF EXISTS rfq_dispatches;
DROP TABLE IF EXISTS rfq_requests;
DROP TABLE IF EXISTS customer_vehicles;
DROP TABLE IF EXISTS customer_profiles;
ALTER TABLE shops DROP COLUMN last_seen_at;
SET FOREIGN_KEY_CHECKS=1;
*/
