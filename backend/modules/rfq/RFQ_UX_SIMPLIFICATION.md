# RFQ UX Simplification — Mobile chat-first pass

Goal: fewer words, fewer clicks, denser layout, chat-like commerce. **No websocket/realtime** in this pass.

## Component hierarchy (after)

```
Buyer /rfq/t/[token]
├── Compact hero (status pill + headline only)
├── rfq-chat-shell--primary (MAIN)
│   ├── RfqBuyerChatHeader (compact)
│   ├── RfqBuyerShopTabs (per-shop thread switch)
│   ├── RfqConversationTimeline (filtered single shop)
│   └── RfqMessageComposer (no hint line)
├── <details> Báo giá · N (compact tap → switch shop tab)
└── <details> Yêu cầu (part + thumbs)

Shop /rfq/shop/[dispatchId]
├── RfqShopDispatchSummary (pills only)
├── rfq-chat-shell--primary
│   ├── RfqConversationTimeline
│   └── RfqMessageComposer (+ quick reply chips)
└── <details> 💰 Báo giá (collapsed default)

Shop inbox
├── Compact header + badges
├── Filter chips + vehicle filters (no sort UI)
└── Dense inbox cards
```

## Before → after rationale

| Area | Before | After | Why |
|------|--------|-------|-----|
| Buyer layout | Hero paragraphs, progress timeline, quotes block, then chat | Chat first; quotes/request in folds | Mobile users open link to talk / see price — not read onboarding |
| Multi-shop chat | One merged timeline + dropdown | **Per-shop tabs** + filtered thread | Always clear who is speaking; less cognitive load |
| Shop quote | Prominent collapsible + hints | Collapsed mini bar; chat + chips first | Conversational commerce — quote after clarify |
| Inbox sort | SLA / recent selector | Fixed **`activity`** sort | Unread RFQ → unread chat → last message time; no ERP controls |
| Timeline images | Up to 360px grids | **72px thumbs** → lightbox | Less scroll; messenger-like density |
| Copy | Helper paragraphs everywhere | Pills, icons, 1-line labels | Vietnamese mobile users scan, not read |
| Composer | Keyboard hints, 96px max height | 32px base, chips, sticky safe-area | Less jump; one-hand use |

## Production mobile guidelines

1. **One primary action per screen** — chat composer; quote is secondary (`<details>`).
2. **Max 2 lines** of static copy above the fold on buyer page.
3. **Shop identity** — buyer always sees active tab name + price chip; never merged anonymous thread.
4. **Images** — timeline thumbs 64–72px; full size only in lightbox.
5. **Empty states** — title only, no coaching paragraph (`emptyHint=""`).
6. **Inbox cards** — vehicle → part → last message → tags (📷, báo giá).
7. **No sort dropdown** — backend `sort=activity` default.
8. **Quick replies** (shop) — tap chip → fills composer; user can edit before send.

## Regression risks

| Risk | Mitigation |
|------|------------|
| Buyer mark-read wrong shop | `markReadDispatchId` filters mark-read to active tab only |
| Missing chat before first quote | Unchanged — composer disabled until quote exists |
| Inbox order change | Shops used to SLA-first; `activity` prioritizes conversations — monitor ops feedback |
| Quote form hidden | Collapsed but one tap on summary; quote still in timeline as message |
| Accessibility | Tabs use `role="tablist"`; folds use native `<details>` |

## Rollout plan

1. Deploy backend first (inbox `activity` sort — backward compatible query param).
2. Rebuild frontend.
3. Smoke on real phone:
   - Buyer: 2+ shops → switch tabs, send message, open quote fold
   - Shop: chat + chip + collapse quote + send price
   - Inbox: unread chat bubbles to top
4. Monitor: message send rate, quote latency, inbox time-to-open.

## Files touched

- `frontend/app/rfq/t/[token]/page.js` — chat-first layout, shop tabs
- `frontend/components/rfq/RfqBuyerShopTabs.jsx` — new
- `frontend/components/rfq/RfqBuyerChatHeader.jsx` — compact mode
- `frontend/components/rfq/RfqMessageComposer.jsx` — chips, hideHints
- `frontend/app/rfq/shop/[dispatchId]/page.js` — chat-first shop
- `frontend/app/rfq/shop/inbox/page.js` — no sort UI
- `frontend/app/rfq/new/page.js`, `RfqImageUpload.jsx` — trim copy
- `frontend/hooks/useRfqConversationMessages.js` — per-tab mark-read
- `frontend/app/rfq/rfq-scope.css` — compact tokens
- `backend/.../rfqDispatch.repository.js` — `activity` sort default

## Out of scope (explicit)

- Websocket / realtime transport
- API contract breaks
- Buyer chat before first quote (needs product decision + backend)
