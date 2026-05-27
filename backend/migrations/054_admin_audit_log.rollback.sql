-- Rollback: 054_admin_audit_log.sql
--
-- WARNING: This operation permanently destroys all audit log entries.
-- Only execute if the admin_audit_log table itself causes a production incident.
-- The preferred first response is feature flag deactivation:
--   UPDATE admin_feature_flags SET is_enabled = 0
--   WHERE flag_key = 'ADMIN_AUDIT_LOG_ENABLED';
--
-- Note on DDL implicit COMMIT:
--   DROP TABLE is DDL and causes an implicit InnoDB COMMIT immediately.
--   The DELETE FROM schema_migrations below is a separate DML statement.
--   If the session dies between them, the tracking row persists —
--   this is safe: re-running the migration recreates the table (idempotent).

DROP TABLE IF EXISTS admin_audit_log;

DELETE FROM schema_migrations WHERE filename = '054_admin_audit_log.sql';
