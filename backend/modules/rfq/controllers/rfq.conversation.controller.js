import * as convSvc from "../services/rfqConversation.service.js";
import { sendHttpError } from "../utils/httpError.js";
import { rfqLog } from "../utils/rfqLogger.js";

export async function getConversation(req, res) {
  try {
    const dispatchId = Number(req.params.dispatchId);
    const access = req.conversationAccess;

    let data;
    if (access.type === "shop") {
      data = await convSvc.getConversationForShop(dispatchId, access.shopId);
    } else {
      data = await convSvc.getConversationForBuyer(
        dispatchId,
        access.rfqRequestId,
      );
    }

    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

export async function listMessages(req, res) {
  try {
    const dispatchId = Number(req.params.dispatchId);
    const data = await convSvc.listMessages(
      dispatchId,
      req.conversationAccess,
      req.query,
    );
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

/** POST body: optional { messageId } — marks read through that message (or latest). */
export async function markRead(req, res) {
  try {
    const dispatchId = Number(req.params.dispatchId);
    const messageId = req.body?.messageId ?? req.body?.message_id ?? null;
    const data = await convSvc.markConversationRead(
      dispatchId,
      req.conversationAccess,
      { messageId },
    );
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

/** GET ?dispatchIds=1,2,3 — buyer batch unread (no N+1). */
export async function unreadSummary(req, res) {
  try {
    const raw = String(req.query.dispatchIds || "");
    const dispatchIds = raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((id) => Number.isFinite(id) && id > 0);
    const data = await convSvc.getUnreadByDispatchForBuyer(
      req.conversationAccess,
      dispatchIds,
    );
    res.json(data);
  } catch (e) {
    sendHttpError(res, e);
  }
}

/** POST body: { text } — text-only; realtime deferred. */
export async function postMessage(req, res) {
  const dispatchId = Number(req.params.dispatchId);
  const access = req.conversationAccess;

  try {
    const text = req.body?.text ?? req.body?.messageText ?? "";
    rfqLog.info("rfq.conversation.post_message", {
      dispatch_id: dispatchId,
      participant_type: access?.type ?? null,
      has_text: Boolean(String(text ?? "").length),
    });
    const data = await convSvc.sendTextMessage(dispatchId, access, { text });
    res.status(201).json(data);
  } catch (e) {
    const status = Number(e?.status || e?.statusCode || 500);
    rfqLog.error("rfq.conversation.post_message_failed", {
      dispatch_id: dispatchId,
      participant_type: access?.type ?? null,
      status,
      code: String(e?.message || "INTERNAL"),
      sql_code: e?.code ?? null,
      stack: e?.stack ? String(e.stack).split("\n").slice(0, 6).join("\n") : null,
    });
    sendHttpError(res, e);
  }
}
