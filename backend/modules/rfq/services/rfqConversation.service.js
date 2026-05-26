import { pool } from "../../../config/db.js";
import * as convRepo from "../repositories/rfqConversation.repository.js";
import * as msgRepo from "../repositories/rfqMessage.repository.js";
import * as attRepo from "../repositories/rfqMessageAttachment.repository.js";
import * as readRepo from "../repositories/rfqConversationRead.repository.js";
import * as dispatchRepo from "../repositories/rfqDispatch.repository.js";
import * as reqRepo from "../repositories/rfqRequest.repository.js";
import { rfqLog } from "../utils/rfqLogger.js";
import {
  validateConversationMessagePayload,
  validateMessageText,
} from "../utils/rfqMessageValidation.js";
import { saveConversationImageBuffer } from "../utils/rfqConversationImageStorage.js";
import { notifyConversationMessagePush } from "./rfqConversationPush.service.js";
import { tryAttributeReminderConversion } from "./rfqReminderAttribution.service.js";

/**
 * RFQ v2 conversation layer (scaffolding).
 *
 * - dispatchId is the canonical conversation anchor (1 dispatch = 1 buyer↔shop room).
 * - rfq_quotes / rfq_dispatches remain source of truth for business state.
 * - rfq_messages is an additive timeline for chat UI (text + read cursors; websocket deferred).
 * - dispatchId remains the canonical room anchor — not rfq_request_id alone.
 */

/** Called inside dispatch transaction after rfq_dispatches row insert. */
export async function ensureConversationForDispatch(conn, {
  rfq_request_id,
  dispatch_id,
  shop_id,
}) {
  try {
    const res = await convRepo.ensureForDispatch(conn, {
      rfq_request_id,
      dispatch_id,
      shop_id,
    });
    if (res.inserted) {
      rfqLog.info("rfq.conversation.created", {
        conversation_id: res.id,
        dispatch_id,
        rfq_request_id,
        shop_id,
      });
    }
    return res;
  } catch (err) {
    rfqLog.warn("rfq.conversation.ensure_failed", {
      dispatch_id,
      rfq_request_id,
      shop_id,
      err: String(err?.message || err),
    });
    throw err;
  }
}

/**
 * Reflect a submitted quote on the conversation timeline.
 * rfq_quotes row is authoritative; this only records a quote event for UI/history.
 */
export async function appendQuoteTimelineEvent(conn, {
  dispatch_id,
  shop_id,
  quote_id,
  price_amount,
  currency,
  note,
  line_type,
}) {
  const conv = await convRepo.findByDispatchId(dispatch_id, conn);
  if (!conv) {
    rfqLog.warn("rfq.conversation.quote_timeline_skipped", {
      reason: "no_conversation",
      dispatch_id,
      quote_id,
    });
    return { skipped: true, reason: "no_conversation" };
  }

  const existing = await msgRepo.findQuoteTimelineByQuoteId(conv.id, quote_id, conn);
  if (existing) {
    return { skipped: true, reason: "duplicate_quote_event", message_id: existing.id };
  }

  const messageId = await msgRepo.insertMessage(conn, {
    conversation_id: conv.id,
    sender_type: "shop",
    sender_shop_id: shop_id,
    message_type: "quote",
    message_text: note ?? null,
    metadata_json: {
      quote_id,
      price_amount,
      currency,
      line_type: line_type ?? null,
    },
  });

  await convRepo.touchLastQuoteAt(conn, conv.id);

  rfqLog.info("rfq.conversation.quote_timeline", {
    conversation_id: conv.id,
    dispatch_id,
    message_id: messageId,
    quote_id,
  });

  return { message_id: messageId, conversation_id: conv.id };
}

export async function getConversationForShop(dispatchId, shopId) {
  const dispatch = await dispatchRepo.findDispatchForShop(dispatchId, shopId);
  if (!dispatch) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

  const conversation =
    (await convRepo.findByDispatchForShop(dispatchId, shopId)) ??
    (await convRepo.findByDispatchId(dispatchId));

  return {
    dispatch: {
      id: dispatch.id,
      rfq_request_id: dispatch.rfq_request_id,
      shop_id: dispatch.shop_id,
      status: dispatch.status,
    },
    conversation: conversation
      ? {
          id: conversation.id,
          dispatch_id: conversation.dispatch_id,
          rfq_request_id: conversation.rfq_request_id,
          shop_id: conversation.shop_id,
          status: conversation.status,
          last_message_at: conversation.last_message_at,
          last_quote_at: conversation.last_quote_at,
          created_at: conversation.created_at,
        }
      : null,
  };
}

export async function getConversationForBuyer(dispatchId, rfqRequestId) {
  const conversation = await convRepo.findByDispatchForRfqRequest(
    dispatchId,
    rfqRequestId,
  );
  if (!conversation) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

  return {
    conversation: {
      id: conversation.id,
      dispatch_id: conversation.dispatch_id,
      rfq_request_id: conversation.rfq_request_id,
      shop_id: conversation.shop_id,
      status: conversation.status,
      last_message_at: conversation.last_message_at,
      last_quote_at: conversation.last_quote_at,
      created_at: conversation.created_at,
    },
  };
}

async function resolveConversationForAccess(dispatchId, access, conn) {
  if (access.type === "shop") {
    let row = await convRepo.findByDispatchForShop(dispatchId, access.shopId, conn);
    if (row) return row;
    const dispatch = await dispatchRepo.findDispatchForShop(dispatchId, access.shopId);
    if (!dispatch) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
    await convRepo.ensureForDispatch(conn, {
      rfq_request_id: dispatch.rfq_request_id,
      dispatch_id: dispatchId,
      shop_id: access.shopId,
    });
    row = await convRepo.findByDispatchForShop(dispatchId, access.shopId, conn);
    return row;
  }

  if (access.type === "buyer") {
    let row = await convRepo.findByDispatchForRfqRequest(
      dispatchId,
      access.rfqRequestId,
      conn,
    );
    if (row) return row;
    const c = conn || pool;
    const [[d]] = await c.query(
      `SELECT id, rfq_request_id, shop_id FROM rfq_dispatches WHERE id = ? AND rfq_request_id = ? LIMIT 1`,
      [dispatchId, access.rfqRequestId],
    );
    if (!d) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
    await convRepo.ensureForDispatch(conn, {
      rfq_request_id: d.rfq_request_id,
      dispatch_id: dispatchId,
      shop_id: d.shop_id,
    });
    row = await convRepo.findByDispatchForRfqRequest(
      dispatchId,
      access.rfqRequestId,
      conn,
    );
    return row;
  }

  throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
}

/**
 * Stage a conversation image (sharp pipeline). Returns attachment row id + url.
 */
export async function uploadConversationImage(dispatchId, access, fileBuffer, fileMeta = {}) {
  if (!fileBuffer?.length) {
    throw Object.assign(new Error("MISSING_FILE"), { status: 400 });
  }

  const conversation = await resolveConversationForAccess(dispatchId, access);
  if (!conversation) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
  if (conversation.status === "closed") {
    throw Object.assign(new Error("CONVERSATION_CLOSED"), { status: 400 });
  }

  const { url, byte_size, thumbnails } = await saveConversationImageBuffer(fileBuffer, {
    dispatch_id: dispatchId,
    sender_type: access.type === "shop" ? "shop" : "buyer",
    mime: fileMeta.mime ?? null,
    input_bytes: fileMeta.size ?? fileBuffer.length,
  });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const attachmentId = await attRepo.insertStaging(conn, {
      conversation_id: conversation.id,
      url,
      mime_type: "image/jpeg",
      byte_size,
    });
    await conn.commit();

    rfqLog.info("rfq.conversation.image_staged", {
      dispatch_id: dispatchId,
      conversation_id: conversation.id,
      attachment_id: attachmentId,
      url,
    });

    return {
      ok: true,
      attachmentId,
      url,
      thumbnails: thumbnails || null,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Send text and/or image message. Push is async after commit.
 */
export async function sendConversationMessage(dispatchId, access, payload = {}) {
  const { messageText, attachmentIds } = validateConversationMessagePayload(payload);
  const conn = await pool.getConnection();
  const sender_type = access.type === "shop" ? "shop" : "buyer";

  rfqLog.info("rfq.conversation.message_send_start", {
    dispatch_id: dispatchId,
    sender_type,
    shop_id: access.type === "shop" ? access.shopId : null,
    text_len: messageText?.length ?? 0,
    attachment_count: attachmentIds.length,
  });

  try {
    await conn.beginTransaction();
    const conversation = await resolveConversationForAccess(dispatchId, access, conn);
    if (!conversation) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
    if (conversation.status === "closed") {
      throw Object.assign(new Error("CONVERSATION_CLOSED"), { status: 400 });
    }

    const prevLatestMessageId = await msgRepo.findLatestMessageId(conversation.id, conn);

    let staged = [];
    if (attachmentIds.length) {
      if (attachmentIds.length > attRepo.RFQ_MAX_ATTACHMENTS_PER_MESSAGE) {
        throw Object.assign(new Error("TOO_MANY_ATTACHMENTS"), { status: 400 });
      }
      staged = await attRepo.findStagedByIds(conversation.id, attachmentIds, conn);
      if (staged.length !== attachmentIds.length) {
        throw Object.assign(new Error("INVALID_ATTACHMENTS"), { status: 400 });
      }
      const cutoff = Date.now() - attRepo.RFQ_STAGING_MAX_AGE_MS;
      for (const s of staged) {
        const created = new Date(s.created_at).getTime();
        if (created < cutoff) {
          throw Object.assign(new Error("ATTACHMENT_EXPIRED"), { status: 400 });
        }
      }
    }

    const sender_shop_id = access.type === "shop" ? access.shopId : null;
    const message_type = attachmentIds.length > 0 ? "image" : "text";

    const messageId = await msgRepo.insertMessage(conn, {
      conversation_id: conversation.id,
      sender_type,
      sender_shop_id,
      message_type,
      message_text: messageText,
      attachments_json: attachmentIds.length
        ? { attachment_ids: attachmentIds }
        : null,
    });

    if (attachmentIds.length) {
      await attRepo.linkStagedToMessage(conn, messageId, attachmentIds, conversation.id);
    }

    await convRepo.touchLastMessageAt(conn, conversation.id);

    if (sender_type === "shop") {
      await reqRepo.markFirstShopMessageAt(conn, conversation.rfq_request_id);
      await dispatchRepo.markFirstShopMessageAt(conn, dispatchId);
    }

    await conn.commit();

    const message = await msgRepo.findMessageById(messageId);
    const finalType = message?.message_type || (attachmentIds.length ? "image" : "text");

    rfqLog.info("rfq.conversation.message_created", {
      dispatch_id: dispatchId,
      conversation_id: conversation.id,
      message_id: messageId,
      sender_type,
      message_type: finalType,
    });

    notifyConversationMessagePush({
      dispatchId,
      conversationId: conversation.id,
      rfqRequestId: conversation.rfq_request_id,
      shopId: conversation.shop_id,
      messageId,
      senderType: sender_type,
      messageText,
      messageType: finalType,
      attachmentCount: attachmentIds.length,
      prevLatestMessageId,
    });

    if (sender_type === "buyer") {
      void tryAttributeReminderConversion(conversation.rfq_request_id, "buyer_message", {
        source: "conversation_send",
        dispatch_id: dispatchId,
        message_id: messageId,
      });
    }

    return {
      ok: true,
      message,
      conversation_id: conversation.id,
      dispatch_id: dispatchId,
    };
  } catch (e) {
    await conn.rollback();
    rfqLog.error("rfq.conversation.message_send_failed", {
      dispatch_id: dispatchId,
      sender_type,
      err: String(e?.message || e),
      sql_code: e?.code ?? null,
      sql_errno: e?.errno ?? null,
    });
    throw e;
  } finally {
    conn.release();
  }
}

/** @deprecated alias — use sendConversationMessage */
export async function sendTextMessage(dispatchId, access, { text }) {
  return sendConversationMessage(dispatchId, access, { text });
}

/**
 * Idempotent: seed buyer's initial RFQ images into each shop conversation timeline.
 */
export async function seedRequestImagesForConversation(conversation, conn = null) {
  const c = conn || pool;
  const existing = await attRepo.findSeedMessageByKind(
    conversation.id,
    "rfq_request_images",
    c,
  );
  if (existing) return { skipped: true };

  const [[reqRow]] = await c.query(
    `SELECT images_json FROM rfq_requests WHERE id = ? LIMIT 1`,
    [conversation.rfq_request_id],
  );
  if (!reqRow) return { skipped: true };

  let urls = reqRow.images_json;
  try {
    urls = typeof urls === "string" ? JSON.parse(urls) : urls;
  } catch {
    urls = [];
  }
  if (!Array.isArray(urls) || !urls.length) return { skipped: true };

  const valid = urls
    .map((u) => String(u || "").trim())
    .filter(
      (u) =>
        u.startsWith("/uploads/rfq/") ||
        u.startsWith("http://") ||
        u.startsWith("https://"),
    );
  if (!valid.length) return { skipped: true };

  const ownConn = conn ? null : await pool.getConnection();
  const tx = ownConn || conn;
  try {
    if (ownConn) await ownConn.beginTransaction();

    const messageId = await msgRepo.insertMessage(tx, {
      conversation_id: conversation.id,
      sender_type: "buyer",
      sender_shop_id: null,
      message_type: "image",
      message_text: "Ảnh đính kèm yêu cầu báo giá",
      metadata_json: { seed: "rfq_request_images" },
    });

    await attRepo.insertAttachmentsForMessage(
      tx,
      conversation.id,
      messageId,
      valid.map((url, i) => ({ url, mime_type: "image/jpeg", sort_order: i })),
    );

    await convRepo.touchLastMessageAt(tx, conversation.id);

    if (ownConn) await ownConn.commit();

    rfqLog.info("rfq.conversation.request_images_seeded", {
      conversation_id: conversation.id,
      dispatch_id: conversation.dispatch_id,
      image_count: valid.length,
    });
    return { message_id: messageId, image_count: valid.length };
  } catch (e) {
    if (ownConn) await ownConn.rollback();
    rfqLog.warn("rfq.conversation.request_images_seed_failed", {
      conversation_id: conversation.id,
      err: String(e?.message || e),
    });
    return { skipped: true, error: true };
  } finally {
    if (ownConn) ownConn.release();
  }
}

async function readMetaForConversation(conversation, access) {
  const participantType = readRepo.participantTypeForAccess(access);
  const participantShopId = readRepo.participantShopIdForAccess(access);
  const cursor = await readRepo.findReadCursor(
    conversation.id,
    participantType,
    participantShopId,
  );
  const unread_count = await readRepo.countUnreadForParticipant(
    conversation.id,
    participantType,
    participantShopId,
  );
  return {
    unread_count,
    last_read_message_id: cursor?.last_read_message_id ?? null,
    last_read_at: cursor?.last_read_at ?? null,
  };
}

/**
 * Mark messages read up to messageId (or latest in room if omitted).
 * Polling remains sync transport — websocket deferred.
 */
export async function markConversationRead(dispatchId, access, { messageId } = {}) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const conversation = await resolveConversationForAccess(dispatchId, access, conn);
    if (!conversation) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });

    const participantType = readRepo.participantTypeForAccess(access);
    const participantShopId = readRepo.participantShopIdForAccess(access);

    let targetId =
      messageId != null && messageId !== "" ? Number(messageId) : null;
    if (targetId != null && (!Number.isFinite(targetId) || targetId <= 0)) {
      throw Object.assign(new Error("INVALID_MESSAGE_ID"), { status: 400 });
    }
    if (targetId == null) {
      targetId = await msgRepo.findLatestMessageId(conversation.id, conn);
    }
    if (targetId == null) {
      await conn.commit();
      return {
        ok: true,
        dispatch_id: dispatchId,
        conversation_id: conversation.id,
        last_read_message_id: null,
        unread_count: 0,
      };
    }

    const msg = await msgRepo.findMessageById(targetId, conn);
    if (!msg || Number(msg.conversation_id) !== Number(conversation.id)) {
      throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
    }

    const cursor = await readRepo.findReadCursor(
      conversation.id,
      participantType,
      participantShopId,
      conn,
    );
    const prevRead = cursor?.last_read_message_id != null
      ? Number(cursor.last_read_message_id)
      : 0;
    if (targetId < prevRead) {
      targetId = prevRead;
    }

    await readRepo.upsertReadCursor(conn, {
      conversation_id: conversation.id,
      participant_type: participantType,
      participant_shop_id: participantShopId,
      last_read_message_id: targetId,
    });

    await conn.commit();

    const unread_count = await readRepo.countUnreadForParticipant(
      conversation.id,
      participantType,
      participantShopId,
    );

    rfqLog.info("rfq.conversation.mark_read", {
      dispatch_id: dispatchId,
      conversation_id: conversation.id,
      participant_type: participantType,
      last_read_message_id: targetId,
    });

    return {
      ok: true,
      dispatch_id: dispatchId,
      conversation_id: conversation.id,
      last_read_message_id: targetId,
      last_read_at: new Date().toISOString(),
      unread_count,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function listMessages(dispatchId, access, query = {}) {
  let conversation = null;

  if (access.type === "shop") {
    const row = await convRepo.findByDispatchForShop(dispatchId, access.shopId);
    if (!row) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
    conversation = row;
  } else if (access.type === "buyer") {
    conversation = await convRepo.findByDispatchForRfqRequest(
      dispatchId,
      access.rfqRequestId,
    );
    if (!conversation) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
  } else {
    throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
  }

  await seedRequestImagesForConversation(conversation);

  const page = await msgRepo.listMessagesForConversation(conversation.id, query);
  const readMeta = await readMetaForConversation(conversation, access);
  return {
    conversation_id: conversation.id,
    dispatch_id: conversation.dispatch_id,
    ...page,
    ...readMeta,
  };
}

/** Batch unread for buyer shop picker — indexed, single query. */
export async function getUnreadByDispatchForBuyer(access, dispatchIds) {
  if (access.type !== "buyer") {
    throw Object.assign(new Error("FORBIDDEN"), { status: 403 });
  }
  const map = await readRepo.countUnreadByDispatchForBuyer(
    access.rfqRequestId,
    dispatchIds,
  );
  const items = [...map.entries()].map(([dispatch_id, unread_count]) => ({
    dispatch_id,
    unread_count,
  }));
  const total_unread = items.reduce((s, i) => s + i.unread_count, 0);
  return { items, total_unread };
}

/** Shop inbox enrichment — call once per list load. */
export async function getMessageUnreadMapForShop(shopId) {
  return readRepo.countUnreadByDispatchForShop(shopId);
}
