-- Auth email flow: password_reset_tokens (canonical) + auth_logs
-- Safe upgrade from shop_password_reset_tokens (038)

CREATE TABLE IF NOT EXISTS auth_logs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  account_id INT NULL DEFAULT NULL,
  event_type VARCHAR(64) NOT NULL,
  ip_address VARCHAR(45) NULL DEFAULT NULL,
  user_agent VARCHAR(512) NULL DEFAULT NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_auth_logs_account (account_id, created_at),
  KEY idx_auth_logs_event (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Rename legacy table when present
SET @has_shop_prt := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'shop_password_reset_tokens'
);
SET @has_prt := (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'password_reset_tokens'
);

SET @sql_rename := IF(
  @has_shop_prt > 0 AND @has_prt = 0,
  'RENAME TABLE shop_password_reset_tokens TO password_reset_tokens',
  'SELECT 1'
);
PREPARE stmt_rename FROM @sql_rename;
EXECUTE stmt_rename;
DEALLOCATE PREPARE stmt_rename;

-- Create fresh table if neither existed
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT NOT NULL AUTO_INCREMENT,
  account_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45) NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_prt_token_hash (token_hash),
  KEY idx_prt_account_expires (account_id, expires_at),
  KEY idx_prt_account_active (account_id, used_at, expires_at),
  CONSTRAINT fk_prt_account
    FOREIGN KEY (account_id) REFERENCES shop_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Add ip_address to renamed legacy table
SET @col_ip := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'password_reset_tokens'
    AND column_name = 'ip_address'
);
SET @sql_ip := IF(
  @col_ip = 0,
  'ALTER TABLE password_reset_tokens ADD COLUMN ip_address VARCHAR(45) NULL DEFAULT NULL AFTER created_at',
  'SELECT 1'
);
PREPARE stmt_ip FROM @sql_ip;
EXECUTE stmt_ip;
DEALLOCATE PREPARE stmt_ip;

-- Drop legacy name if rename did not run but both exist (manual cleanup)
SET @sql_drop := IF(
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name = 'shop_password_reset_tokens') > 0
  AND (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name = 'password_reset_tokens') > 0,
  'DROP TABLE shop_password_reset_tokens',
  'SELECT 1'
);
PREPARE stmt_drop FROM @sql_drop;
EXECUTE stmt_drop;
DEALLOCATE PREPARE stmt_drop;
