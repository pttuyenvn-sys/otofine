/** Labels for quote line_type on timeline cards (read-only UI). */
export const RFQ_LINE_TYPE_LABEL = {
  oem: "Chính hãng (OEM)",
  aftermarket: "Thương mại / thay thế",
  used: "Hàng tháo / cũ",
  other: "Khác",
  unknown: "",
};

export function formatConversationTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function formatQuoteMoney(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("vi-VN")} ${currency || "VND"}`;
}

/**
 * Merge message pages from multiple dispatches (buyer view) — oldest first, newest at bottom.
 */
export function mergeConversationItems(pages, { shopNameByDispatchId = {} } = {}) {
  const merged = [];
  for (const page of pages) {
    if (!page?.items?.length) continue;
    const dispatchId = page.dispatch_id;
    for (const item of page.items) {
      merged.push({
        ...item,
        dispatchId,
        shopLabel: shopNameByDispatchId[dispatchId] || null,
      });
    }
  }
  merged.sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return Number(a.id) - Number(b.id);
  });
  return merged;
}

export function conversationHasQuoteMessages(items) {
  return items.some((m) => m.message_type === "quote");
}

/** Merge poll results — dedupe by dispatchId+id, preserve oldest→newest order. */
export function mergeSortedMessages(prev, incoming) {
  const map = new Map();
  for (const m of prev) {
    map.set(`${m.dispatchId ?? ""}-${m.id}`, m);
  }
  for (const m of incoming) {
    map.set(`${m.dispatchId ?? ""}-${m.id}`, m);
  }
  return [...map.values()].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return Number(a.id) - Number(b.id);
  });
}

export function isNearScrollBottom(el, thresholdPx = 80) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}
