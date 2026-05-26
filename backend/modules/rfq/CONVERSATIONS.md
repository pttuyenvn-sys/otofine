# RFQ conversations (v2 foundation + text + read cursors)

Additive layer for buyer ↔ shop negotiation. **Does not replace** dispatch, quotes, push, or escalation.

## Anchor: `dispatchId`

| Concept | Rule |
|---------|------|
| Room | Exactly **one** `rfq_conversations` row per `rfq_dispatches.id` |
| Buyer ↔ shop | One conversation per dispatch (not per `rfq_request_id` alone) |
| Deep links | Shop UI continues to use `/rfq/shop/:dispatchId` |
| RFQ request | `rfq_request_id` on conversation is denormalized for buyer-wide queries |

`rfq_request_id` alone is **not** a conversation key when multiple shops are dispatched.

## Source of truth

| Data | Authority |
|------|-----------|
| Quote price / status | `rfq_quotes` |
| Dispatch / SLA | `rfq_dispatches` |
| Timeline / chat text | `rfq_messages` (reflects events; quote rows remain canonical) |
| Read cursors | `rfq_conversation_reads` (per participant) |

Quote submit still writes `rfq_quotes` first; a `message_type = 'quote'` row is appended for timeline UI.

## Read / unread foundation

**Unread precedes websocket** — clients still sync via polling; read cursors make badges reliable.

| Participant | Unread = |
|-------------|----------|
| Shop | Opponent messages (`buyer`, `system`) with `id > last_read_message_id` |
| Buyer | Opponent messages (`shop`) with `id > last_read_message_id` |

- Buyer read rows use `participant_shop_id = 0` (MySQL UNIQUE-safe).
- Counts use `conversation_id` + message `id` — no full-table scans.
- Shop inbox enriches rows in **one** `GROUP BY` query (no N+1).

## APIs

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/rfq/conversations/:dispatchId` | Shop JWT **or** `x-rfq-viewer-token` |
| GET | `/api/rfq/conversations/:dispatchId/messages` | Same — includes `unread_count`, `last_read_message_id` |
| POST | `/api/rfq/conversations/:dispatchId/messages` | Same — text and/or `attachmentIds` |
| POST | `/api/rfq/conversations/:dispatchId/upload-image` | Stage image (multipart `file`) |
| POST | `/api/rfq/conversations/:dispatchId/read` | Same — body optional `{ messageId }` |
| GET | `/api/rfq/conversations/unread-summary?dispatchIds=1,2` | Buyer viewer token only |

### POST `/read`

- Marks read through `messageId` (or latest message in room if omitted).
- Updates `last_read_message_id`, `last_read_at`.
- Returns `{ unread_count, last_read_message_id }`.

### Text validation (POST messages)

Normalized before insert (`rfqMessageValidation.js`):

- Trim; collapse repeated spaces per line
- Collapse 3+ blank lines → 2 (paragraph break preserved)
- Strip zero-width / unicode space spam
- Reject empty, >2000 chars, 40+ repeated char runs, URL/line spam heuristics

### Rate limits (in-memory per instance)

| Action | Buyer | Shop |
|--------|-------|------|
| POST text | 30/min per RFQ | 60/min per shop |
| GET messages / read / meta | 120/min per participant | same |
| GET unread-summary | 60/min per RFQ | — |

Env: `RFQ_RL_CONV_BUYER_SEND_MIN`, `RFQ_RL_CONV_SHOP_SEND_MIN`, `RFQ_RL_CONV_READ_MIN`, `RFQ_RL_CONV_UNREAD_SUM_MIN`.

Polling at 5s ≈ 12 GET/min/thread — limits allow normal use, block abuse.

## Migrations

```bash
cd backend && npm run migrate:rfq:conversations
cd backend && npm run migrate:rfq:conversation-reads
cd backend && npm run migrate:rfq:message-indexes
```

- `029_rfq_conversations.sql` — rooms + messages
- `030_rfq_conversation_reads.sql` — read cursors
- `031_rfq_messages_read_indexes.sql` — unread + list indexes

## Client sync (polling)

- Messages: **5s** poll while tab visible (`RFQ_CONVERSATION_POLL_MS`).
- Mark-read: debounced **800ms** when timeline visible and user is at bottom (`RFQ_READ_DEBOUNCE_MS`).
- Polling remains the transport until websocket lands.

## Production hardening

- **Rendering:** `RfqSafeMessageText` — React text nodes + http(s) links only (`rel=noopener noreferrer nofollow`).
- **Pagination:** `limit` max 100, `offset` max 500 (poll-friendly; no deep OFFSET abuse).
- **Read cursor:** `GREATEST` on upsert; mark-read ignores regressive `messageId`.
- **Indexes:** `(conversation_id, deleted_at, sender_type, id)` for unread counts.

## Not implemented (intentional)

- WebSocket / SSE / typing indicators
- WebSocket push events for chat
- Edit / delete messages
- Server-side moderation queue / ML spam (roadmap below)

## Moderation / spam roadmap

1. Report message + admin review queue
2. Per-dispatch mute / slow mode
3. Redis-backed rate limits for multi-instance
4. Optional profanity / link domain allowlist

## Frontend

| Surface | Behavior |
|---------|----------|
| Shop inbox | `message_unread_count` per card + header `messageUnreadTotal` |
| Shop thread | Section badge from `unread_count`; auto mark-read on view |
| Buyer `/rfq/t/:token` | Unread on shop selector + section badge; batch `unread-summary` |
| Timeline text | `RfqSafeMessageText` — XSS-safe, linkified URLs |

## Future integration notes

1. **Realtime** — on `insertMessage`, push event to room; client updates timeline + unread without waiting for poll.
2. **Unread** — optional denormalized `unread_count` on `rfq_conversations` if COUNT per poll becomes hot; cursors remain source of truth.
3. **Push** — only after product rules; use read cursor to suppress notifications.
4. **Images** — implemented; see `RFQ_MEDIA_MESSAGING.md`.
