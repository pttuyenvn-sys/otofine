# RFQ conversation-first rollout (Phases A, B, E)

Conversation-first buyer UX: shop can chat before quoting; buyer sees engagement without waiting for a quote row.

**Out of scope:** inline quote composer, websocket, quote API redesign.

---

## Phase A — engagement foundation

### Migration `034_rfq_conversation_first.sql`

Adds (idempotent):

- `rfq_requests.first_shop_message_at DATETIME(3) NULL`
- `rfq_dispatches.first_shop_message_at DATETIME(3) NULL`

Backfills from existing `rfq_messages` where `sender_type = 'shop'`.

### Backend hook

`sendConversationMessage` in `rfqConversation.service.js`:

- On first **shop** message (text or image), inside the transaction:
  - `rfq_requests.first_shop_message_at` (COALESCE — idempotent)
  - `rfq_dispatches.first_shop_message_at` (COALESCE — idempotent)
- No status enum changes, no push changes.

### Buyer API (`GET /rfq/by-token`)

New fields:

```json
{
  "firstShopMessageAt": "2026-05-19T10:00:00.000Z",
  "buyerPhase": "pending|dispatched|engaged|quoted",
  "dispatchCount": 2,
  "quoteCount": 1
}
```

Phase logic:

| Phase | Condition |
|-------|-----------|
| `quoted` | `quoteCount > 0` |
| `engaged` | `firstShopMessageAt` set |
| `dispatched` | `dispatchCount > 0` |
| `pending` | fallback |

---

## Phase B — remove quote gating

- Chat tabs from **dispatches** only (no quote-only fallback tabs).
- Empty states:
  - No dispatch → **Đang tìm shop**
  - Dispatch, no messages → **Shop đang xem yêu cầu**
  - Messages → show thread
- Removed blocking **Chờ báo giá** / **Đang chờ báo giá** buyer screens.
- Default tab priority: **unread → latest activity → first dispatch** (not cheapest quote).

---

## Phase E — buyer engagement UX

`frontend/lib/rfq/rfqBuyerEngagement.js`:

| Phase | Headline |
|-------|----------|
| pending | Đang tìm shop |
| dispatched | Shop đang xem yêu cầu |
| engaged | Shop đang trao đổi |
| quoted | Đã có báo giá |

Timeline:

1. **Đã gửi** — always done
2. **Shop trao đổi** — done on `firstShopMessageAt`
3. **Báo giá** — done on first quote

---

## Changed files

| Area | File |
|------|------|
| Migration | `backend/migrations/034_rfq_conversation_first.sql` |
| Script | `backend/package.json` (`migrate:rfq:conversation-first`) |
| Engagement util | `backend/modules/rfq/utils/rfqBuyerEngagement.js` |
| Hook | `backend/modules/rfq/services/rfqConversation.service.js` |
| API | `backend/modules/rfq/services/rfqPublic.service.js` |
| Repos | `rfqRequest.repository.js`, `rfqDispatch.repository.js` |
| Test | `backend/modules/rfq/tests/rfqBuyerEngagement.test.js` |
| Buyer UX | `frontend/lib/rfq/rfqBuyerEngagement.js` |
| Buyer page | `frontend/app/rfq/t/[token]/page.js` |
| Chat panel | `frontend/components/rfq/RfqBuyerChatPanel.jsx` |
| Stable poll | `frontend/lib/rfq/rfqBuyerDataStable.js` |
| Timeline copy | `frontend/components/rfq/RfqConversationTimeline.jsx` |
| CSS | `frontend/app/rfq/rfq-scope.css` (compact hero timeline) |
| Tests | `frontend/lib/rfq/rfqBuyerEngagement.test.js` |

---

## Migration command

```bash
cd backend
npm run migrate:rfq:conversation-first
```

Safe to re-run (column checks + COALESCE backfill).

---

## Deploy order

1. **Run migration** on production DB (`migrate:rfq:conversation-first`).
2. **Deploy backend** — hook + API fields (backward compatible; old clients ignore new fields).
3. **Deploy frontend** — engagement UX + quote-gate removal.
4. **Smoke test** one RFQ: shop sends message before quote → buyer sees engaged phase + thread.

No downtime required; additive schema only.

---

## QA checklist

### Phase A

- [ ] Migration applies cleanly on staging (re-run twice — no error).
- [ ] `GET /rfq/by-token` returns `buyerPhase`, `dispatchCount`, `quoteCount`, `firstShopMessageAt`.
- [ ] Shop sends first text → `first_shop_message_at` set on request + dispatch.
- [ ] Shop sends second message → timestamps unchanged (idempotent).
- [ ] Buyer message does **not** set `first_shop_message_at`.
- [ ] Existing RFQs with shop messages backfilled after migration.

### Phase B

- [ ] RFQ with dispatch, no quote: buyer sees shop tab + **Shop đang xem yêu cầu** (not blocked).
- [ ] RFQ with no dispatch: **Đang tìm shop**, composer disabled.
- [ ] Shop messages before quote: thread visible, composer enabled.
- [ ] Multi-shop: tabs from dispatches; default tab = unread if any.
- [ ] Deep link `?dispatchId=` still opens correct tab.
- [ ] Quotes fold still shows when quotes exist (optional enhancement).

### Phase E

- [ ] Headlines match phase table above.
- [ ] Timeline step 2 completes on first shop message.
- [ ] Timeline step 3 completes on first quote.
- [ ] No **Chờ báo giá** blocking screen on buyer page.

### Regression

- [ ] Buyer polling stable (no flicker on 15s poll).
- [ ] Mark-read only when scrolled to bottom (active tab).
- [ ] Push suppression unchanged (open thread, recent read).
- [ ] Push deep-link opens correct dispatch.
- [ ] Shop quote submit + analytics unchanged.

---

## Regression risks

| Risk | Mitigation |
|------|------------|
| Poll rerenders | `stabilizeRfqByTokenData` includes engagement fields in signature |
| Tab jump on poll | Default tab only when `prev` invalid; deep-link wins |
| Old RFQs stuck in `dispatched` | Migration backfills `first_shop_message_at` from messages |
| API clients ignore new fields | Additive only; existing fields unchanged |
| Shop inbox still shows "Chờ báo giá" | Shop-side unchanged (by design) |
