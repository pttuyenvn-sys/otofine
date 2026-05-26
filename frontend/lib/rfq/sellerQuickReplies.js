/**
 * Seller-side 1-tap quick-reply templates.
 *
 * These are static — the seller can tap a chip to drop the text
 * straight into the composer (existing `quickReplies` prop on
 * `RfqMessageComposer`). The composer ALREADY handles "tap → fill
 * input → focus textarea" so no new wiring on the composer side is
 * needed.
 *
 * Choices intentionally cover the four most common seller intents
 * the team described in the seller-intelligence brief:
 *   - confirm we have stock
 *   - confirm we already quoted
 *   - ask for clarification
 *   - confirm same-day delivery feasibility
 *
 * Mobile-first: the chip row scrolls horizontally if it overflows
 * (handled in rfq-scope.css via `.rfq-msg-composer__chips`).
 *
 * `forDispatch(d)` lets callers pass the current dispatch row so a
 * future iteration can add context-aware templates (e.g. "Đã báo
 * giá X VND") without changing the call sites. Today it returns the
 * same static list regardless of input, but the parameter is part of
 * the API contract so we don't have to refactor every caller later.
 */

const BASE_TEMPLATES = Object.freeze([
  "Shop có hàng, gửi ảnh & giá ngay",
  "Đã gửi giá, chờ phản hồi nhé",
  "Cần thêm thông tin xe để báo chính xác",
  "Có thể giao hôm nay, anh/chị ở khu nào?",
]);

export function sellerQuickReplyTemplates() {
  return BASE_TEMPLATES.slice();
}

export function sellerQuickRepliesForDispatch(/* dispatch */) {
  return BASE_TEMPLATES.slice();
}
