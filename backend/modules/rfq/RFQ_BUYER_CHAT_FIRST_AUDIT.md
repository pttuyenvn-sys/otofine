# RFQ buyer chat-first unlock audit (2026-05)

## Symptom

Shop sends text before submitting quote → message saved → buyer page shows **"Chờ báo giá"**, no thread/messages.

## Root cause (confirmed)

Buyer UI was **quote-gated** end-to-end:

| Layer | Legacy gate |
|-------|-------------|
| `buildMessageDispatchOptions(sortedQuotes)` | Tabs only from `quotes[]` |
| `useMemoDispatchIds(quotes)` | Poll `dispatchIds` only from quotes |
| `useBuyerConversationMessages` | `if (!dispatchIds.length) return` — **no API calls** |
| `messageDispatchId` selection | Waits for `messageDispatchOptions` from quotes |
| Empty state | `sortedQuotesLength === 0` → **"Chờ báo giá"** |

Backend already supports chat-first:

- `ensureConversationForDispatch` on dispatch wave
- Shop can `POST .../messages` before quote
- Buyer `GET .../messages` works with viewer token + `dispatchId`

**Mismatch:** frontend never fetched dispatches without a quote row.

## Fix (minimal)

1. **`GET /rfq/by-token`** returns `dispatches: [{ dispatchId, shopId, shopName }]`
2. **`buildMessageDispatchOptionsFromDispatches`** — tabs from dispatches; quotes enrich labels/prices
3. **`useBuyerConversationMessages(token, messageDispatchOptions)`** — poll all dispatch rooms
4. Empty timeline copy: **"Chưa có tin nhắn"** when room exists; **"Chờ shop phản hồi"** only when zero dispatches

Preserved: polling stabilization, deep-link tab selection, unread/mark-read, per-shop tabs.

## Expected behavior

| State | UI |
|-------|-----|
| Dispatch exists, shop messaged, no quote | Tab + messages visible; composer enabled |
| Dispatch exists, no messages yet | Tab visible; "Chờ có tin nhắn" |
| No dispatch wave yet | "Chờ shop phản hồi" (hero may still say "Đang chờ báo giá") |
| Quote arrives later | Same tab; quote fold updates |

## QA

1. Shop opens dispatch, sends text **without** quote → buyer token page shows message within one poll.
2. Multi-shop RFQ: shop A messages pre-quote, shop B quotes → both tabs; A thread has messages.
3. Deep link `?dispatchId=` to pre-quote dispatch → correct tab + messages.
4. No regression: quoted RFQ tabs, unread badges, mark-read scoped to active tab.
