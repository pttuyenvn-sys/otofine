import axios from "axios";
import { API_BASE } from "@/lib/config";

/**
 * Conversation timeline API — dispatchId is the canonical room anchor.
 * rfq_quotes remains source of truth for quotes; messages add text + timeline events.
 * Realtime (websocket) and unread are intentionally client-polled for now.
 */

export async function fetchConversationMessages(dispatchId, { headers = {}, limit = 100, offset = 0 } = {}) {
  const res = await axios.get(`${API_BASE}/rfq/conversations/${dispatchId}/messages`, {
    headers,
    params: { limit, offset },
  });
  return res.data;
}

export async function sendConversationTextMessage(dispatchId, text, { headers = {} } = {}) {
  const res = await axios.post(
    `${API_BASE}/rfq/conversations/${dispatchId}/messages`,
    { text },
    { headers },
  );
  return res.data;
}

/** Mark read through messageId (or latest in room if omitted). */
export async function markConversationRead(dispatchId, { messageId } = {}, { headers = {} } = {}) {
  const res = await axios.post(
    `${API_BASE}/rfq/conversations/${dispatchId}/read`,
    messageId != null ? { messageId } : {},
    { headers },
  );
  return res.data;
}

/** Buyer batch unread — ?dispatchIds=1,2,3 */
export async function fetchConversationUnreadSummary(dispatchIds, { headers = {} } = {}) {
  if (!dispatchIds?.length) return { items: [], total_unread: 0 };
  const res = await axios.get(`${API_BASE}/rfq/conversations/unread-summary`, {
    headers,
    params: { dispatchIds: dispatchIds.join(",") },
  });
  return res.data;
}

export function shopConversationHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function buyerConversationHeaders(viewerToken) {
  return { "X-RFQ-Viewer-Token": viewerToken };
}
