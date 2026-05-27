-- =============================================================================
-- Slice 6 Rollback: 058_admin_enforcement.rollback.sql
--
-- Drops all 4 enforcement tables in reverse dependency order.
-- Remove schema_migrations entry so the migration can be re-applied.
-- =============================================================================

DROP TABLE IF EXISTS admin_moderation_notes;
DROP TABLE IF EXISTS admin_risk_flags;
DROP TABLE IF EXISTS admin_shop_suspensions;
DROP TABLE IF EXISTS admin_enforcement_cases;

DELETE FROM schema_migrations
WHERE filename = '058_admin_enforcement.sql';
