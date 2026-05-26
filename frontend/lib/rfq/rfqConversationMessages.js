/** Labels for quote line_type on timeline cards (read-only UI). */
export const RFQ_LINE_TYPE_LABEL = {
  oem: "Chính hãng (OEM)",
  aftermarket: "Thương mại / thay thế",
  used: "Hàng tháo / cũ",
  other: "Khác",
  unknown: "",
};

export function messageStableKey(m) {
  return `${m?.dispatchId ?? ""}-${m?.id ?? ""}`;
}

function jsonStable(v) {
  if (v == null) return "";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function attachmentsStable(attachments) {
  if (!attachments?.length) return "";
  return attachments
    .map((a) => `${a.id ?? ""}:${a.url ?? ""}:${a.sort_order ?? ""}`)
    .join("|");
}

/** Shallow content compare — ignores object identity from API re-fetch. */
export function conversationMessageEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Number(a.id) === Number(b.id) &&
    String(a.dispatchId ?? "") === String(b.dispatchId ?? "") &&
    a.message_type === b.message_type &&
    a.sender_type === b.sender_type &&
    (a.message_text ?? "") === (b.message_text ?? "") &&
    String(a.created_at ?? "") === String(b.created_at ?? "") &&
    (a.shopLabel ?? null) === (b.shopLabel ?? null) &&
    attachmentsStable(a.attachments) === attachmentsStable(b.attachments) &&
    jsonStable(a.metadata_json) === jsonStable(b.metadata_json)
  );
}

function sortMessages(list) {
  return [...list].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return Number(a.id) - Number(b.id);
  });
}

/** True when ordered message keys + tail id unchanged (noop poll). */
export function conversationItemsUnchanged(prev, next) {
  if (prev === next) return true;
  if (!prev?.length && !next?.length) return true;
  if (!prev?.length || !next?.length || prev.length !== next.length) return false;
  for (let i = 0; i < prev.length; i += 1) {
    if (messageStableKey(prev[i]) !== messageStableKey(next[i])) return false;
    if (!conversationMessageEqual(prev[i], next[i])) return false;
  }
  return true;
}

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

/** Merge poll results — dedupe by dispatchId+id, preserve stable object refs on noop poll. */
export function mergeSortedMessages(prev, incoming) {
  if (!incoming?.length) return prev;
  if (!prev?.length) return sortMessages(incoming);

  const merged = new Map();
  for (const m of prev) {
    merged.set(messageStableKey(m), m);
  }

  let changed = false;
  for (const m of incoming) {
    const key = messageStableKey(m);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, m);
      changed = true;
      continue;
    }
    if (!conversationMessageEqual(existing, m)) {
      merged.set(key, {
        ...existing,
        ...m,
        shopLabel: m.shopLabel ?? existing.shopLabel,
        attachments: m.attachments ?? existing.attachments,
        metadata_json: m.metadata_json ?? existing.metadata_json,
      });
      changed = true;
    }
  }

  if (!changed) return prev;

  const next = sortMessages([...merged.values()]);
  if (conversationItemsUnchanged(prev, next)) return prev;
  return next;
}

export function isNearScrollBottom(el, thresholdPx = 80) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

/** Short time for bubble grouping (same sender, same type). */
export function formatConversationTimeShort(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Add showTime + isGroupedWithPrev for compact timeline rendering.
 * Reuses enriched wrappers when source message refs are unchanged.
 */
let enrichSourceItems = null;
let enrichDisplayItems = [];

export function enrichMessagesForDisplay(items) {
  if (!items?.length) {
    enrichSourceItems = items;
    enrichDisplayItems = [];
    return enrichDisplayItems;
  }

  if (items === enrichSourceItems) return enrichDisplayItems;

  if (
    enrichSourceItems?.length &&
    conversationItemsUnchanged(enrichSourceItems, items)
  ) {
    enrichSourceItems = items;
    return enrichDisplayItems;
  }

  const prevByIndex = enrichDisplayItems;
  const result = [];
  let reusedAll = items.length === enrichDisplayItems.length;

  for (let i = 0; i < items.length; i += 1) {
    const msg = items[i];
    const prev = i > 0 ? items[i - 1] : null;
    const sameDispatch =
      !prev || String(prev.dispatchId ?? "") === String(msg.dispatchId ?? "");
    const grouped =
      prev &&
      sameDispatch &&
      prev.sender_type === msg.sender_type &&
      prev.message_type === msg.message_type &&
      (msg.message_type === "text" || msg.message_type === "image");
    const prevTime = prev ? new Date(prev.created_at).getTime() : 0;
    const curTime = new Date(msg.created_at).getTime();
    const within5m = prev && Math.abs(curTime - prevTime) < 5 * 60 * 1000;
    const isGroupedWithPrev = Boolean(grouped && within5m);
    const showTime = !grouped || !within5m;

    const old = prevByIndex[i];
    if (
      old &&
      conversationMessageEqual(old, msg) &&
      old.isGroupedWithPrev === isGroupedWithPrev &&
      old.showTime === showTime
    ) {
      result.push(old);
      continue;
    }

    reusedAll = false;
    result.push({ ...msg, isGroupedWithPrev, showTime });
  }

  if (reusedAll && result.every((row, i) => row === enrichDisplayItems[i])) {
    enrichSourceItems = items;
    return enrichDisplayItems;
  }

  enrichSourceItems = items;
  enrichDisplayItems = result;
  return result;
}
