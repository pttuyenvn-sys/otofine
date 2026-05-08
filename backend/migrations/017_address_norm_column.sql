-- Migration: add pre-computed normalized columns to `address` for index-friendly location filtering.
-- Replaces runtime sqlFoldVi() (30+ nested REPLACE calls) with O(log n) index lookups.
-- Run manually on MySQL 8+. Safe to re-run (ignore "Duplicate column" errors).

-- 1) Add normalized columns (plain VARCHAR — NOT generated, because MySQL cannot strip Unicode diacritics)
ALTER TABLE address
  ADD COLUMN tinh_tp_norm VARCHAR(255) NULL AFTER tinh_tp,
  ADD COLUMN tinh_tp_slug VARCHAR(255) NULL AFTER tinh_tp_norm;

-- 2) Indexes
CREATE INDEX idx_address_tinh_tp_norm ON address (tinh_tp_norm);
CREATE INDEX idx_address_tinh_tp_slug ON address (tinh_tp_slug);

-- 3) Backfill: run the Node.js script  backend/scripts/backfillAddressNorm.js
--    to populate tinh_tp_norm and tinh_tp_slug with proper Vietnamese diacritics stripping.
