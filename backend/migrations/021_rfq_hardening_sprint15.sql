-- RFQ Sprint 1.5 — hardening (additive). Run after 020.
-- Usage: npm run migrate:rfq:hardening
SET NAMES utf8mb4;

SET @sch := DATABASE();

-- --- rfq_requests.dedupe_fingerprint ---
SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'rfq_requests' AND COLUMN_NAME = 'dedupe_fingerprint'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE rfq_requests ADD COLUMN dedupe_fingerprint CHAR(64) NULL AFTER guest_phone_hash, ADD KEY idx_rfq_dedupe_created (dedupe_fingerprint, created_at)',
  'SELECT "rfq_requests.dedupe_fingerprint exists" AS msg'
);
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;

-- --- rfq_dispatches.first_viewed_at, view_count ---
SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'rfq_dispatches' AND COLUMN_NAME = 'first_viewed_at'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE rfq_dispatches ADD COLUMN first_viewed_at DATETIME(3) NULL AFTER web_viewed_at, ADD COLUMN view_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER first_viewed_at',
  'SELECT "rfq_dispatches.view columns exist" AS msg'
);
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;

-- --- rfq_quotes.dispatch_id + UNIQUE (one quote per dispatch row) ---
SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'rfq_quotes' AND COLUMN_NAME = 'dispatch_id'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE rfq_quotes ADD COLUMN dispatch_id BIGINT UNSIGNED NULL AFTER rfq_request_id',
  'SELECT "rfq_quotes.dispatch_id exists" AS msg'
);
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;

-- Deduplicate legacy quote rows per (rfq_request_id, shop_id) before backfill
DELETE q1 FROM rfq_quotes q1
INNER JOIN rfq_quotes q2
  ON q1.rfq_request_id = q2.rfq_request_id
  AND q1.shop_id = q2.shop_id
  AND q1.id > q2.id
  AND q1.deleted_at IS NULL
  AND q2.deleted_at IS NULL;

UPDATE rfq_quotes q
INNER JOIN rfq_dispatches d
  ON d.rfq_request_id = q.rfq_request_id AND d.shop_id = q.shop_id
SET q.dispatch_id = d.id
WHERE q.dispatch_id IS NULL;

DELETE FROM rfq_quotes WHERE dispatch_id IS NULL;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'rfq_quotes' AND CONSTRAINT_NAME = 'uq_quote_dispatch'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE rfq_quotes ADD UNIQUE KEY uq_quote_dispatch (dispatch_id), ADD CONSTRAINT fk_quote_dispatch FOREIGN KEY (dispatch_id) REFERENCES rfq_dispatches (id) ON DELETE RESTRICT',
  'SELECT "uq_quote_dispatch exists" AS msg'
);
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'rfq_quotes'
    AND COLUMN_NAME = 'dispatch_id' AND IS_NULLABLE = 'YES'
);
SET @sql := IF(
  @exists > 0,
  'ALTER TABLE rfq_quotes MODIFY COLUMN dispatch_id BIGINT UNSIGNED NOT NULL',
  'SELECT "dispatch_id already NOT NULL" AS msg'
);
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;

/*
ROLLBACK (manual): drop FK uq_quote_dispatch, drop column dispatch_id, drop dispatch view columns, drop dedupe_fingerprint — chỉ khi staging reset.
*/
