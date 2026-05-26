-- =====================================================================
-- Migration 051 — Schema migrations tracking table
-- =====================================================================
--
-- ADDITIVE ONLY. Creates a single new table.
-- No existing tables are modified.
-- Idempotent: CREATE TABLE IF NOT EXISTS is safe to re-run.
--
-- Purpose:
--   Provides a persistent record of which migration files have been
--   applied to this database, along with their SHA-256 checksum at
--   the time of application. The run-admin-migration.js runner reads
--   this table to skip already-applied files and to detect checksum
--   drift (file modified after being applied).
--
-- Columns:
--   id          — auto-increment surrogate key
--   filename    — basename of the SQL file (e.g. "051_schema_migrations.sql")
--                 unique; acts as the idempotency key
--   applied_at  — wall-clock timestamp at apply time (UTC, ms precision)
--   checksum    — SHA-256 hex digest of the SQL file contents at apply time
--                 NULL is permitted for files applied before checksums were added
--   applied_by  — optional free-text label (e.g. "admin-runner v1", "manual")
--
-- Rollback: see 051_schema_migrations.rollback.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  id          INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  filename    VARCHAR(255)   NOT NULL,
  applied_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  checksum    CHAR(64)       NULL     COMMENT 'SHA-256 hex of file contents at apply time',
  applied_by  VARCHAR(100)   NULL     COMMENT 'Runner label or "manual"',
  PRIMARY KEY (id),
  UNIQUE KEY uq_schema_migrations_filename (filename)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = 'Tracks applied SQL migrations with checksums for drift detection';
