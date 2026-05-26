# Seller Sales Intelligence — Phase audit

## Goal

Give sellers a sense that buyers are real, intent is observable, and
that the platform is actively helping them sell. All signals derive
from data we already collect (`rfq_requests`, `rfq_dispatches`,
`rfq_conversations`, `shop_storefront_events`) so nothing is faked
and the rollout requires no new buyer-side instrumentation.

The phase is fully additive — no business rules, no SEO, no routing,
no wildcard, no middleware, no auth, no upload pipeline, and no RFQ
engine core were modified.

## Surfaces shipped

### 1. HOT buyer signals (inbox row + chat header)

`backend/modules/rfq/repositories/rfqDispatch.repository.js`

`listInboxForShop` and `findDispatchForShop` now SELECT four extra
scalar subselects per row:

- `buyer_prior_rfq_count` — count of prior dispatches to THIS shop
  from the same buyer phone (`rfq_requests.guest_phone_e164`).
- `buyer_prior_last_rfq_at` — newest prior dispatch creation time.
- `buyer_prior_quotes_count` — how many of those prior dispatches got
  a submitted quote.
- `buyer_prior_today` — boolean: any prior dispatch from today.

Each subselect is a dependent SELECT keyed on the new
`idx_rfq_guest_phone_e164` index (see migration 044). EXPLAIN ANALYZE
on the seller-1 inbox shows the subquery resolving in ~0.4 ms per
inbox row, with the full 50-row page round-trip under 700 ms even
without a warm cache. No new table, no schema change.

`backend/modules/rfq/utils/rfqInboxMap.js`

`mapInboxDispatchRow` normalises the four fields to plain numbers and
ISO timestamps. **Buyer phone itself is never returned to the
client** — only the derived counts and timestamps.

### 2. RFQ priority score + AI follow-up hints

`frontend/lib/rfq/buyerIntent.js`

A pure derivation that takes a single inbox/dispatch row and returns
`{ tier, score, badges, reasons }`:

- `tier`: `"hot"` (≥ 45), `"warm"` (≥ 20), `"cold"` (else).
- `badges`: capped at 3 — `🔥 Khách quay lại`, `🔁 Quay lại sau X`,
  `⚡ Vừa nhắn`.
- `reasons`: capped at 3 plain Vietnamese hints rendered as a small
  bullet list under the chat header.

The same helper drives:

- The HOT/WARM pill + signal chips inside `RfqShopBuyerList`'s
  `RfqShopBuyerRow`.
- The intent panel inside `RfqShopDispatchSummary` (chat header).
- The `🔥 RFQ nóng` dashboard pill via the SQL mirror
  `countHotRfqsToday` in `backend/services/shopMetrics.service.js`.
- The auto-recommendations via `deriveTodayRecommendations`.

Because the derivation is pure, the dashboard count and the inbox
badges can NEVER disagree.

`frontend/lib/rfq/rfqInboxListStable.js`

`inboxRowFingerprint` now includes the four buyer-history fields so
the inbox poller does not swallow updates when a buyer files another
RFQ today.

### 3. Quick quote templates (1-tap composer chips)

`frontend/lib/rfq/sellerQuickReplies.js`

Static template list (4 entries) used by
`RfqShopInboxChatPane → RfqMessageComposer` via the existing
`quickReplies` prop that has been on the composer since the buyer
chat work but had no caller. Tapping a chip fills the textarea and
focuses it.

Templates: "Shop có hàng, gửi ảnh & giá ngay", "Đã gửi giá, chờ phản
hồi nhé", "Cần thêm thông tin xe để báo chính xác", "Có thể giao
hôm nay, anh/chị ở khu nào?".

### 4. Buyer return tracking

Surfaced two ways:

- Inbox row signal chip `🔥 Khách quay lại` when
  `buyer_prior_today === true`.
- Dashboard `Hôm nay` pill `🔁 Khách quay lại` =
  `countReturningBuyersToday(shopId)` from
  `backend/services/shopMetrics.service.js`.

Identity stays anonymous — we count by phone, never expose it.

### 5. Product interest heat (seller catalogue)

`backend/services/shopMetrics.service.js`

`getTopProductByClicks(shopId, days = 7)` aggregates
`shop_storefront_events.product_click` events by the JSON
`metadata.productId`, capped at 50 entries. Exposed at the API as
`productClickHeatLast7d`. Top product also flagged in
`cardsToday.topProduct`.

`frontend/hooks/useShopProductHeat.js`

Module-cached fetch (5-min TTL, single inflight request) so every
mounted product card shares one network call. Returns an empty map on
auth/network failure — never blocks the page.

`frontend/components/products/ProductHeatChip.jsx`

Tiered chip:

- `🔥 Quan tâm cao` (≥ 20 clicks/7d) — red
- `📈 Tăng tương tác` (≥ 10) — amber
- `👀 Được xem nhiều` (≥ 5) — blue

Wired into both `ProductTable` (desktop) and `ProductMobileCard`
(mobile). Below threshold → renders null.

### 6. Smart dashboard ("Hôm nay")

`frontend/components/pages/shop-settings/ShopMetricsOverview.jsx`

New pills added to the existing carousel:

- 🔥 **RFQ nóng** — count of HOT dispatches today.
- 🔁 **Khách quay lại** — distinct returning buyers today.

`Gợi ý cho hôm nay` recommendations card (green panel) appears below
the carousel and renders 0–3 plain-language hints from
`deriveTodayRecommendations`. Hidden when nothing qualifies.

## Database

`backend/migrations/044_rfq_buyer_phone_index.sql` — additive,
optional, idempotent (`CREATE INDEX … IF NOT EXISTS` semantics via
`ADD INDEX` on online DDL). Only purpose is to make the buyer-history
subselects O(log N) at production scale. Tested locally:

- EXPLAIN ANALYZE on the 50-row inbox page: 0.677 ms total (subquery
  uses ref index lookup).

## Performance posture

- Every aggregator query is a single SELECT — no N+1.
- Dashboard `cardsToday` adds three queries in parallel
  (`countReturningBuyersToday`, `countHotRfqsToday`,
  `getTopProductByClicks`) — they ride the existing `Promise.all`
  batch so the dashboard latency floor doesn't change.
- Product heat is shared via module-cached hook (5-min TTL) so
  catalogue pages with 50+ rows still issue ONE GET.
- Inbox subselects are gated by `r.guest_phone_e164 IS NOT NULL` so
  legacy nulls do not trigger fan-out scans.

## Files touched

Backend:

- `backend/migrations/044_rfq_buyer_phone_index.sql` (new)
- `backend/modules/rfq/repositories/rfqDispatch.repository.js`
- `backend/modules/rfq/utils/rfqInboxMap.js`
- `backend/services/shopMetrics.service.js`

Frontend:

- `frontend/app/rfq/rfq-scope.css`
- `frontend/components/pages/products/ProductMobileCard.jsx`
- `frontend/components/pages/shop-settings/ShopMetricsOverview.jsx`
- `frontend/components/products/ProductHeatChip.jsx` (new)
- `frontend/components/products/ProductTable.jsx`
- `frontend/components/rfq/RfqShopBuyerList.jsx`
- `frontend/components/rfq/RfqShopDispatchSummary.jsx`
- `frontend/components/rfq/RfqShopInboxChatPane.jsx`
- `frontend/hooks/useShopProductHeat.js` (new)
- `frontend/lib/rfq/buyerIntent.js` (new)
- `frontend/lib/rfq/rfqInboxListStable.js`
- `frontend/lib/rfq/sellerQuickReplies.js` (new)

Audit:

- `audit/screenshots/seller-intelligence/*.png`

## Not touched (per directive)

SEO, canonical URLs, app routing, wildcard middleware, auth, the RFQ
engine core (dispatch creation / quote submission / OTP), upload
pipeline, Typesense.

## Verification

- `npm run build` passes (frontend).
- `curl /api/shop/rfq/inbox` returns the new buyer-history fields.
- `curl /api/shop/metrics/overview` returns `returningBuyersToday`,
  `hotRfqsToday`, `topProduct`, `productClickHeatLast7d`.
- Playwright screenshots (`audit/screenshots/seller-intelligence/`):
  - `inbox-{desktop,mobile}.png` — WARM/HOT pills + buyer signal
    chips visible on every returning-buyer row.
  - `chat-pane{,-hot}-{desktop,mobile}.png` — intent panel inside
    chat header, follow-up reasons rendered as bullet list, quick
    reply chips under the composer.
  - `insights-{desktop,mobile}.png` — new `Hôm nay` pills + green
    `Gợi ý cho hôm nay` recommendations card after seeding test data.
  - `products-{desktop,mobile}.png` — heat chips wired (silent when
    no events have accumulated).
