-- =====================================================================
-- Migration 042 — Shop Zalo sync backfill
-- =====================================================================
--
-- Bug fix: the unified `/shop/settings` page writes the Basic-tab Zalo
-- into `shops.zalo` while the Storefront tab writes `shops.zalo_phone`.
-- Two columns, one logical value → drift. Concretely seen in
-- production:
--   id=2  zalo=0847770777   zalo_phone=0914489595   slug=phutungoto355
--
-- This migration:
--   1. Aligns existing rows so `zalo` and `zalo_phone` carry the same
--      resolved value going forward. Preference is `zalo` (the
--      unified canonical) → `zalo_phone` (the public-page column).
--   2. Is **idempotent**. Running it twice is safe; only rows that
--      need a sync are touched.
--   3. Is **non-destructive**. No columns dropped or renamed. The
--      schema is unchanged.
--
-- Application-layer guarantees (already shipped alongside this file):
--   - `backend/utils/resolveShopZalo.js` — single read-side helper
--   - `backend/controllers/shop.controller.js` — `/api/shop/me`
--     mirrors `zalo` → `zalo_phone` on save
--   - `backend/domains/shopPublic/services/sellerPublicPage.service.js`
--     — `/api/shop/public-page` mirrors `zalo_phone` → `zalo` on save
--   - 3 SQL repos SELECT `COALESCE(NULLIF(zalo,''), NULLIF(zalo_phone,''))`
--     so reads also prefer the canonical column.
--
-- Run once on each env (idempotent):
--   mysql ... < backend/migrations/042_shop_zalo_sync_backfill.sql
--
-- Roll-back: none required. If you ever need to undo, the two columns
-- continue to exist independently — re-write either one and the
-- application-level mirror will re-converge on next save.

SET NAMES utf8mb4;

-- Step 1: backfill `zalo_phone` from `zalo` when `zalo` is the
-- non-empty source of truth. We treat empty strings as missing.
UPDATE shops
   SET zalo_phone = zalo,
       updatedAt = updatedAt              -- keep timestamp stable on backfill
 WHERE zalo IS NOT NULL
   AND TRIM(zalo) <> ''
   AND (zalo_phone IS NULL
        OR TRIM(zalo_phone) = ''
        OR zalo_phone <> zalo);

-- Step 2: fill `zalo` from `zalo_phone` for legacy rows that ONLY
-- have the public-page column populated. This preserves the contact
-- for sellers that never used the Basic tab on /shop/settings.
UPDATE shops
   SET zalo = zalo_phone,
       updatedAt = updatedAt
 WHERE (zalo IS NULL OR TRIM(zalo) = '')
   AND zalo_phone IS NOT NULL
   AND TRIM(zalo_phone) <> '';

-- Visibility — surface drift status after the run so ops can sanity-
-- check the result. Pure SELECT, no side effects.
SELECT
  SUM(CASE
        WHEN COALESCE(zalo, '') = COALESCE(zalo_phone, '')
        THEN 1 ELSE 0
      END) AS rows_in_sync,
  SUM(CASE
        WHEN COALESCE(zalo, '') <> COALESCE(zalo_phone, '')
        THEN 1 ELSE 0
      END) AS rows_still_drifted,
  COUNT(*) AS rows_total
FROM shops;
