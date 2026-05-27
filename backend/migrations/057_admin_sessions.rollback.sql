-- =============================================================================
-- 057_admin_sessions.rollback.sql
-- Rollback for 057_admin_sessions.sql
-- =============================================================================
-- WARNING: Destroys ALL admin session records permanently.
-- Execute ONLY if the admin_sessions table itself causes a production incident
-- (disk pressure, locking issue, etc.).
-- For routine rollback, disable the feature flag instead (Level 1 rollback).
-- =============================================================================

DROP TABLE IF EXISTS admin_sessions;

DELETE FROM admin_feature_flags
WHERE flag_key = 'ADMIN_SESSION_GOVERNANCE_ENABLED';

DELETE FROM schema_migrations
WHERE filename = '057_admin_sessions.sql';
