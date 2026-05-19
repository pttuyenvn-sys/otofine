-- RFQ message / unread query indexes (additive, online-safe).
-- npm run migrate:rfq:message-indexes

SET NAMES utf8mb4;

-- Unread counts: conversation + soft-delete + sender + id range scan
CREATE INDEX idx_rfq_msg_conv_unread
  ON rfq_messages (conversation_id, deleted_at, sender_type, id);

-- Paginated timeline (deleted-aware, stable id tie-break)
CREATE INDEX idx_rfq_msg_conv_list
  ON rfq_messages (conversation_id, deleted_at, created_at, id);

-- ROLLBACK (manual):
-- DROP INDEX idx_rfq_msg_conv_unread ON rfq_messages;
-- DROP INDEX idx_rfq_msg_conv_list ON rfq_messages;
