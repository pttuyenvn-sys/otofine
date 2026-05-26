# RFQ conversation UX — mobile-first redesign

Frontend-only UX pass. Backend APIs unchanged.

## UX architecture

```
┌─────────────────────────────────────┐
│ Sticky RFQ summary (vehicle, part,  │  ← always visible (shop + buyer chat)
│ images, status, unread)             │
├─────────────────────────────────────┤
│ Chat shell (flex column)            │
│  · timeline (scroll, bubbles)       │  ← primary action area
│  · compact composer (sticky bottom) │
├─────────────────────────────────────┤
│ Quote panel (shop, collapsed)       │  ← secondary; clarify-first copy
└─────────────────────────────────────┘
```

**Workflow intent:** Shop clarifies → then quotes. Inbox CTAs say “Xem & nhắn” / “Trả lời”, not “Báo giá ngay” first.

## Before / after hierarchy

| Before | After |
|--------|--------|
| Quote form above chat | Chat first; quote in `<details>` |
| Card-style messages, heavy padding | Chat bubbles (buyer blue right, shop gray left) |
| Auto-scroll on every poll | Scroll only if at bottom + new tail message |
| `scroll-behavior: smooth` | Instant scroll (`scrollTop = scrollHeight`) |
| Price input auto-focus | No auto-focus on quote |
| Inbox → `#rq-quote` | Inbox → `/rfq/shop/:id` (chat) |
| Large composer (44–160px) | Compact (36–96px grow cap) |

## Components

| Component | Role |
|-----------|------|
| `RfqShopDispatchSummary` | Sticky shop context + thumb strip |
| `RfqBuyerChatHeader` | Sticky buyer context in chat section |
| `RfqConversationTimeline` | Bubbles, grouping, stable scroll |
| `RfqMessageComposer` | Compact sticky composer |
| `rfqConversationScroll.js` | Scroll decision helpers |
| `rfqDispatchSummary.js` | Parse vehicle/images from dispatch row |

## Mobile layout rules

1. **Touch targets:** ≥34px media buttons; primary inbox CTA full-width on narrow screens.
2. **Density:** Timeline gap `0.25rem`; grouped messages reduce vertical rhythm.
3. **Sticky zones:** Summary `top:0`; composer `bottom:0` inside chat shell (not page).
4. **Reading position:** User scroll up → `stickToBottomRef = false` → poll does not jump.
5. **Send:** Sets `stickToBottomRef = true` → one scroll to new message.
6. **Images:** Lazy load + fixed thumb sizes to limit reflow.

## Scroll stability (audit fixes)

| Issue | Fix |
|-------|-----|
| Poll merge re-scroll | Compare `prevCount` / `prevLastId`; skip if unchanged |
| `stick \|\| nearBottom` too aggressive | Only scroll when tail **grew** and id changed |
| Initial load | One-time scroll to end on first non-empty list |
| Reading mid-thread | Save `scrollTop` when leaving bottom; restore on poll |
| Textarea grow | Cap 96px; reduces layout shift |
| Keyboard | No `scrollIntoView` on composer; avoid viewport hacks in v1 |

## Rollout phases

1. **Phase 1 (done):** Shop detail reorder + sticky summary + bubbles + scroll fix.
2. **Phase 2 (done):** Buyer chat header + compact composer + inbox CTAs.
3. **Phase 3 (optional):** Inbox `last_message` from API (needs small SQL); image count in list.
4. **Phase 4 (optional):** `visualViewport` keyboard padding; virtualized list if >200 messages.

## Regression risks

| Risk | Mitigation |
|------|------------|
| Shop misses quote form | Collapsed `<details>` + “Báo giá sau” in inbox |
| No scroll on first open | `initialScrollDoneRef` once |
| Desktop wide layout | `@media (min-width: 768px)` max-height on list |
| Quote cards in timeline | Distinct `.rfq-conv-msg--quote` styling kept |
| Mark-read at bottom | Unchanged debounced mark-read hooks |

## Performance

- Poll still 5s; no extra API calls.
- `enrichMessagesForDisplay` is O(n) per render — fine for ≤100 messages.
- Sticky headers use `backdrop-filter` — minor GPU cost on low-end phones.
- Prefer `loading="lazy"` on gallery/thumbs (already set).

## Files touched

- `frontend/app/rfq/shop/[dispatchId]/page.js`
- `frontend/app/rfq/shop/inbox/page.js`
- `frontend/app/rfq/t/[token]/page.js`
- `frontend/components/rfq/RfqConversationTimeline.jsx`
- `frontend/components/rfq/RfqMessageComposer.jsx`
- `frontend/components/rfq/RfqShopDispatchSummary.jsx` (new)
- `frontend/components/rfq/RfqBuyerChatHeader.jsx` (new)
- `frontend/lib/rfq/rfqConversationScroll.js` (new)
- `frontend/lib/rfq/rfqDispatchSummary.js` (new)
- `frontend/lib/rfq/rfqConversationMessages.js`
- `frontend/hooks/useRfqConversationMessages.js`
- `frontend/app/rfq/rfq-scope.css`
