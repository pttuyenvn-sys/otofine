import { pool } from "../../../config/db.js";

/**
 * Timeline messages — additive layer; rfq_quotes remains quote source of truth.
 */

export async function insertMessage(conn, row) {
  const c = conn || pool;
  const [r] = await c.query(
    `INSERT INTO rfq_messages (
       conversation_id, sender_type, sender_shop_id,
       message_type, message_text, attachments_json, metadata_json
     ) VALUES (?,?,?,?,?,?,?)`,
    [
      row.conversation_id,
      row.sender_type,
      row.sender_shop_id ?? null,
      row.message_type,
      row.message_text ?? null,
      row.attachments_json != null ? JSON.stringify(row.attachments_json) : null,
      row.metadata_json != null ? JSON.stringify(row.metadata_json) : null,
    ],
  );
  return r.insertId;
}

export async function findQuoteTimelineByQuoteId(conversationId, quoteId, conn = null) {
  const c = conn || pool;
  const [[row]] = await c.query(
    `SELECT id FROM rfq_messages
     WHERE conversation_id = ?
       AND message_type = 'quote'
       AND deleted_at IS NULL
       AND CAST(JSON_EXTRACT(metadata_json, '$.quote_id') AS UNSIGNED) = ?
     LIMIT 1`,
    [conversationId, quoteId],
  );
  return row || null;
}

export async function findLatestMessageId(conversationId, conn = null) {
  const c = conn || pool;
  const [[row]] = await c.query(
    `SELECT id FROM rfq_messages
     WHERE conversation_id = ? AND deleted_at IS NULL
     ORDER BY id DESC
     LIMIT 1`,
    [conversationId],
  );
  return row?.id != null ? Number(row.id) : null;
}

export async function findMessageById(messageId, conn = null) {
  const c = conn || pool;
  const [[row]] = await c.query(
    `SELECT id, conversation_id, sender_type, sender_shop_id,
            message_type, message_text, attachments_json, metadata_json,
            created_at, updated_at
     FROM rfq_messages
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [messageId],
  );
  return row ? normalizeMessageRow(row) : null;
}

/** Deep pagination cap — avoids expensive OFFSET scans via poll abuse. */
export const RFQ_MESSAGE_LIST_OFFSET_MAX = 500;

export async function listMessagesForConversation(conversationId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const offset = Math.min(
    Math.max(Number(opts.offset) || 0, 0),
    RFQ_MESSAGE_LIST_OFFSET_MAX,
  );

  const [rows] = await pool.query(
    `SELECT id, conversation_id, sender_type, sender_shop_id,
            message_type, message_text, attachments_json, metadata_json,
            created_at, updated_at
     FROM rfq_messages
     WHERE conversation_id = ? AND deleted_at IS NULL
     ORDER BY created_at ASC, id ASC
     LIMIT ? OFFSET ?`,
    [conversationId, limit, offset],
  );

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM rfq_messages
     WHERE conversation_id = ? AND deleted_at IS NULL`,
    [conversationId],
  );

  return {
    items: rows.map(normalizeMessageRow),
    limit,
    offset,
    total: Number(total || 0),
  };
}

function normalizeMessageRow(row) {
  return {
    ...row,
    attachments_json: parseJsonCol(row.attachments_json),
    metadata_json: parseJsonCol(row.metadata_json),
  };
}

function parseJsonCol(val) {
  if (val == null) return null;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}
