import { pool } from "../../../config/db.js";

/**
 * Read cursors per conversation participant.
 * buyer → participant_shop_id = 0 (MySQL UNIQUE-safe; not NULL).
 */

export function participantShopIdForAccess(access) {
  return access.type === "shop" ? Number(access.shopId) : 0;
}

export function participantTypeForAccess(access) {
  return access.type === "shop" ? "shop" : "buyer";
}

/** Opponent sender types for unread counts (exclude own messages). */
export function opponentSenderTypes(participantType) {
  return participantType === "shop" ? ["buyer", "system"] : ["shop"];
}

export async function findReadCursor(conversationId, participantType, participantShopId, conn = null) {
  const c = conn || pool;
  const [[row]] = await c.query(
    `SELECT id, conversation_id, participant_type, participant_shop_id,
            last_read_message_id, last_read_at
     FROM rfq_conversation_reads
     WHERE conversation_id = ?
       AND participant_type = ?
       AND participant_shop_id = ?
     LIMIT 1`,
    [conversationId, participantType, participantShopId],
  );
  return row || null;
}

export async function upsertReadCursor(
  conn,
  { conversation_id, participant_type, participant_shop_id, last_read_message_id },
) {
  const c = conn || pool;
  await c.query(
    `INSERT INTO rfq_conversation_reads (
       conversation_id, participant_type, participant_shop_id,
       last_read_message_id, last_read_at
     ) VALUES (?, ?, ?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE
       last_read_message_id = GREATEST(
         COALESCE(last_read_message_id, 0),
         COALESCE(VALUES(last_read_message_id), 0)
       ),
       last_read_at = IF(
         COALESCE(VALUES(last_read_message_id), 0) > COALESCE(last_read_message_id, 0),
         NOW(3),
         last_read_at
       ),
       updated_at = CURRENT_TIMESTAMP(3)`,
    [conversation_id, participant_type, participant_shop_id, last_read_message_id],
  );
}

/**
 * Count opponent messages after read cursor — uses conversation_id + message id index.
 */
export async function countUnreadForParticipant(
  conversationId,
  participantType,
  participantShopId,
  conn = null,
) {
  const c = conn || pool;
  const opponents = opponentSenderTypes(participantType);
  const cursor = await findReadCursor(conversationId, participantType, participantShopId, c);
  const lastId = cursor?.last_read_message_id ?? null;

  const params = [conversationId, opponents];
  let cursorSql = "";
  if (lastId != null) {
    cursorSql = " AND m.id > ?";
    params.push(lastId);
  }

  const [[row]] = await c.query(
    `SELECT COUNT(*) AS c
     FROM rfq_messages m
     WHERE m.conversation_id = ?
       AND m.deleted_at IS NULL
       AND m.sender_type IN (?)
       ${cursorSql}`,
    params,
  );
  return Number(row?.c || 0);
}

/**
 * Batch unread counts for shop inbox — one query, no N+1.
 * Returns Map dispatchId → count.
 */
export async function countUnreadByDispatchForShop(shopId, conn = null) {
  const c = conn || pool;
  const [rows] = await c.query(
    `SELECT conv.dispatch_id AS dispatch_id,
            COUNT(m.id) AS message_unread_count
     FROM rfq_conversations conv
     INNER JOIN rfq_dispatches d ON d.id = conv.dispatch_id AND d.shop_id = ?
     LEFT JOIN rfq_conversation_reads cr
       ON cr.conversation_id = conv.id
      AND cr.participant_type = 'shop'
      AND cr.participant_shop_id = ?
     LEFT JOIN rfq_messages m
       ON m.conversation_id = conv.id
      AND m.deleted_at IS NULL
      AND m.sender_type IN ('buyer', 'system')
      AND (cr.last_read_message_id IS NULL OR m.id > cr.last_read_message_id)
     GROUP BY conv.dispatch_id`,
    [shopId, shopId],
  );
  const map = new Map();
  for (const r of rows) {
    map.set(Number(r.dispatch_id), Number(r.message_unread_count || 0));
  }
  return map;
}

/**
 * Batch unread for buyer across dispatch ids (same RFQ) — one query.
 */
export async function countUnreadByDispatchForBuyer(rfqRequestId, dispatchIds, conn = null) {
  if (!dispatchIds?.length) return new Map();
  const c = conn || pool;
  const ids = dispatchIds.map(Number).filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return new Map();

  const [rows] = await c.query(
    `SELECT conv.dispatch_id AS dispatch_id,
            COUNT(m.id) AS message_unread_count
     FROM rfq_conversations conv
     LEFT JOIN rfq_conversation_reads cr
       ON cr.conversation_id = conv.id
      AND cr.participant_type = 'buyer'
      AND cr.participant_shop_id = 0
     LEFT JOIN rfq_messages m
       ON m.conversation_id = conv.id
      AND m.deleted_at IS NULL
      AND m.sender_type = 'shop'
      AND (cr.last_read_message_id IS NULL OR m.id > cr.last_read_message_id)
     WHERE conv.rfq_request_id = ?
       AND conv.dispatch_id IN (?)
     GROUP BY conv.dispatch_id`,
    [rfqRequestId, ids],
  );
  const map = new Map();
  for (const r of rows) {
    map.set(Number(r.dispatch_id), Number(r.message_unread_count || 0));
  }
  return map;
}
