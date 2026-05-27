-- =============================================================================
-- 057_admin_sessions.sql
-- Phase 1B Slice 5: Admin Session Governance Foundation
-- =============================================================================
-- Idempotent: CREATE TABLE IF NOT EXISTS + INSERT IGNORE
-- DDL causes implicit COMMIT in InnoDB — no transactional rollback on schema.
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_sessions (
  id                    BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,

  -- Actor (logical reference — no physical FK to survive admin deletion)
  admin_id              INT UNSIGNED      NOT NULL,

  -- Token hashes (SHA-256 hex of opaque tokens — never store plaintext)
  session_token_hash    VARCHAR(64)       NOT NULL,
  refresh_token_hash    VARCHAR(64)       NULL,
  -- NULL = token-only session (governance disabled at login time)

  -- Device / request context (informational — never trust for auth decisions)
  ip_address            VARCHAR(45)       NULL,
  user_agent            VARCHAR(512)      NULL,
  device_hint           VARCHAR(255)      NULL,
  -- Derived from user_agent: e.g. "Chrome 124 on Windows"

  -- Lifecycle fields
  created_at            DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_used_at          DATETIME(3)       NULL,
  -- Updated on successful refresh. NULL = never refreshed (access-token-only session).
  expires_at            DATETIME(3)       NOT NULL,
  -- Hard expiry: session is invalid regardless of revocation state.
  revoked_at            DATETIME(3)       NULL,
  -- NULL = active (unless expired). Non-NULL = revoked.
  revoked_by            INT UNSIGNED      NULL,
  -- NULL = self-logout or system expiry. Non-NULL = admin_id of the revoker.
  revoked_reason        VARCHAR(100)      NULL,
  -- Values: 'logout', 'refresh_rotation', 'force_logout', 'security_event', 'all_sessions'

  -- Extensible context (reserved for future MFA state)
  metadata_json         JSON              NULL,
  -- Future: { mfa_verified, mfa_method, mfa_verified_at }

  PRIMARY KEY (id),

  -- Validation lookup (must be unique — one session per token hash)
  UNIQUE INDEX uq_as_session_token  (session_token_hash),
  UNIQUE INDEX uq_as_refresh_token  (refresh_token_hash),

  -- Per-admin session management: "list active sessions for admin N"
  INDEX idx_as_admin_active         (admin_id, revoked_at, expires_at),

  -- Expiry cleanup sweep
  INDEX idx_as_expires              (expires_at),

  -- Creation time for audit queries
  INDEX idx_as_admin_created        (admin_id, created_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed the feature flag (is_enabled = 0 = hidden deployment default)
INSERT IGNORE INTO admin_feature_flags (flag_key, description, is_enabled)
VALUES (
  'ADMIN_SESSION_GOVERNANCE_ENABLED',
  'Admin session revocation, forced logout, and refresh token governance',
  0
);
