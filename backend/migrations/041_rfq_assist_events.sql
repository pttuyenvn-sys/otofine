-- Phase 8.2 — RFQ Assist: analytics event log
--
-- Records how buyers interact with the assistive supplier-suggestion
-- panel surfaced on the post-OTP viewer page (`/rfq/t/[token]`).
--
-- This table is OBSERVATIONAL ONLY. It does NOT influence dispatch,
-- never blocks an RFQ flow, and is read by analytics / future ML
-- training, never by any synchronous business rule.
--
-- Apply once:
--   mysql ... < backend/migrations/041_rfq_assist_events.sql
-- Rollback (drops the table; no data loss elsewhere):
--   DROP TABLE IF EXISTS rfq_assist_events;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS rfq_assist_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rfq_request_id BIGINT UNSIGNED NOT NULL,
  -- Nullable when action is panel-level (e.g. "dismissed" with no shop selected)
  suggested_shop_id INT UNSIGNED NULL,
  action ENUM('impression','click','selected','deselected','dismissed') NOT NULL,
  -- Where in the UI the event fired. Lets analytics distinguish
  -- viewer-page assist from future homepage/widget contexts.
  source VARCHAR(32) NOT NULL DEFAULT 'viewer',
  -- The matcher's score + tier AT THE MOMENT of the event. Captured
  -- here so analytics queries don't need to re-run the matcher.
  match_score TINYINT UNSIGNED NULL,
  match_tier ENUM('hot','warm','cold') NULL,
  -- Coarse fingerprint for correlation; never the raw phone.
  buyer_phone_hash CHAR(64) NULL,
  -- Free-form attribution payload (rollout reason, page section, etc).
  metadata_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_rae_rfq_created (rfq_request_id, created_at),
  KEY idx_rae_action_created (action, created_at),
  KEY idx_rae_shop_action (suggested_shop_id, action),
  CONSTRAINT fk_rae_rfq FOREIGN KEY (rfq_request_id) REFERENCES rfq_requests (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
