/**
 * Buyer engagement phase — conversation-first (quote optional).
 */

export function computeBuyerPhase({ quoteCount = 0, dispatchCount = 0, firstShopMessageAt = null } = {}) {
  const quotes = Number(quoteCount) || 0;
  const dispatches = Number(dispatchCount) || 0;
  const engaged = firstShopMessageAt != null && String(firstShopMessageAt).trim() !== "";

  if (quotes > 0) return "quoted";
  if (engaged) return "engaged";
  if (dispatches > 0) return "dispatched";
  return "pending";
}

export function buildBuyerEngagementPayload(rfqRow, { dispatchCount, quoteCount }) {
  const firstShopMessageAt = rfqRow?.first_shop_message_at ?? null;
  const phase = computeBuyerPhase({
    quoteCount,
    dispatchCount,
    firstShopMessageAt,
  });

  return {
    firstShopMessageAt,
    buyerPhase: phase,
    dispatchCount: Number(dispatchCount) || 0,
    quoteCount: Number(quoteCount) || 0,
  };
}
