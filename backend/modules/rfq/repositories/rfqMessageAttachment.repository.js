import { pool } from "../../../config/db.js";

export const RFQ_MAX_ATTACHMENTS_PER_MESSAGE = 6;
export const RFQ_STAGING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function insertStaging(conn, row) {
  const c = conn || pool;
  const [r] = await c.query(
    `INSERT INTO rfq_message_attachments (
       conversation_id, message_id, url, mime_type, byte_size, width, height, sort_order
     ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
    [
      row.conversation_id,
      row.url,
      row.mime_type || "image/jpeg",
      row.byte_size ?? null,
      row.width ?? null,
      row.height ?? null,
      row.sort_order ?? 0,
    ],
  );
  return r.insertId;
}

export async function findStagedByIds(conversationId, attachmentIds, conn = null) {
  if (!attachmentIds?.length) return [];
  const c = conn || pool;
  const ids = attachmentIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return [];

  const [rows] = await c.query(
    `SELECT id, conversation_id, message_id, url, mime_type, byte_size, width, height, sort_order, created_at
     FROM rfq_message_attachments
     WHERE conversation_id = ?
       AND message_id IS NULL
       AND id IN (?)
     ORDER BY id ASC`,
    [conversationId, ids],
  );
  return rows;
}

export async function linkStagedToMessage(conn, messageId, attachmentIds, conversationId) {
  const c = conn || pool;
  if (!attachmentIds?.length) return;
  const ids = attachmentIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return;

  await c.query(
    `UPDATE rfq_message_attachments
     SET message_id = ?
     WHERE conversation_id = ?
       AND message_id IS NULL
       AND id IN (?)`,
    [messageId, conversationId, ids],
  );
}

export async function listByMessageIds(messageIds, conn = null) {
  if (!messageIds?.length) return [];
  const c = conn || pool;
  const ids = messageIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return [];

  const [rows] = await c.query(
    `SELECT id, message_id, conversation_id, url, mime_type, byte_size, width, height, sort_order, created_at
     FROM rfq_message_attachments
     WHERE message_id IN (?)
     ORDER BY message_id ASC, sort_order ASC, id ASC`,
    [ids],
  );
  return rows;
}

export async function findSeedMessageByKind(conversationId, seedKind, conn = null) {
  const c = conn || pool;
  const [[row]] = await c.query(
    `SELECT id FROM rfq_messages
     WHERE conversation_id = ?
       AND deleted_at IS NULL
       AND message_type = 'image'
       AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.seed')) = ?
     LIMIT 1`,
    [conversationId, seedKind],
  );
  return row || null;
}

export async function insertAttachmentsForMessage(conn, conversationId, messageId, attachments) {
  let order = 0;
  for (const a of attachments) {
    await conn.query(
      `INSERT INTO rfq_message_attachments (
         conversation_id, message_id, url, mime_type, byte_size, width, height, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        conversationId,
        messageId,
        a.url,
        a.mime_type || "image/jpeg",
        a.byte_size ?? null,
        a.width ?? null,
        a.height ?? null,
        order++,
      ],
    );
  }
}
