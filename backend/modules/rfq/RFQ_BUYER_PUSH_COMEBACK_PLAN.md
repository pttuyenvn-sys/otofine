# Buyer RFQ Push Comeback — Audit & Implementation Plan

## Audit summary (current state)

### OneSignal integration

| Layer | Implementation |
|-------|----------------|
| App | Single OneSignal app (`ONESIGNAL_APP_ID` / `NEXT_PUBLIC_ONESIGNAL_APP_ID`) |
| SDK | `frontend/lib/onesignal.js` — `autoRegister: false`, SW `OneSignalSDKWorker.js` |
| Init | Global `PushInit` in root layout |
| Send API | `POST https://api.onesignal.com/notifications` via `include_subscription_ids` |

### Buyer subscription model

- Table: `rfq_push_subscriptions` — `(rfq_request_id, onesignal_subscription_id)` unique
- Registration: `POST /api/rfq-push/register` (anonymous, no JWT)
- Deep link: `viewer_path` column (e.g. `/rfq/t/{token}`)
- **Not** linked to phone/history session before Phase 1

### Existing notification triggers

| Event | Trigger | Recipient | Suppression |
|-------|---------|-----------|-------------|
| Shop message | `rfqConversationPush.service.js` | Buyer | Active-view read cursor (4s) |
| Quote submitted | `rfqShop.service.js` → `submitQuote` | Buyer | Quote idempotency (no duplicate insert) |
| RFQ dispatch wave | `rfqDispatch.service.js` | Shop | — |
| Status change | — | Buyer | **None (gap)** |
| Inactive reminder | — | Buyer | **None (gap)** |

### Unread tracking

- `rfq_conversation_reads` cursors — powers history badges + active-view suppression
- Independent of push delivery

### Known bugs (pre-Phase 1)

1. **`BuyerPushPrompt` used shop hook** — `useOneSignalCustomPrompt` called `POST /api/push/save-player-id` (shop row), not buyer register API
2. **Auto-permission on success page** — intrusive; no explicit user action
3. **No history-session bulk register** — device registered per-RFQ only when visiting `/rfq/t/{token}`
4. **No buyer preferences** — all subscribed devices received all push types
5. **No push-level dedup** — repeated events could spam (except quote idempotency + message active-view)

---

## Phase 1 (implemented — low risk)

### Backend

1. **Migration `036`** — `pref_messages`, `pref_quotes`, `pref_reminders` on subscriptions; `rfq_push_sent_log` dedup table
2. **`rfqPushBuyer.service.js`** — central send with prefs filter, dedup, structured events:
   - `rfq.message.received`
   - `rfq.quote.received`
   - `rfq.request.updated`
3. **`POST /api/rfq-push/register-history`** — ties device to all RFQs for history session `phone_hash`
4. **Status push** — `dispatching` on first dispatch wave (deduped once per RFQ)
5. **Updated copy** — Vietnamese templates per product spec

### Frontend

1. **`useBuyerPushPrompt`** — buyer-only permission flow (no shop API)
2. **`BuyerPushPrompt`** — non-intrusive; explicit Allow / Later buttons
3. **History portal** — prompt after login + `BuyerPushPreferences` toggles
4. **`tryRegisterBuyerHistoryPush`** — bulk register via history token
5. **Preferences** — `localStorage` + synced on register

### Linking model (Phase 1)

```
Phone OTP → rfq_history_sessions.phone_hash
                ↓
POST /rfq-push/register-history { playerId, preferences }
                ↓
rfq_push_subscriptions × N (all RFQs for phone)
                ↓
Push events → filter by pref_* → dedup → OneSignal
```

Fallback URL when no `viewer_path`: `/rfq/history`

---

## Phase 2 (planned — not implemented)

| Feature | Approach |
|---------|----------|
| **Inactive reminder** | Cron/worker: RFQs `dispatching` + no buyer activity 24–48h → `pref_reminders` check → dedup `reminder:{date}` | **Implemented** — see `RFQ_BUYER_REMINDER.md` |
| **Invalid subscription prune** | On OneSignal 400/invalid id → delete row |
| **History deep link open** | `/rfq/history?open={dispatchId}` → auto-open RFQ card |
| **Per-phone OneSignal external_id** | Optional — cross-RFQ targeting without N register rows |
| **Quote push active-view suppression** | Mirror conversation suppression when buyer on viewer page |
| **Analytics wiring** | Subscribe to push audit logs → GA/Mixpanel |

---

## Target notifications mapping

| Target | Phase | Event | Copy |
|--------|-------|-------|------|
| New shop message | 1 | `rfq.message.received` | "Bạn có phản hồi mới từ cửa hàng" |
| New quote | 1 | `rfq.quote.received` | "Có báo giá mới cho {vehicle}" |
| RFQ inactive reminder | 2 | `rfq.reminder.inactive` | "Bạn vẫn đang tìm phụ tùng?" |
| Status dispatching | 1 | `rfq.request.updated` | "Yêu cầu của bạn đang được xử lý" |

---

## Rollback

1. **Frontend only** — revert `BuyerPushPrompt`, history prefs; old register flow still works
2. **Backend sends** — revert services to direct `sendBuyerQuotePush` (git)
3. **Migration** — prefs columns default 1; dedup table inert if unused
4. **Routes** — remove `/register-history`; single-RFQ register unchanged

---

## Env vars (unchanged)

- `ONESIGNAL_APP_ID`
- `ONESIGNAL_REST_API_KEY`
- `NEXT_PUBLIC_ONESIGNAL_APP_ID`

## Deploy

```bash
cd backend && npm run migrate:rfq:push-buyer-comeback
pm2 restart otofine-backend otofine-frontend --update-env
```
