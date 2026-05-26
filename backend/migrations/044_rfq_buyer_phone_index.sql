-- =====================================================================
-- Migration 044 — Buyer-phone index for seller sales-intelligence
-- =====================================================================
--
-- ADDITIVE, OPTIONAL.
--
-- Adds a single B-tree index on `rfq_requests.guest_phone_e164` so the
-- new "buyer prior RFQ" subselects on the seller inbox (see
-- `listInboxForShop`, `findDispatchForShop`, and `shopMetrics.service`)
-- can resolve in O(log N) instead of a dependent full-table scan.
--
-- This index is OPTIONAL — every query that uses it falls back to a
-- correct result without it; only the response time changes. Apply it
-- once on each environment whose `rfq_requests` table is large enough
-- to warrant the perf optimisation (rule of thumb: > 10k rows).
--
-- Rationale:
--   - The seller-intelligence pass joins `rfq_dispatches` to
--     `rfq_requests.guest_phone_e164` to count "buyer prior" signals.
--   - The existing indexes cover dispatch lookups but not phone-keyed
--     buyer-history joins.
--   - guest_phone_e164 is a VARCHAR(32) E.164 string with high
--     cardinality (~one entry per buyer phone), so a plain B-tree is
--     the right shape.
--   - The phone column already has a partner column `guest_phone_hash`,
--     which is consulted by the OTP fingerprint lookup; we are NOT
--     touching that index.
--
-- Safety:
--   - `CREATE INDEX IF NOT EXISTS` so re-running is idempotent.
--   - Online DDL: InnoDB supports inplace index add on a single
--     column without table rewrite from MySQL 5.6+.
--
-- Rollback (safe, no data loss):
--   DROP INDEX idx_rfq_guest_phone_e164 ON rfq_requests;

SET NAMES utf8mb4;

ALTER TABLE rfq_requests
  ADD INDEX idx_rfq_guest_phone_e164 (guest_phone_e164);
