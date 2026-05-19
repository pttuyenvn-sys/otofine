# RFQ stabilization QA checklist

**Purpose:** Stress-test and verify RFQ + conversation system before websocket/realtime.  
**Scope:** QA + bug discovery only — no features, no refactors.

## Legend

| Tag | Meaning |
|-----|---------|
| **VERIFIED** | Confirmed via code review, unit tests, or migration run in dev |
| **ASSUMED** | Architecture/docs suggest behavior; needs manual runtime confirmation |
| **UNTESTED** | Not exercised in this QA pass — requires staging/production manual test |

**Pass/fail:** Fill during manual QA (`[ ]` = not run, `[P]` = pass, `[F]` = fail).

**Environment prerequisites**

- [ ] `RFQ_MODULE_ENABLED=true` on API
- [ ] Migrations `029`, `030`, `031` applied
- [ ] PM2/backend restarted after last deploy
- [ ] Test shop JWT + buyer viewer link from real OTP flow
- [ ] Devices: iPhone Safari, Android Chrome, desktop Chromium

---

## Phase 1 — Buyer RFQ flow

| ID | Test | Steps | Expected | Status |
|----|------|-------|----------|--------|
| B01 | RFQ create | Submit valid form on `/rfq/new` | `201` + OTP flow; no duplicate public_id spam | UNTESTED |
| B02 | Vehicle selector | Omit brand/model/year | `INVALID_VEHICLE` (400) | VERIFIED — `rfqCreateValidation` unit tests |
| B03 | Description validation | Placeholder / too short text | `INVALID_DESCRIPTION` / `SHORT_DESCRIPTION` | VERIFIED — unit tests |
| B04 | Image upload | 1–10 images within size limit | URLs returned; stored on RFQ | UNTESTED |
| B05 | Large upload | File > `RFQ_UPLOAD_MAX_BYTES` | `UPLOAD_TOO_LARGE` / reject | ASSUMED — env default 5MB |
| B06 | OTP verify | Correct code | RFQ `open`; dispatch wave runs | UNTESTED |
| B07 | OTP brute | Wrong code × N | `OTP_LOCKED` / throttle | ASSUMED — `rfqViewerThrottle` + OTP limits |
| B08 | Dispatch creation | After verify | `rfq_dispatches` rows; conversations ensured | VERIFIED — `ensureConversationForDispatch` in dispatch service |
| B09 | Quote reception | Shop submits quote | Buyer `GET /by-token` shows quote + `dispatchId` | UNTESTED |
| B10 | Conversation visibility | Buyer opens `/rfq/t/:token` | Timeline shows quote event after poll | UNTESTED |
| B11 | Spam message | Send 40+ repeated chars | `MESSAGE_SPAM` (400) | VERIFIED — `rfqMessageValidation.test.js` |
| B12 | Empty / unicode spam | Zero-width only message | `EMPTY_MESSAGE` | VERIFIED — unit tests |
| B13 | Buyer push register | After OTP | Row in `rfq_push_subscriptions` | UNTESTED |

**Edge cases**

| ID | Case | Expected | Status |
|----|------|----------|--------|
| B-E1 | Invalid vehicle JSON | 400, no dispatch | ASSUMED |
| B-E2 | Repeated OTP from multiple IPs | Rate limit / lock | UNTESTED |
| B-E3 | Expired RFQ | Buyer page shows expired UX; composer disabled | VERIFIED — `deriveBuyerUx` + `canSendBuyerMessage` in token page |

---

## Phase 2 — Shop flow

| ID | Test | Steps | Expected | Status |
|----|------|-------|----------|--------|
| S01 | Inbox load | `/rfq/shop/inbox` logged in | Items + summary counts | UNTESTED |
| S02 | Filters | unread / waiting / quoted / vehicle | List matches filter | UNTESTED |
| S03 | RFQ open | Card → `/rfq/shop/[dispatchId]` | Detail loads; `PATCH …/view` marks dispatch seen | UNTESTED |
| S04 | Quote submit | Form `#rq-quote` | `rfq_quotes` row + timeline quote message | UNTESTED |
| S05 | Message send | Composer | Text in timeline; `message_type=text` | UNTESTED |
| S06 | Poll updates | Wait 5–10s on thread | New peer messages appear without refresh | UNTESTED |
| S07 | Unread badges | Inbox after buyer message | `message_unread_count` pill + header total | UNTESTED |
| S08 | Mark read | Open thread, scroll bottom | Badge clears after debounced POST read | UNTESTED |
| S09 | Dispatch “RFQ mới” vs chat unread | New dispatch, no chat | `is_unread` (first_viewed) distinct from chat pill | VERIFIED — `rfqInboxMap.js` |

**Edge cases**

| ID | Case | Expected | Status |
|----|------|----------|--------|
| S-E1 | Two tabs same inbox | Both poll; no duplicate cards / broken state | UNTESTED |
| S-E2 | Refresh during poll | No duplicate messages in timeline | VERIFIED — `mergeSortedMessages` dedupes by `dispatchId-id` |
| S-E3 | Quote + message same second | Both appear; quote form still works | UNTESTED |
| S-E4 | Double quote submit | `QUOTE_EXISTS` or idempotent handling | ASSUMED |

---

## Phase 3 — Buyer conversation flow

| ID | Test | Steps | Expected | Status |
|----|------|-------|----------|--------|
| C01 | Multi-shop | RFQ with 2+ quotes | Merged timeline; shop labels | UNTESTED |
| C02 | Merge ordering | Messages from two shops | Sorted by `created_at`, then `id` ASC | VERIFIED — `mergeConversationItems` |
| C03 | Shop labels | Merged view | `shopLabel` on peer messages | VERIFIED — hook adds from quotes |
| C04 | Message send | Select shop + send | POST to correct `dispatchId` | VERIFIED — `messageDispatchId` wiring |
| C05 | Unread counts | Shop sends text | Selector + header badge increment | UNTESTED |
| C06 | Read cursor | Scroll to bottom | POST read; unread → 0 for that dispatch | UNTESTED |
| C07 | Poll sync | 5s interval | No duplicate rows | VERIFIED — merge dedupe |

**Edge cases**

| ID | Case | Expected | Status |
|----|------|----------|--------|
| C-E1 | Rapid exchange | 10+ messages each side | Rate limits at 30/60 per min; UI stable | ASSUMED — limits in config |
| C-E2 | Scroll middle + poll | New messages | Scroll position preserved if not at bottom | VERIFIED — `stickToBottomRef` + `isNearScrollBottom` |
| C-E3 | Tab hidden | `visibilitychange` | Polling stops; resumes on show | VERIFIED — hooks |
| C-E4 | Switch shop target | Change `<select>` | Sends to new dispatch only | UNTESTED |
| C-E5 | 5 shops quoted | Buyer page open | 5× GET messages / 5s — watch 429 | ASSUMED — HTTP amplification risk |

---

## Phase 4 — OneSignal

| ID | Test | Steps | Expected | Status |
|----|------|-------|----------|--------|
| P01 | Shop push on dispatch | New RFQ dispatched to shop | Notification received | UNTESTED |
| P02 | Shop deep link | Tap notification | Opens `/rfq/shop/:dispatchId` | **RISK** — see §Production risks |
| P03 | Buyer push on quote | Shop quotes | Buyer notification | UNTESTED |
| P04 | Buyer deep link | Tap notification | Opens `/rfq/t/...` viewer path | UNTESTED |
| P05 | No duplicate push | Single quote | One notification per subscription | UNTESTED |
| P06 | Invalid route | N/A | No push to `/rfq/shop/{rfqRequestId}` | VERIFIED — dispatch uses `dispatchId` in URL |
| P07 | Push after text message | Buyer/shop sends chat | **No push** (by design) | VERIFIED — no notify in `sendTextMessage` |
| P08 | Missing subscription | Shop without player id | Dispatch succeeds; no push error to user | VERIFIED — guarded `if (playerId)` |

---

## Phase 5 — Race conditions

| ID | Scenario | How to reproduce | Watch for | Status |
|----|----------|------------------|-----------|--------|
| R01 | Two shop tabs | Same dispatch, both send | Duplicate quotes? message order? | UNTESTED |
| R02 | Rapid sends | 20 messages in 10s | 429 `RATE_LIMIT`; UI error text | UNTESTED |
| R03 | Poll + send overlap | Send during poll tick | Duplicate or missing bubble | UNTESTED |
| R04 | Read regression | Tab A at bottom (read), Tab B sends | Cursor must not move backward | VERIFIED — `GREATEST` + `targetId < prevRead` clamp |
| R05 | Rapid refresh | F5 on buyer token page | No crash; timeline reloads | UNTESTED |
| R06 | Simultaneous buyer+shop | Both send within 1s | Both appear after poll; order by `id` | UNTESTED |

---

## Phase 6 — Database + performance

| ID | Check | Method | Expected | Status |
|----|-------|--------|----------|--------|
| D01 | Inbox N+1 | Explain shop inbox list | Single list query + one unread map query | VERIFIED — `countUnreadByDispatchForShop` |
| D02 | Buyer poll N+1 | Network tab, 3 dispatches | 3 GET `/messages` per poll (HTTP N, not SQL N+1) | VERIFIED — architectural |
| D03 | Index `031` | `SHOW INDEX FROM rfq_messages` | `idx_rfq_msg_conv_unread`, `idx_rfq_msg_conv_list` | VERIFIED — migration ran OK on dev |
| D04 | Poll latency | p95 GET messages | < 200ms warm DB (staging target) | UNTESTED |
| D05 | Unread batch | GET unread-summary | One query for all dispatchIds | VERIFIED — `countUnreadByDispatchForBuyer` |
| D06 | Offset cap | `offset=10000` | Capped at 500 | VERIFIED — `RFQ_MESSAGE_LIST_OFFSET_MAX` |
| D07 | Upload latency | 3MB image | Sharp pipeline < 5s | UNTESTED |

---

## Phase 7 — Security

| ID | Check | Expected | Status |
|----|-------|----------|--------|
| X01 | Viewer token A → dispatch B | 404 | VERIFIED — middleware checks `rfq_request_id` |
| X02 | Shop A → shop B dispatch | 404 | VERIFIED — `findDispatchForShop` |
| X03 | XSS in message | `<script>` stored | Rendered as text, not executed | VERIFIED — `RfqSafeMessageText` React text nodes |
| X04 | `javascript:` URL | In message | Not linkified | VERIFIED — `sanitizeUrl` http(s) only |
| X05 | Spam heuristics | 50× `a`, 10 URLs | 400 `MESSAGE_SPAM` | VERIFIED — unit tests |
| X06 | Buyer send rate | 31 msgs / 1 min | 429 `RATE_LIMIT` | UNTESTED |
| X07 | Shop send rate | 61 msgs / 1 min | 429 | UNTESTED |
| X08 | Read rate | Artificial poll flood | 429 on GET after 120/min | UNTESTED |
| X09 | Normalization stored | `"  hello   "` | Stored as `"hello"` | VERIFIED — `normalizeMessageText` |

---

## Production risks (code-verified — confirm in staging)

| Risk | Severity | Evidence | Mitigation before websocket |
|------|----------|----------|----------------------------|
| Shop push URL may be relative | **High** | `sendPush({ url: '/rfq/shop/…' })` — `onesignalService` does not prepend origin | Use absolute `https://otofine.com/rfq/shop/:id` |
| Buyer push fallback URL | Medium | Missing `viewer_path` → `https://otofine.com` homepage | Ensure register always sends `viewerPath` |
| `onesignal_player_id` column name vs `include_subscription_ids` | Medium | Shop login saves `PushSubscription.id` to `onesignal_player_id` | Confirm OneSignal accepts ID in staging |
| In-memory rate limits | Medium | Per PM2 instance; uneven under cluster | Document; plan Redis before scale |
| Buyer multi-dispatch poll | Medium | N parallel GET every 5s | Cap quoted shops UX; monitor 429 |
| Conversation migration lag | Low | Dispatch succeeds if `029` missing | Run migrations; monitor logs |
| Two unread semantics (shop) | Low UX | `first_viewed_at` vs `message_unread_count` | Train ops; optional copy tweak |

---

## Fixes required before websocket (minimum)

1. **[ ]** Confirm/fix shop OneSignal URL absolutization (P02).
2. **[ ]** Manual E2E: buyer OTP → dispatch → shop quote → buyer timeline + push (B06–B10, P03–P04).
3. **[ ]** Manual E2E: chat send both sides + unread/mark-read (S05–S08, C04–C06).
4. **[ ]** Race script: R02 rate limit + R03 poll/send (document actual behavior).
5. **[ ]** Staging `EXPLAIN` on unread query under realistic row counts (D04).
6. **[ ]** Do **not** add websocket until above P/F items are green.

---

## Automated checks (run before each release)

```bash
cd backend && npm run test:rfq          # 19 tests incl. message validation
cd backend && npm run migrate:rfq:conversations   # idempotent
cd backend && npm run migrate:rfq:conversation-reads
cd backend && npm run migrate:rfq:message-indexes
```

---

## Related docs

- `CONVERSATIONS.md` — APIs, limits, polling
- `DEPLOYMENT_CHECKLIST.md` — migration order
- `frontend/app/rfq/CLOSED_BETA_UX_QA.md` — UX polish checklist

---

## QA session log (fill in)

| Date | Tester | Environment | Pass | Fail | Notes |
|------|--------|-------------|------|------|-------|
| | | staging / prod | | | |
