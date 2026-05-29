import axiosClient from "@/api/axiosClient";
import { API_BASE } from "@/lib/config";
import { getShopToken } from "@/lib/auth/storage";

/**
 * Conversation timeline API — dispatchId is the canonical room anchor.
 * rfq_quotes remains source of truth for quotes; messages add text + timeline events.
 * Realtime (websocket) and unread are intentionally client-polled for now.
 */

export async function fetchConversationMessages(dispatchId, { headers = {}, limit = 100, offset = 0 } = {}) {
  const res = await axiosClient.get(`/rfq/conversations/${dispatchId}/messages`, {
    headers,
    params: { limit, offset },
  });
  return res.data;
}

export async function sendConversationTextMessage(dispatchId, text, { headers = {} } = {}) {
  return sendConversationMessage(dispatchId, { text }, { headers });
}

/** Text and/or staged attachmentIds from upload-image. */
export async function sendConversationMessage(
  dispatchId,
  { text = "", attachmentIds = [] } = {},
  { headers = {} } = {},
) {
  const body = { text: text || "" };
  if (attachmentIds?.length) {
    body.attachmentIds = attachmentIds;
  }
  const res = await axiosClient.post(`/rfq/conversations/${dispatchId}/messages`, body, { headers });
  return res.data;
}

/** Mark read through messageId (or latest in room if omitted). */
export async function markConversationRead(dispatchId, { messageId } = {}, { headers = {} } = {}) {
  const res = await axiosClient.post(`/rfq/conversations/${dispatchId}/read`, messageId != null ? { messageId } : {}, { headers });
  return res.data;
}

/** Buyer batch unread — ?dispatchIds=1,2,3 */
export async function fetchConversationUnreadSummary(dispatchIds, { headers = {} } = {}) {
  if (!dispatchIds?.length) return { items: [], total_unread: 0 };
  const res = await axiosClient.get(`/rfq/conversations/unread-summary`, {
    headers,
    params: { dispatchIds: dispatchIds.join(",") },
  });
  return res.data;
}

export function shopConversationHeaders() {
  try {
    const token = getShopToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export function buyerConversationHeaders(viewerToken) {
  return { "X-RFQ-Viewer-Token": viewerToken };
}
