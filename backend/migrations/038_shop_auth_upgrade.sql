-- Shop auth upgrade: status ENUM + password reset + refresh tokens
-- Idempotent where possible

-- 1) Expand shop_accounts.status (keep blocked for legacy admin API)
ALTER TABLE shop_accounts
  MODIFY COLUMN status ENUM(
    'pending',
    'active',
    'blocked',
    'suspended',
    'deleted'
  ) NOT NULL DEFAULT 'pending';

-- 2) Password reset tokens (hashed)
CREATE TABLE IF NOT EXISTS shop_password_reset_tokens (
  id BIGINT NOT NULL AUTO_INCREMENT,
  account_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_shop_reset_token_hash (token_hash),
  KEY idx_shop_reset_account (account_id, expires_at),
  CONSTRAINT fk_shop_reset_account
    FOREIGN KEY (account_id) REFERENCES shop_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3) Refresh tokens (hashed)
CREATE TABLE IF NOT EXISTS shop_refresh_tokens (
  id BIGINT NOT NULL AUTO_INCREMENT,
  account_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent VARCHAR(512) NULL DEFAULT NULL,
  ip VARCHAR(45) NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_shop_refresh_token_hash (token_hash),
  KEY idx_shop_refresh_account (account_id),
  CONSTRAINT fk_shop_refresh_account
    FOREIGN KEY (account_id) REFERENCES shop_accounts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
