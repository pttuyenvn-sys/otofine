import { pool } from "../../../config/db.js";
import * as attRepo from "./rfqMessageAttachment.repository.js";

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
  if (!row) return null;
  const msg = normalizeMessageRow(row);
  const attRows = await attRepo.listByMessageIds([msg.id], conn);
  msg.attachments = attRows.map((a) => ({
    id: a.id,
    url: a.url,
    mime_type: a.mime_type,
    byte_size: a.byte_size != null ? Number(a.byte_size) : null,
    width: a.width != null ? Number(a.width) : null,
    height: a.height != null ? Number(a.height) : null,
    sort_order: Number(a.sort_order || 0),
  }));
  return msg;
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

  const items = rows.map(normalizeMessageRow);
  const messageIds = items.map((m) => m.id);
  const attRows = await attRepo.listByMessageIds(messageIds);
  const attByMsg = new Map();
  for (const a of attRows) {
    const mid = Number(a.message_id);
    if (!attByMsg.has(mid)) attByMsg.set(mid, []);
    attByMsg.get(mid).push(normalizeAttachmentRow(a));
  }
  for (const m of items) {
    m.attachments = attByMsg.get(Number(m.id)) || [];
  }

  return {
    items,
    limit,
    offset,
    total: Number(total || 0),
  };
}

function normalizeAttachmentRow(row) {
  return {
    id: row.id,
    url: row.url,
    mime_type: row.mime_type,
    byte_size: row.byte_size != null ? Number(row.byte_size) : null,
    width: row.width != null ? Number(row.width) : null,
    height: row.height != null ? Number(row.height) : null,
    sort_order: Number(row.sort_order || 0),
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
