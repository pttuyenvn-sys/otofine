# Seller Nav Refinement + Storefront Metrics Overview

Simplify the seller-center sidebar, surface the inbox as a first-class
destination, and add a lightweight read-only metrics dashboard at the
top of `/shop/settings`.

Scope: **additive, lightweight, no schema redesign**. All existing
APIs, middleware, routing, and storefront SEO are unchanged.

---

## 1. Sidebar cleanup

`frontend/components/Sidebar.jsx`

- Removed the standalone "+ Add Product" entry. Product creation is
  not lost — `/shop/products` already exposes a "+ Thêm mới" CTA via
  `AddProductPopup`. The sidebar simply stops duplicating it.
- Added "Tin nhắn khách hàng" → `/rfq/shop/inbox` with a red unread
  badge that polls `/api/shop/rfq/inbox/summary` every 60 s.
- Visual style unchanged — same `.sidebar` / `.brand` / `.nav` /
  `.active` classes used by every seller page. The badge is styled
  inline so the change is contained in this file.

Mobile parity: the seller sidebar is hidden under 900 px (existing
behaviour). To keep the inbox reachable on phones, the same entry was
added to the `Topbar` dropdown's shop-role menu (alongside
"Shop Settings" and "Products").

Hook: `frontend/hooks/useShopInboxSummaryBadge.js`
- Polls 60 s (vs the inbox page's 5 s) — sidebar is global chrome and
  needs the lighter cadence.
- Pauses while the tab is hidden (visibility API).
- Silently swallows network errors so the badge can never break the
  rest of the seller chrome.
- Reads token from `localStorage` SSR-safely; bails when missing.

## 2. Storefront analytics ingest (additive)

The existing client-side analytics bus (`shopsiteAnalytics.js`) emits
`shopsite:event` CustomEvents but has no backend persistence. To make
"storefront CTA clicks" a real metric on the seller dashboard, the
following additive layer was introduced:

- Migration `backend/migrations/043_shop_storefront_events.sql`
  - Single new table `shop_storefront_events` (id, shop_id, event_type,
    occurred_at, metadata_json) + two composite indexes matching the
    aggregator queries.
  - Append-only; controller has no UPDATE path.
  - Rolls back with a bare `DROP TABLE`.
- `backend/domains/storefrontEvents/`
  - `storefrontEvents.repository.js` — `insertStorefrontEvent`,
    `countShopEventsByType`. Exposes the whitelisted event-type list.
  - `storefrontEvents.controller.js` — `POST /api/storefront-events/track`.
    No auth, per-IP rate cap (60 events / 60 s), always returns `204`
    even on validation failure so a CTA click is never blocked.
    Resolves slug → shopId via the existing `findPublicShopBySlug`.
  - `storefrontEvents.routes.js` — one verb, single endpoint.
  - Mounted in `server.js` at `/api/storefront-events`.
- Frontend bridge: `StorefrontAnalyticsForwarder.jsx`
  - Subscribes to `window.shopsite:event`.
  - Dedupes (type, key) within 800 ms to suppress double-clicks.
  - `fetch` with `keepalive: true`, fire-and-forget. Adblockers, CSP,
    or backend 5xx are all silently absorbed.
  - Mounted in `app/(shopsite)/shops/[slug]/layout.js` next to the
    existing `ShopAnalyticsBoot`.

Smoke-tested end-to-end: valid event → row inserted; invalid type or
unknown slug → 204 with no row. Wave of `phone_click` / `zalo_click` /
`storefront_view` shows up in the seller dashboard within ~30 s
(server `Cache-Control: private, max-age=30`).

## 3. Shop metrics overview endpoint

Backend:
- `backend/services/shopMetrics.service.js`
  - `getShopMetricsOverview(shopId)` runs 4 sub-queries in parallel:
    - `COUNT(*) FROM products WHERE shopId = ?`
    - `COUNT(*) FROM rfq_dispatches d JOIN rfq_requests r …` (trailing
      30 days, deleted/spam excluded)
    - `COUNT(DISTINCT conv.id) FROM rfq_conversations` (with buyer
      messages in last 30 days)
    - `GROUP BY event_type` on `shop_storefront_events` (last 30 days)
  - No N+1, no per-shop loops, no shared mutable state.
  - Adds new event types to the bus → they appear automatically; no
    schema change.
- `backend/controllers/shopMetrics.controller.js`
  - `Cache-Control: private, max-age=30` so back-to-back loads dedupe.
- `backend/routes/shopMetrics.routes.js`
  - Mounted under `/api/shop/metrics` in `server.js` before the
    legacy `/api/shop` catchall (no overlap).
  - Requires `requireAuth` + `requireShop`.

Frontend:
- `frontend/components/pages/shop-settings/ShopMetricsOverview.jsx`
  - 4 compact stat cards. Desktop: `grid-cols-4`. Mobile:
    `grid-cols-2` (= 2×2).
  - Subtle icons (emerald-tinted), no charts.
  - Loading skeletons (pulsing value placeholder).
  - On network error: cards fall back to `"—"`, layout unchanged —
    the settings form keeps working unconditionally.
  - Compact-number formatting (`2.8k` etc.) keeps long counts from
    breaking the mobile grid.
  - Labels wrap to 2 lines on mobile via line-clamp so no truncation.
- Mounted at the top of `/shop/settings`, just under the page header
  and above the existing completion + SEO panels.

## 4. Performance considerations

- All counts are aggregate. The slowest sub-query is the products
  count, already indexed by `shopId` (existing). On a shop with 2806
  products the full overview completes in <50 ms locally.
- The events table has two composite indexes (`shop_id, event_type,
  occurred_at` and `event_type, occurred_at`) matching the only two
  read paths.
- 30 s response cache on the metrics endpoint dedupes back-to-back
  page loads.
- Sidebar badge polls every 60 s and pauses when tab is hidden.
- Analytics forwarder uses `keepalive: true` so unload-time events
  still flush; never blocks paint.

## 5. Verification

Backend:
```
$ curl -X POST :5000/api/storefront-events/track \
       -H 'Content-Type: application/json' \
       -d '{"shopSlug":"phutungoto355","type":"phone_click"}'  → 204
$ curl :5000/api/shop/metrics/overview -H "Authorization: Bearer …"
  {"cards":{"productCount":2806,"rfqReceivedLast30d":105,
            "ctaClicksLast30d":4,"conversationsLast30d":18}, ...}
```

Frontend screenshots: `audit/screenshots/seller-nav-metrics/`
- `desktop-sidebar.png` — 3-item sidebar + 1-row metrics
- `mobile-sidebar.png` — Topbar dropdown showing inbox link
- `desktop-metrics.png` — 4-card row crop
- `mobile-metrics.png` — 2×2 grid crop

## 6. Rollback

- Sidebar / Topbar / ShopSettings — pure component edits; revert.
- Metrics endpoint — pure additive route; deleting the route folder
  removes it.
- Storefront events ingest — pure additive route + bridge component;
  deleting them halts ingest with no buyer-visible side effect.
- Schema — `DROP TABLE IF EXISTS shop_storefront_events;`.

Nothing in this pass touches storefront SEO, RFQ matching, wildcard
subdomain routing, product SEO URLs, middleware, auth, or any
existing API contract.
