-- =====================================================================
-- Migration 045 — Seller-declared "founded year"
-- =====================================================================
--
-- ADDITIVE, OPTIONAL, NULLABLE.
--
-- Adds a single `founded_year SMALLINT NULL` column to the `shops`
-- table so sellers can declare the actual year their business started
-- operating. The storefront's existing "X+ năm kinh nghiệm" derivation
-- (`yearsSince(row.published_at || row.createdAt)`) falls back to
-- `createdAt` when the new column is NULL, so every existing shop
-- continues to render the same value it did before this migration.
--
-- Rationale:
--   - The current derivation uses Otofine `createdAt`, which gives a
--     brand-new shop a misleading "1+ năm" label even when the
--     business has been operating for 10+ years.
--   - A nullable column means sellers can OPT IN; nothing changes
--     until they fill in the field via /shop/settings.
--   - SMALLINT (2 bytes) is enough for any plausible year (1900-2100).
--
-- Safety:
--   - Idempotent check via information_schema before ALTER.
--   - InnoDB instant-add (MySQL 8.0+) → no table rewrite, no lock.
--
-- Rollback (safe, no data loss):
--   ALTER TABLE shops DROP COLUMN founded_year;

SET NAMES utf8mb4;

SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE()
     AND table_name = 'shops'
     AND column_name = 'founded_year'
);

SET @stmt := IF(
  @col_exists = 0,
  "ALTER TABLE shops ADD COLUMN founded_year SMALLINT NULL COMMENT 'Optional self-declared year the business started operating; NULL falls back to createdAt for the storefront years derivation.'",
  "SELECT 'shops.founded_year already exists, skipping' AS msg"
);

PREPARE s FROM @stmt;
EXECUTE s;
DEALLOCATE PREPARE s;
