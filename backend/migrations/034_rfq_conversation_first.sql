-- Conversation-first engagement markers (shop message vs quote).
-- npm run migrate:rfq:conversation-first

SET NAMES utf8mb4;

SET @sch := DATABASE();

SET @req_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'rfq_requests' AND COLUMN_NAME = 'first_shop_message_at'
);
SET @sql_req := IF(
  @req_col = 0,
  'ALTER TABLE rfq_requests ADD COLUMN first_shop_message_at DATETIME(3) NULL AFTER verified_at',
  'SELECT "rfq_requests.first_shop_message_at exists" AS msg'
);
PREPARE s_req FROM @sql_req;
EXECUTE s_req;
DEALLOCATE PREPARE s_req;

SET @disp_col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'rfq_dispatches' AND COLUMN_NAME = 'first_shop_message_at'
);
SET @sql_disp := IF(
  @disp_col = 0,
  'ALTER TABLE rfq_dispatches ADD COLUMN first_shop_message_at DATETIME(3) NULL',
  'SELECT "rfq_dispatches.first_shop_message_at exists" AS msg'
);
PREPARE s_disp FROM @sql_disp;
EXECUTE s_disp;
DEALLOCATE PREPARE s_disp;

-- Backfill from existing shop messages (idempotent).
UPDATE rfq_requests r
INNER JOIN (
  SELECT c.rfq_request_id AS rid, MIN(m.created_at) AS first_at
  FROM rfq_conversations c
  INNER JOIN rfq_messages m ON m.conversation_id = c.id AND m.deleted_at IS NULL
  WHERE m.sender_type = 'shop'
  GROUP BY c.rfq_request_id
) x ON x.rid = r.id
SET r.first_shop_message_at = x.first_at
WHERE r.first_shop_message_at IS NULL;

UPDATE rfq_dispatches d
INNER JOIN (
  SELECT c.dispatch_id AS did, MIN(m.created_at) AS first_at
  FROM rfq_conversations c
  INNER JOIN rfq_messages m ON m.conversation_id = c.id AND m.deleted_at IS NULL
  WHERE m.sender_type = 'shop'
  GROUP BY c.dispatch_id
) x ON x.did = d.id
SET d.first_shop_message_at = x.first_at
WHERE d.first_shop_message_at IS NULL;
