import { isNearScrollBottom } from "@/lib/rfq/rfqConversationMessages";

/** Latest message id per dispatch (buyer merged timeline). */
export function latestMessageIdByDispatch(items) {
  const map = {};
  for (const m of items || []) {
    const d = Number(m.dispatchId);
    const id = Number(m.id);
    if (!Number.isFinite(d) || d <= 0 || !Number.isFinite(id)) continue;
    if (!map[d] || id > map[d]) map[d] = id;
  }
  return map;
}

/**
 * Pick message id to mark read when timeline is considered "seen".
 * Uses stick-to-bottom or short thread (no scroll).
 */
export function pickReadMessageId(items, listEl, stickToBottom) {
  if (!items?.length) return null;
  const latest = Number(items[items.length - 1]?.id);
  if (!Number.isFinite(latest)) return null;
  if (stickToBottom) return latest;
  if (!listEl) return null;
  if (listEl.scrollHeight <= listEl.clientHeight + 12) return latest;
  if (isNearScrollBottom(listEl)) return latest;
  return null;
}

/** Dispatches eligible for mark-read when user is caught up on merged timeline. */
export function pickReadMapForBuyer(items, listEl, stickToBottomRef) {
  const byDispatch = latestMessageIdByDispatch(items);
  const stick = stickToBottomRef?.current === true;
  const el = listEl;
  const nearBottom = el ? isNearScrollBottom(el) : false;
  const shortThread = el ? el.scrollHeight <= el.clientHeight + 12 : false;
  if (!stick && !nearBottom && !shortThread) return {};

  const out = {};
  for (const [d, messageId] of Object.entries(byDispatch)) {
    out[d] = messageId;
  }
  return out;
}
