-- =====================================================================
-- Rollback for Migration 051 — schema_migrations
-- =====================================================================
--
-- WARNING: Only run this if you are rolling back the entire
-- admin foundation. Once other admin migrations (052+) are applied,
-- this table cannot be dropped without first rolling back all
-- dependent migrations.
--
-- Safe to run if: only migration 051 has been applied and no other
-- admin_ tables exist.
--
-- Pre-flight check before running:
--   SELECT COUNT(*) FROM schema_migrations;
--   -- If count > 1, other migrations are tracked here. Do NOT drop.
--   -- If count = 1 (only '051_schema_migrations.sql' row), safe to drop.
--
-- =====================================================================

DROP TABLE IF EXISTS schema_migrations;
