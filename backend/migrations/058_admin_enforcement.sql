-- =============================================================================
-- Slice 6: Seller Enforcement & Moderation Foundation
-- Migration: 058_admin_enforcement.sql
--
-- Creates 4 new tables in dependency order (cases → suspensions → flags → notes).
-- All tables use CREATE TABLE IF NOT EXISTS for idempotency.
-- No ALTER TABLE on existing production tables.
-- No physical foreign keys — logical references only (C4 pattern from Slices 3–5).
--
-- Run via: npm run migrate:admin:enforcement
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table 1: admin_enforcement_cases (parent — referenced by all other tables)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_enforcement_cases (
  id               BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,

  -- Target (shop or shop_account; extensible to 'product' in future slices)
  target_type      VARCHAR(50)       NOT NULL,
  target_id        BIGINT UNSIGNED   NOT NULL,

  -- Classification
  case_type        ENUM(
    'warning',
    'suspension',
    'review',
    'termination'
  ) NOT NULL,
  severity         ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  category         VARCHAR(64)       NULL,
  summary          VARCHAR(500)      NOT NULL DEFAULT '',

  -- Case lifecycle
  status           ENUM(
    'open',
    'pending_review',
    'resolved',
    'appealed',
    'closed'
  ) NOT NULL DEFAULT 'open',

  -- Admin actors (logical references — no physical FK to admin.id)
  opened_by        INT UNSIGNED      NOT NULL,
  assigned_to      INT UNSIGNED      NULL,
  resolved_by      INT UNSIGNED      NULL,

  -- Resolution fields (populated when status → resolved/closed)
  resolution       ENUM(
    'no_action',
    'warning_issued',
    'suspended',
    'reinstated',
    'terminated',
    'dismissed'
  ) NULL,
  resolution_note  TEXT              NULL,

  -- Timestamps
  created_at       DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                     ON UPDATE CURRENT_TIMESTAMP(3),
  resolved_at      DATETIME(3)       NULL,

  -- Extensible metadata
  metadata_json    JSON              NULL,

  PRIMARY KEY (id),
  INDEX idx_aec_target       (target_type, target_id, status),
  INDEX idx_aec_status_time  (status, created_at),
  INDEX idx_aec_opened_by    (opened_by, created_at),
  INDEX idx_aec_assigned_to  (assigned_to, status),
  INDEX idx_aec_resolved     (resolved_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Table 2: admin_shop_suspensions (child of cases)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_shop_suspensions (
  id               BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,

  -- Target (INT, not BIGINT — matches shops.id production type)
  shop_id          INT               NOT NULL,

  -- Case link (nullable — allows legacy/recovery records without a formal case)
  case_id          BIGINT UNSIGNED   NULL,

  -- Suspension parameters
  suspension_type  ENUM('temporary', 'permanent') NOT NULL DEFAULT 'temporary',
  category         VARCHAR(64)       NULL,
  reason           TEXT              NOT NULL,

  -- Preserves the shop's public_status at time of suspension so reinstatement
  -- can restore to original state (not unconditionally set 'public').
  -- NULL for legacy/recovery records; reinstatement falls back to COALESCE(..., 'public').
  original_public_status VARCHAR(20) NULL,

  -- Timeline
  suspended_at     DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at       DATETIME(3)       NULL,

  -- Admin actors
  suspended_by     INT UNSIGNED      NOT NULL,

  -- Reinstatement (populated when lifted)
  lifted_at        DATETIME(3)       NULL,
  lifted_by        INT UNSIGNED      NULL,
  lift_reason      TEXT              NULL,

  created_at       DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  INDEX idx_ass_shop_active   (shop_id, lifted_at),
  INDEX idx_ass_shop_history  (shop_id, suspended_at),
  INDEX idx_ass_case          (case_id),
  INDEX idx_ass_expires       (expires_at, lifted_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Table 3: admin_risk_flags
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_risk_flags (
  id               BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,

  target_type      VARCHAR(50)       NOT NULL,
  target_id        BIGINT UNSIGNED   NOT NULL,

  -- Application-layer enum (not DB ENUM for extensibility)
  flag_type        VARCHAR(64)       NOT NULL,
  severity         ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  auto_detected    TINYINT(1)        NOT NULL DEFAULT 0,

  -- Reserved for Phase 3 rule engine
  signal_json      JSON              NULL,

  -- Disposition
  status           ENUM(
    'open',
    'confirmed',
    'dismissed',
    'resolved'
  ) NOT NULL DEFAULT 'open',

  -- Admin actors
  flagged_by       INT UNSIGNED      NULL,
  reviewed_by      INT UNSIGNED      NULL,

  -- Timestamps
  detected_at      DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  reviewed_at      DATETIME(3)       NULL,

  -- Optional case link
  case_id          BIGINT UNSIGNED   NULL,

  PRIMARY KEY (id),
  INDEX idx_arf_target       (target_type, target_id, status),
  INDEX idx_arf_type_status  (flag_type, status, detected_at),
  INDEX idx_arf_open         (status, detected_at),
  INDEX idx_arf_case         (case_id)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Table 4: admin_moderation_notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_moderation_notes (
  id               BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,

  target_type      VARCHAR(50)       NOT NULL,
  target_id        BIGINT UNSIGNED   NOT NULL,

  -- Optional case link
  case_id          BIGINT UNSIGNED   NULL,

  -- Content
  content          TEXT              NOT NULL,
  visibility       ENUM('internal', 'admin_only') NOT NULL DEFAULT 'admin_only',
  pinned           TINYINT(1)        NOT NULL DEFAULT 0,

  -- Author
  author_id        INT UNSIGNED      NOT NULL,

  -- Timestamps
  created_at       DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                                     ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at       DATETIME(3)       NULL,

  PRIMARY KEY (id),
  INDEX idx_amn_target   (target_type, target_id, deleted_at),
  INDEX idx_amn_pinned   (target_type, target_id, pinned, deleted_at),
  INDEX idx_amn_case     (case_id),
  INDEX idx_amn_author   (author_id, created_at)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
