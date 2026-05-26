/** Stable compare/merge for GET /rfq/by-token — avoid page rerenders on noop poll. */

function jsonStable(v) {
  if (v == null) return "";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function quoteRowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Number(a.id) === Number(b.id) &&
    Number(a.dispatchId) === Number(b.dispatchId) &&
    Number(a.priceAmount) === Number(b.priceAmount) &&
    (a.currency || "VND") === (b.currency || "VND") &&
    (a.shopName || "") === (b.shopName || "") &&
    (a.lineType || "") === (b.lineType || "") &&
    (a.note || "") === (b.note || "")
  );
}

export function rfqQuotesSignature(quotes) {
  if (!quotes?.length) return "0";
  return quotes
    .map(
      (q) =>
        `${q.id}:${q.dispatchId}:${q.priceAmount}:${q.currency || ""}:${q.shopName || ""}:${q.lineType || ""}:${q.note || ""}`,
    )
    .sort()
    .join("|");
}

export function rfqDispatchesSignature(dispatches) {
  if (!dispatches?.length) return "0";
  return dispatches
    .map((d) => `${d.dispatchId}:${d.shopId ?? ""}:${d.shopName || ""}`)
    .sort()
    .join("|");
}

export function rfqByTokenContentEqual(prev, next) {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.status !== next.status) return false;
  if (prev.publicId !== next.publicId) return false;
  if (prev.partDescription !== next.partDescription) return false;
  if (String(prev.expiresAt ?? "") !== String(next.expiresAt ?? "")) return false;
  if (jsonStable(prev.vehicle) !== jsonStable(next.vehicle)) return false;
  if (jsonStable(prev.images) !== jsonStable(next.images)) return false;
  if (rfqQuotesSignature(prev.quotes) !== rfqQuotesSignature(next.quotes)) return false;
  if (rfqDispatchesSignature(prev.dispatches) !== rfqDispatchesSignature(next.dispatches)) {
    return false;
  }
  if (String(prev.firstShopMessageAt ?? "") !== String(next.firstShopMessageAt ?? "")) {
    return false;
  }
  if (prev.buyerPhase !== next.buyerPhase) return false;
  if (Number(prev.dispatchCount ?? 0) !== Number(next.dispatchCount ?? 0)) return false;
  return Number(prev.quoteCount ?? 0) === Number(next.quoteCount ?? 0);
}

/** Preserve quote row refs; return `prev` root when nothing material changed. */
export function stabilizeRfqByTokenData(prev, incoming) {
  if (!incoming) return prev ?? null;
  if (!prev) return incoming;
  if (rfqByTokenContentEqual(prev, incoming)) return prev;

  const prevQuotes = Array.isArray(prev.quotes) ? prev.quotes : [];
  const nextQuotes = Array.isArray(incoming.quotes) ? incoming.quotes : [];
  const prevDispatches = Array.isArray(prev.dispatches) ? prev.dispatches : [];
  const nextDispatches = Array.isArray(incoming.dispatches) ? incoming.dispatches : [];
  const prevById = new Map(prevQuotes.map((q) => [Number(q.id), q]));

  let quotesChanged = prevQuotes.length !== nextQuotes.length;
  const mergedQuotes = nextQuotes.map((q) => {
    const old = prevById.get(Number(q.id));
    if (old && quoteRowEqual(old, q)) return old;
    quotesChanged = true;
    return q;
  });

  const vehicleSame = jsonStable(prev.vehicle) === jsonStable(incoming.vehicle);
  const imagesSame = jsonStable(prev.images) === jsonStable(incoming.images);

  const dispatchesChanged =
    rfqDispatchesSignature(prevDispatches) !== rfqDispatchesSignature(nextDispatches);

  const engagementSame =
    String(prev.firstShopMessageAt ?? "") === String(incoming.firstShopMessageAt ?? "") &&
    prev.buyerPhase === incoming.buyerPhase &&
    Number(prev.dispatchCount ?? 0) === Number(incoming.dispatchCount ?? 0) &&
    Number(prev.quoteCount ?? 0) === Number(incoming.quoteCount ?? 0);

  if (
    prev.status === incoming.status &&
    prev.publicId === incoming.publicId &&
    prev.partDescription === incoming.partDescription &&
    String(prev.expiresAt ?? "") === String(incoming.expiresAt ?? "") &&
    !quotesChanged &&
    !dispatchesChanged &&
    engagementSame &&
    vehicleSame &&
    imagesSame
  ) {
    return prev;
  }

  return {
    ...incoming,
    quotes: quotesChanged ? mergedQuotes : prevQuotes,
    dispatches: dispatchesChanged ? nextDispatches : prevDispatches,
    vehicle: vehicleSame ? prev.vehicle : incoming.vehicle,
    images: imagesSame ? prev.images : incoming.images,
  };
}

export function stableSortedQuotes(quotes) {
  if (!quotes?.length) return [];
  return [...quotes].sort(
    (a, b) => Number(a.priceAmount) - Number(b.priceAmount) || Number(a.id) - Number(b.id),
  );
}

export function mergeStableSortedQuotes(prevSorted, quotes) {
  const sorted = stableSortedQuotes(quotes);
  if (!sorted.length) return sorted;
  if (
    prevSorted?.length === sorted.length &&
    prevSorted.every((q, i) => q === sorted[i] || quoteRowEqual(q, sorted[i]))
  ) {
    return prevSorted;
  }
  const prevById = new Map((prevSorted || []).map((q) => [Number(q.id), q]));
  const next = sorted.map((q) => {
    const old = prevById.get(Number(q.id));
    return old && quoteRowEqual(old, q) ? old : q;
  });
  if (
    prevSorted?.length === next.length &&
    prevSorted.every((q, i) => q === next[i])
  ) {
    return prevSorted;
  }
  return next;
}

export function buildMessageDispatchOptions(sortedQuotes) {
  return buildMessageDispatchOptionsFromDispatches([], sortedQuotes);
}

/**
 * Chat-first: tabs from dispatches (rooms exist before quote). Quotes enrich shop labels.
 */
export function buildMessageDispatchOptionsFromDispatches(dispatches, sortedQuotes) {
  const quoteByDispatch = {};
  for (const q of sortedQuotes || []) {
    const id = Number(q.dispatchId);
    if (Number.isFinite(id) && id > 0) quoteByDispatch[id] = q;
  }

  const seen = new Set();
  const opts = [];

  for (const d of dispatches || []) {
    const id = Number(d.dispatchId ?? d.dispatch_id);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    const q = quoteByDispatch[id];
    opts.push({
      dispatchId: id,
      shopName:
        q?.shopName ||
        d.shopName ||
        d.shop_name ||
        (d.shopId ? `Shop #${d.shopId}` : `Shop #${id}`),
      shopId: d.shopId ?? d.shop_id ?? q?.shopId ?? null,
    });
  }

  return opts;
}

export function dispatchOptionsEqual(a, b) {
  if (a === b) return true;
  if (!a?.length && !b?.length) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].dispatchId !== b[i].dispatchId || a[i].shopName !== b[i].shopName) {
      return false;
    }
  }
  return true;
}

export function mergeDispatchOptionsFromDispatches(prev, dispatches, sortedQuotes) {
  const next = buildMessageDispatchOptionsFromDispatches(dispatches, sortedQuotes);
  return dispatchOptionsEqual(prev, next) ? prev : next;
}

export function mergeDispatchOptions(prev, sortedQuotes) {
  const next = buildMessageDispatchOptions(sortedQuotes);
  return dispatchOptionsEqual(prev, next) ? prev : next;
}

export function buildQuotesByDispatch(sortedQuotes) {
  const map = {};
  for (const q of sortedQuotes) {
    const id = Number(q.dispatchId);
    if (Number.isFinite(id) && id > 0 && !map[id]) map[id] = q;
  }
  return map;
}

export function quotesByDispatchEqual(a, b) {
  if (a === b) return true;
  const ak = Object.keys(a || {});
  const bk = Object.keys(b || {});
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export function mergeQuotesByDispatch(prev, sortedQuotes) {
  const next = buildQuotesByDispatch(sortedQuotes);
  return quotesByDispatchEqual(prev, next) ? prev : next;
}

/** Filter thread — reuse array ref when membership unchanged. */
export function filterThreadItemsStable(items, dispatchId, cache) {
  if (!dispatchId) return items;
  const id = Number(dispatchId);
  const c = cache || { source: null, dispatchId: null, filtered: [] };
  if (c.source === items && c.dispatchId === id) return c.filtered;

  const filtered = items.filter((m) => Number(m.dispatchId) === id);
  if (
    c.source === items &&
    c.dispatchId === id &&
    c.filtered.length === filtered.length &&
    c.filtered.every((m, i) => m === filtered[i])
  ) {
    return c.filtered;
  }
  if (
    c.filtered.length === filtered.length &&
    c.filtered.every((m, i) => m === filtered[i])
  ) {
    c.source = items;
    c.dispatchId = id;
    return c.filtered;
  }
  c.source = items;
  c.dispatchId = id;
  c.filtered = filtered;
  return filtered;
}
