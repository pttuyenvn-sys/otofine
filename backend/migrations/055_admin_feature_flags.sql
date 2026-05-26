-- =====================================================================
-- Migration 055 — Admin platform feature flags table
-- =====================================================================
--
-- ADDITIVE ONLY. Creates one new table with 10 seed rows.
-- No existing tables are modified.
-- Idempotent: CREATE TABLE IF NOT EXISTS + INSERT IGNORE on all seeds.
--
-- No FK dependencies on migrations 052-054 (admin_accounts, admin_rbac,
-- admin_audit_log) — those tables are not yet deployed. The updated_by
-- column is a plain nullable INT, not a FK constraint.
--
-- Rollback: see 055_admin_feature_flags.rollback.sql
-- =====================================================================

CREATE TABLE IF NOT EXISTS admin_feature_flags (
  id          INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  flag_key    VARCHAR(100)   NOT NULL,
  is_enabled  TINYINT(1)     NOT NULL DEFAULT 0,
  description VARCHAR(255)   NULL,
  updated_by  INT UNSIGNED   NULL     COMMENT 'admin_id who last toggled; NULL = system/seed',
  created_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                             ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_aff_flag_key (flag_key)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = 'Runtime toggle table for admin platform feature flags';

INSERT IGNORE INTO admin_feature_flags (flag_key, is_enabled, description) VALUES
  ('ADMIN_PLATFORM_ENABLED',                 0, 'Master switch — admin platform module'),
  ('ADMIN_RBAC_ENABLED',                     0, 'RBAC roles and permission management'),
  ('ADMIN_AUDIT_LOG_ENABLED',                0, 'Admin action audit logging'),
  ('ADMIN_MODERATION_ENABLED',               0, 'Shop and product moderation queue'),
  ('ADMIN_BILLING_ENABLED',                  0, 'Billing plans and subscriptions'),
  ('ADMIN_ANALYTICS_ENABLED',               0, 'Admin operational analytics dashboards'),
  ('ADMIN_RISK_ENGINE_ENABLED',              0, 'Risk signals and fraud queue'),
  ('ADMIN_SELLER_CRM_ENABLED',               0, 'Seller CRM notes and tags'),
  ('ADMIN_PAYMENTS_ENABLED',                 0, 'Payment processing integration'),
  ('ADMIN_SUBSCRIPTION_ENFORCEMENT_ENABLED', 0, 'Enforce subscription on storefront visibility');
