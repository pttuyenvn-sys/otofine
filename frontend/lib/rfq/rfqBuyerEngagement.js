/**
 * Buyer engagement UX — conversation-first (quote optional).
 */

export const BUYER_PHASE_HEADLINES = {
  pending: "Đang tìm shop",
  dispatched: "Shop đang xem yêu cầu",
  engaged: "Shop đang trao đổi",
  quoted: "Đã có báo giá",
};

export function computeBuyerPhase({
  quoteCount = 0,
  dispatchCount = 0,
  firstShopMessageAt = null,
} = {}) {
  const quotes = Number(quoteCount) || 0;
  const dispatches = Number(dispatchCount) || 0;
  const engaged =
    firstShopMessageAt != null && String(firstShopMessageAt).trim() !== "";

  if (quotes > 0) return "quoted";
  if (engaged) return "engaged";
  if (dispatches > 0) return "dispatched";
  return "pending";
}

function latestActivityTs(timelineItems, dispatchId) {
  const id = Number(dispatchId);
  let latest = 0;
  for (const m of timelineItems || []) {
    if (Number(m.dispatchId) !== id) continue;
    const t = new Date(m.created_at).getTime();
    if (Number.isFinite(t) && t >= latest) latest = t;
  }
  return latest;
}

/** Default tab: unread → latest activity → first dispatch. */
export function pickDefaultDispatchId(
  options,
  { unreadByDispatch = {}, timelineItems = [], deepLinkDispatchId } = {},
) {
  if (!options?.length) return null;

  if (deepLinkDispatchId != null) {
    const id = Number(deepLinkDispatchId);
    if (options.some((o) => Number(o.dispatchId) === id)) return id;
  }

  const withUnread = options.filter(
    (o) => (unreadByDispatch[o.dispatchId] ?? 0) > 0,
  );
  if (withUnread.length === 1) return withUnread[0].dispatchId;

  if (withUnread.length > 1) {
    let best = withUnread[0];
    let bestUnread = unreadByDispatch[best.dispatchId] ?? 0;
    let bestActivity = latestActivityTs(timelineItems, best.dispatchId);
    for (let i = 1; i < withUnread.length; i += 1) {
      const o = withUnread[i];
      const u = unreadByDispatch[o.dispatchId] ?? 0;
      const act = latestActivityTs(timelineItems, o.dispatchId);
      if (u > bestUnread || (u === bestUnread && act > bestActivity)) {
        best = o;
        bestUnread = u;
        bestActivity = act;
      }
    }
    return best.dispatchId;
  }

  let latestId = null;
  let latestTs = 0;
  for (const m of timelineItems || []) {
    const d = Number(m.dispatchId);
    if (!options.some((o) => Number(o.dispatchId) === d)) continue;
    const t = new Date(m.created_at).getTime();
    if (Number.isFinite(t) && t >= latestTs) {
      latestTs = t;
      latestId = d;
    }
  }
  if (latestId != null) return latestId;

  return options[0].dispatchId;
}

export function getThreadEmptyState({
  hasDispatches = false,
  activeDispatchId = null,
  activeThreadItems = [],
  timelineLoading = false,
} = {}) {
  if (!hasDispatches || !activeDispatchId) {
    return { emptyTitle: "Đang tìm shop", showComposer: false };
  }
  if (timelineLoading && !activeThreadItems?.length) {
    return { emptyTitle: null, showComposer: true };
  }
  if (!activeThreadItems?.length) {
    return { emptyTitle: "Shop đang xem yêu cầu", showComposer: true };
  }
  return { emptyTitle: null, showComposer: true };
}

export function deriveBuyerEngagement(data) {
  const st = data?.status || "";
  const quoteCount = Number(data?.quoteCount ?? data?.quotes?.length ?? 0);
  const dispatchCount = Number(data?.dispatchCount ?? data?.dispatches?.length ?? 0);
  const firstShopMessageAt = data?.firstShopMessageAt ?? null;

  let expiresMs = NaN;
  if (data?.expiresAt) {
    expiresMs = new Date(data.expiresAt).getTime();
  }
  const expiredByTime = Number.isFinite(expiresMs) && expiresMs < Date.now();
  const expired = st === "expired" || expiredByTime;
  const cancelled = st === "cancelled";

  const buyerPhase =
    data?.buyerPhase ??
    computeBuyerPhase({ quoteCount, dispatchCount, firstShopMessageAt });

  let headline = BUYER_PHASE_HEADLINES[buyerPhase] || BUYER_PHASE_HEADLINES.pending;
  let tone = "neutral";

  if (cancelled) {
    headline = "Đã huỷ";
    tone = "muted";
  } else if (expired) {
    headline = "Hết hạn";
    tone = "warn";
  } else if (buyerPhase === "quoted") {
    tone = "success";
  } else if (buyerPhase === "engaged") {
    tone = "live";
  } else if (buyerPhase === "dispatched") {
    tone = "live";
  } else if (st === "closed") {
    headline = "Đã đóng";
    tone = "muted";
  }

  const engaged = Boolean(
    firstShopMessageAt != null && String(firstShopMessageAt).trim() !== "",
  );
  const quoted = quoteCount > 0;

  const timeline = [
    {
      key: "sent",
      title: "Đã gửi",
      done: true,
      current: false,
    },
  ];

  if (!cancelled && !expired) {
    timeline.push({
      key: "exchange",
      title: "Shop trao đổi",
      done: engaged,
      current: !engaged && dispatchCount > 0 && !quoted,
    });
    timeline.push({
      key: "quotes",
      title: "Báo giá",
      done: quoted,
      current: engaged && !quoted,
    });
  }

  return {
    headline,
    tone,
    expired,
    cancelled,
    timeline,
    buyerPhase,
    quoteCount,
    dispatchCount,
    firstShopMessageAt,
  };
}
