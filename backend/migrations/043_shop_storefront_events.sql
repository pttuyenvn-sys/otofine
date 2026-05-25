-- =====================================================================
-- Migration 043 — Shop storefront events log
-- =====================================================================
--
-- Adds a single additive table that captures lightweight buyer→shop
-- interactions on the public storefront (call clicks, Zalo clicks,
-- pageviews, share clicks, etc.). It powers the new "Shop metrics"
-- overview on `/shop/settings` (seller-side analytics) without
-- requiring an external SDK.
--
-- Design intent (mirrors `rfq_assist_events` from migration 041):
--   - ADDITIVE ONLY. No existing column is touched. Drop-table
--     rollback is safe and self-contained.
--   - Observational. No business rule reads this table synchronously;
--     it is read by the seller metrics aggregator only.
--   - Index-light. The two composite indexes match the only queries
--     the aggregator runs ("per-shop type breakdown over last N
--     days"). Anything else stays on the matching B-tree prefix.
--   - Append-only. There is no UPDATE path; rows are inserted by the
--     public ingest endpoint and read by the seller dashboard.
--
-- Source of writes:
--   POST /api/storefront-events/track
--     body: { shopSlug, type, metadata? }
--   The endpoint resolves the slug → shop_id at ingest time so the
--   table is keyed by stable numeric ids only (no slug churn risk).
--
-- Apply once on each env (idempotent):
--   mysql ... < backend/migrations/043_shop_storefront_events.sql
--
-- Roll-back (safe, no data loss elsewhere):
--   DROP TABLE IF EXISTS shop_storefront_events;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS shop_storefront_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Matches shops.id (signed INT in production) — using the same
  -- signedness avoids the MySQL "incompatible types" FK rejection.
  shop_id INT NOT NULL,
  -- Free-form but capped. Allowed values today (controller validates):
  --   storefront_view, phone_click, zalo_click, facebook_click,
  --   share_click, share_complete, share_copy, product_click,
  --   rfq_cta_click. New types can be added without a schema change.
  event_type VARCHAR(32) NOT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- Free-form attribution payload (originating page path, slug at
  -- ingest time, productId, etc.). Never PII.
  metadata_json JSON NULL,
  PRIMARY KEY (id),
  -- Primary aggregator query — "give me { type: count } for shop X
  -- in the last 30 days" — uses (shop_id, event_type, occurred_at).
  KEY idx_sse_shop_type_at (shop_id, event_type, occurred_at),
  -- Cross-shop / per-type rollups (admin-side ops).
  KEY idx_sse_type_at (event_type, occurred_at),
  CONSTRAINT fk_sse_shop FOREIGN KEY (shop_id) REFERENCES shops (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
