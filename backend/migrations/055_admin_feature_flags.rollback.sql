-- =====================================================================
-- Rollback for Migration 055 — admin_feature_flags
-- =====================================================================
--
-- Pre-flight check before running:
--   SELECT COUNT(*) FROM schema_migrations WHERE filename LIKE '05%';
--   -- Only 051 and 055 should appear (052-054 not yet deployed).
--   -- admin_feature_flags has no FK dependencies — safe to drop at any time.
--   -- updated_by is a plain nullable INT, not a FK constraint.
--
-- After dropping, remove the tracking row:
--   DELETE FROM schema_migrations WHERE filename = '055_admin_feature_flags.sql';
--
-- =====================================================================

DROP TABLE IF EXISTS admin_feature_flags;
