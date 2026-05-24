-- 040_shops_public_site.sql
-- Phase 2 of the Shop Public Page feature.
-- ADDITIVE ONLY. Re-run-safe (idempotent via INFORMATION_SCHEMA checks).
-- See: audit/shop-public-db-impact.md, audit/shop-public-pages-overview.md
--
-- NOTE on existing columns:
--   `shops.avatar`, `shops.cover`, `shops.zalo` already exist in production
--   (see initDB.js + db_backup_*.sql). This migration does NOT touch them.
--   `cover_image` is added as a new optional column; the public API reads
--   COALESCE(cover_image, cover). Likewise `zalo_phone` is additive.

SET NAMES utf8mb4;
SET @sch := DATABASE();

-- ---------------------------------------------------------------------------
-- Helper macro pattern: add column only if missing
-- ---------------------------------------------------------------------------

-- 1. slug
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'slug');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD COLUMN slug VARCHAR(63) NULL DEFAULT NULL AFTER name',
  'SELECT "shops.slug already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 2. public_status
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'public_status');
SET @s := IF(@c = 0,
  "ALTER TABLE shops ADD COLUMN public_status ENUM('pending','public','suspended') NOT NULL DEFAULT 'pending' AFTER slug",
  'SELECT "shops.public_status already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 3. bio
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'bio');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD COLUMN bio VARCHAR(255) NULL DEFAULT NULL AFTER cover',
  'SELECT "shops.bio already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 4. intro_html
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'intro_html');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD COLUMN intro_html LONGTEXT NULL DEFAULT NULL AFTER descriptionHtml',
  'SELECT "shops.intro_html already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 5. cover_image (additive; existing `cover` column is preserved)
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'cover_image');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD COLUMN cover_image VARCHAR(500) NULL DEFAULT NULL AFTER cover',
  'SELECT "shops.cover_image already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 6. facebook_url
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'facebook_url');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD COLUMN facebook_url VARCHAR(255) NULL DEFAULT NULL AFTER zalo',
  'SELECT "shops.facebook_url already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 7. zalo_phone (additive; existing `zalo` is preserved)
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'zalo_phone');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD COLUMN zalo_phone VARCHAR(50) NULL DEFAULT NULL AFTER zalo',
  'SELECT "shops.zalo_phone already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 8. working_hours
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'working_hours');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD COLUMN working_hours VARCHAR(255) NULL DEFAULT NULL AFTER addressDetail',
  'SELECT "shops.working_hours already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 9. lat
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'lat');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD COLUMN lat DECIMAL(10,7) NULL DEFAULT NULL',
  'SELECT "shops.lat already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 10. lng
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'lng');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD COLUMN lng DECIMAL(10,7) NULL DEFAULT NULL',
  'SELECT "shops.lng already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 11. map_embed_url
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'map_embed_url');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD COLUMN map_embed_url VARCHAR(500) NULL DEFAULT NULL',
  'SELECT "shops.map_embed_url already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 12. verified_at
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'verified_at');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD COLUMN verified_at DATETIME NULL DEFAULT NULL',
  'SELECT "shops.verified_at already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 13. published_at
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND COLUMN_NAME = 'published_at');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD COLUMN published_at DATETIME NULL DEFAULT NULL',
  'SELECT "shops.published_at already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ---------------------------------------------------------------------------
-- Indexes (idempotent)
-- ---------------------------------------------------------------------------

-- UNIQUE INDEX on slug — one slug per shop.
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND INDEX_NAME = 'idx_shops_slug');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD UNIQUE KEY idx_shops_slug (slug)',
  'SELECT "shops.idx_shops_slug already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- Covering index for "is this slug currently public?" hot path.
SET @c := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
           WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'shops' AND INDEX_NAME = 'idx_shops_slug_status');
SET @s := IF(@c = 0,
  'ALTER TABLE shops ADD INDEX idx_shops_slug_status (slug, public_status)',
  'SELECT "shops.idx_shops_slug_status already exists" AS msg');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
