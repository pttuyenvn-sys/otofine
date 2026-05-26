/**
 * Pure derivation of seller-side "buyer intent" signals from a
 * single inbox / dispatch row.
 *
 * NEVER fabricates. Every signal corresponds to a value the seller
 * could verify by clicking into the conversation. The score and the
 * inline badges share the same input so the seller-facing dashboard
 * (HOT count) always matches what they see in the inbox list.
 *
 * Inputs (any subset of the inbox row shape produced by
 * `mapInboxDispatchRow`):
 *   - first_viewed_at
 *   - message_unread_count
 *   - has_submitted_quote
 *   - updated_at
 *   - rfq_created_at
 *   - buyer_prior_rfq_count        ← new (sales-intel)
 *   - buyer_prior_last_rfq_at      ← new
 *   - buyer_prior_quotes_count     ← new
 *   - buyer_prior_today            ← new
 *
 * Output:
 *   {
 *     tier:   "hot" | "warm" | "cold",
 *     score:  number,                 // 0..100, monotonic with tier
 *     badges: [{ key, label, glyph, tone, title? }],  // 0..3
 *     reasons: [string],              // 0..3 plain-language hints
 *   }
 *
 * Design notes:
 *   - Tiers are coarse on purpose. The seller wants a 1-glance
 *     "do I jump on this?" answer, not a 5-decimal-place score.
 *   - Badges are capped at 3 so they don't dominate the inbox row.
 *   - Reasons are plain Vietnamese hints rendered as a small list
 *     under the row (or above the composer). Cap at 3 to keep the
 *     "AI hint" surface readable.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function parseDate(v) {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Plural-friendly Vietnamese day formatter.
 *   1 → "hôm qua", 2 → "2 ngày trước", 0 → "hôm nay"
 */
function vnDaysAgo(ms) {
  if (!Number.isFinite(ms)) return "";
  const days = Math.floor(ms / DAY_MS);
  if (days <= 0) return "hôm nay";
  if (days === 1) return "hôm qua";
  if (days < 7) return `${days} ngày trước`;
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  return `${Math.floor(days / 30)} tháng trước`;
}

export function deriveBuyerIntent(row) {
  if (!row) {
    return { tier: "cold", score: 0, badges: [], reasons: [] };
  }
  const priorRfqCount = Number(row.buyer_prior_rfq_count || 0);
  const priorQuotesCount = Number(row.buyer_prior_quotes_count || 0);
  const priorToday = Boolean(row.buyer_prior_today);
  const priorLastAt = parseDate(row.buyer_prior_last_rfq_at);
  const chatUnread = Number(row.message_unread_count || 0);
  const hasQuote = Boolean(row.has_submitted_quote);
  const isNew = row.first_viewed_at == null;
  const updatedAt = parseDate(row.updated_at) || parseDate(row.rfq_created_at);
  const now = Date.now();

  // ---- raw score (0..100). Caps + diminishing returns by signal. ----
  let score = 0;
  const reasons = [];
  const badges = [];

  if (priorToday) {
    score += 35;
    badges.push({
      key: "returning_today",
      label: "Khách quay lại",
      glyph: "🔥",
      tone: "hot",
      title: "Khách đã có RFQ trước ở shop và quay lại hôm nay",
    });
    reasons.push("Khách quay lại trong cùng ngày — nên báo giá nhanh.");
  } else if (priorRfqCount >= 1 && priorLastAt) {
    score += 22;
    const daysAgo = vnDaysAgo(now - priorLastAt);
    badges.push({
      key: "returning",
      label: `Quay lại sau ${daysAgo}`,
      glyph: "🔁",
      tone: "warm",
      title: `Khách đã có ${priorRfqCount} RFQ trước ở shop, gần nhất ${daysAgo}`,
    });
    reasons.push(`Khách đã hỏi ${priorRfqCount} sản phẩm trước, quay lại ${daysAgo}.`);
  }

  if (priorQuotesCount >= 1 && !priorToday) {
    score += 12;
    reasons.push("Đã từng nhận báo giá từ shop — khả năng chốt cao hơn.");
  }

  if (chatUnread >= 1) {
    // unread = the buyer is actively pinging us — this is the most
    // valuable signal the inbox can surface.
    score += 30;
    badges.push({
      key: "chat_active",
      label: "Vừa nhắn",
      glyph: "⚡",
      tone: "hot",
      title: `${chatUnread} tin nhắn chưa đọc từ khách`,
    });
    if (chatUnread >= 3) {
      reasons.push(`Khách đã nhắn ${chatUnread} tin chưa đọc.`);
    } else {
      reasons.push("Khách đang chờ phản hồi trong chat.");
    }
  }

  if (isNew) {
    // brand-new RFQ that nobody has even opened yet — same urgency
    // bucket as "vừa nhắn" but for the very first contact.
    score += 18;
    if (!chatUnread) {
      reasons.push("RFQ mới — chưa xem.");
    }
  } else if (updatedAt && now - updatedAt <= HOUR_MS && !hasQuote) {
    score += 8;
  }

  if (!hasQuote && !isNew && updatedAt && now - updatedAt > 48 * HOUR_MS) {
    // Stale waiting — explicit cold-cue. Without this even a fresh-
    // looking RFQ could drift past the seller's attention.
    score = Math.max(0, score - 8);
  }

  // Visual cap so the dashboard never has to deal with absurd
  // outliers. The tier thresholds below are the user-facing contract.
  if (score > 100) score = 100;

  let tier;
  if (score >= 45) tier = "hot";
  else if (score >= 20) tier = "warm";
  else tier = "cold";

  // Cap visible badges to 3 (priority order: returning today, chat,
  // returning, others).
  const visibleBadges = badges.slice(0, 3);

  return {
    tier,
    score,
    badges: visibleBadges,
    reasons: reasons.slice(0, 3),
  };
}

/**
 * One-line plain-text label for a tier — used by the colored pill
 * the inbox row renders on its right edge.
 */
export const BUYER_INTENT_TIER_META = Object.freeze({
  hot: {
    label: "HOT",
    title: "Khách đang nóng — phản hồi ngay",
    glyph: "🔥",
  },
  warm: {
    label: "WARM",
    title: "Khách có dấu hiệu quan tâm — nên báo giá sớm",
    glyph: "♨️",
  },
  cold: {
    label: "COLD",
    title: "RFQ thông thường",
    glyph: "❄️",
  },
});

/**
 * Plain helper for the dashboard's "Hôm nay" pill — receives the
 * `cardsToday` payload from `/api/shop/metrics/overview` and returns
 * the list of compact recommendation strings to render. Pure, no
 * fetch, no state.
 */
export function deriveTodayRecommendations(cardsToday = {}) {
  if (!cardsToday || typeof cardsToday !== "object") return [];
  const recs = [];

  if (Number(cardsToday.hotRfqsToday) > 0) {
    recs.push(
      `Có ${cardsToday.hotRfqsToday} RFQ nóng hôm nay — phản hồi nhanh để tăng tỉ lệ chốt.`,
    );
  }
  if (Number(cardsToday.returningBuyersToday) > 0) {
    recs.push(
      `${cardsToday.returningBuyersToday} khách đã hỏi trước đó quay lại — gợi ý gửi báo giá ưu tiên.`,
    );
  }
  if (cardsToday.topProduct?.name && Number(cardsToday.topProduct.clicks) >= 5) {
    recs.push(
      `Sản phẩm "${cardsToday.topProduct.name}" đang được xem nhiều — cân nhắc đẩy lên đầu kệ.`,
    );
  }
  if (Number(cardsToday.outOfStockCount) > 0) {
    recs.push(
      `${cardsToday.outOfStockCount} sản phẩm đang hết hàng — cập nhật tồn kho để không lỡ đơn.`,
    );
  }
  if (
    Number(cardsToday.storefrontViewsToday) >= 20 &&
    Number(cardsToday.rfqReceivedToday) === 0
  ) {
    recs.push(
      "Storefront có lượt xem nhưng chưa có RFQ — thêm sản phẩm hoặc khuyến mãi để chuyển đổi.",
    );
  }
  return recs.slice(0, 3);
}
