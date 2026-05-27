-- Admin audit log table.
-- Migration: 054_admin_audit_log.sql
-- Runner: run-admin-migration.js (054 already in ADMIN_MIGRATION_FILES whitelist)
-- Idempotent: CREATE TABLE IF NOT EXISTS
--
-- Design: phase-1a-slice4-audit-design.md §3
-- No physical FKs (C4 pattern from Slice 3) — logical references only.
-- No updated_at column — append-only by design.
-- BIGINT UNSIGNED primary key for long-term scale (audit rows can reach millions).

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id                 BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,

  -- Actor fields
  admin_id           INT UNSIGNED      NULL,
  -- Logical reference to admin.id; no physical FK.
  -- NULL reserved for future system-initiated actions (job runners, etc.).
  actor_type         ENUM('admin', 'superadmin', 'system') NOT NULL DEFAULT 'admin',
  -- 'admin' for all Slice 4 writes; 'superadmin' and 'system' reserved for future slices.

  -- Action fields (format: domain.subject.verb)
  action             VARCHAR(100)      NOT NULL,
  target_type        VARCHAR(50)       NULL,
  -- Entity type affected: 'admin_user_roles', 'admin_roles', 'shop', etc.
  target_id          BIGINT UNSIGNED   NULL,
  -- Numeric identifier of the affected entity. See design §11.2 for admin_user_roles deviation.

  -- State snapshot fields (sanitized — no passwords, tokens, or secrets)
  before_json        JSON              NULL,
  after_json         JSON              NULL,

  -- Request context fields
  ip_address         VARCHAR(45)       NULL,
  -- VARCHAR(45): supports IPv4 (15) and IPv6 (39 max, 45 with zone ID)
  user_agent         VARCHAR(512)      NULL,
  -- Truncated to 512 chars at the service layer
  permission_checked VARCHAR(64)       NULL,
  -- Populated from req.adminPermissionChecked (Slice 3 C3 constraint)

  -- Additional context
  metadata_json      JSON              NULL,
  -- { request_id: uuid, correlation_id: null }

  created_at         DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- Millisecond precision for ordering concurrent writes; UTC.
  -- No updated_at — append-only by design.

  PRIMARY KEY (id),

  -- "What did admin 7 do in the last hour?"
  INDEX idx_aal_admin_created (admin_id, created_at),

  -- "What happened to admin_user_roles entry for admin 5?"
  INDEX idx_aal_target        (target_type, target_id),

  -- "Show me all rbac.role.assign actions today"
  INDEX idx_aal_action        (action),

  -- "Show me the last 100 audit entries" (dashboard default)
  INDEX idx_aal_created       (created_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
