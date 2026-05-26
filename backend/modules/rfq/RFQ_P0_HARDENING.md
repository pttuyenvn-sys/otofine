# RFQ P0 — Production stabilization & mobile UX

No websocket/realtime in this pass. Focus: submit reliability, push suppression accuracy, chat images, inbox scanning, image viewer.

## 1. Create form — “Tiếp tục” submit gating

### Root cause (silent no-op)

- Submit button used `disabled={!canSubmit}` while `hasUploading()` read **stale ref state** (`sectionsRef`) and returned `s.uploading` instead of `s.hasUploading` → button could look enabled but handler returned early with no feedback.
- Mismatch between visual `disabled` and handler early-returns.

### Fix

| Piece | Role |
|-------|------|
| `computeUploadStatus(sections)` | Reactive upload flags from React state |
| `evaluateRfqCreateSubmitGate` (`frontend/lib/rfq/rfqSubmitGate.js`) | Single gate for button + `submit()` |
| `/rfq/new` | `aria-disabled` + `.rfq-submit-btn--blocked` (not `disabled`); always runs handler |
| Block UI | `role="alert"` with `RFQ_SUBMIT_BLOCK_LABELS` |
| Debug | `sessionStorage.rfq_debug_submit=1` or non-production → `console.info('[rfq-create-submit]', …)` |

### Manual QA

1. Fill form, add images — while uploading, tap **Tiếp tục** → red block reason + scroll to images.
2. Force upload error → retry/remove → block clears.
3. Invalid phone/description → field errors + block label.
4. With debug flag, confirm `click` / `posting` / `redirect` logs.

---

## 2. Conversation push — OneSignal suppression

### Symptom

First message push works; later messages sometimes missing (tab backgrounded / phone locked).

### Server model (no `visibilityState` on server)

Suppression uses **read cursor** only (`rfq_conversation_reads`):

- Skip push only if: `last_read_message_id >= messageId` (the **new** message) **and** `read_age < 4s` (`ACTIVE_VIEW_MS`)
- If cursor is behind the new message → **always push** (even if read cursor was recently updated on the prior tail)

**Regression fix (2026-05):** Comparing against `prevLatestMessageId` incorrectly suppressed when buyer was caught up on the *previous* latest. See `RFQ_PUSH_AUDIT.md`.

Aligned with client `RFQ_READ_DEBOUNCE_MS = 800` and poll `5000ms`.

### Client mark-read

- `useShopConversationMarkRead` / `useBuyerConversationMarkRead`: **no mark-read when `document.visibilityState !== 'visible'`**
- Debounced 800ms when caught up at bottom

### Manual QA matrix

| Scenario | Buyer receives shop msg | Shop receives buyer msg |
|----------|-------------------------|-------------------------|
| Tab focused, scrolled to bottom | May suppress ≤4s | Same |
| Tab hidden / locked | Push | Push |
| Reading mid-thread (not at bottom) | Push (read id lags) | Push |
| Backgrounded 30s+ | Push | Push |

Check logs: `rfq.conversation.push_audit` (`push_suppressed`, `suppression_reason`, `onesignal_called`).

---

## 3. Chat image messaging QA

Prereq: migration `032_rfq_message_attachments.sql` (`npm run migrate:rfq:message-attachments`).

| Case | Steps | Expected |
|------|-------|----------|
| Image-only | Attach 1 image, empty text, send | Timeline bubble + push preview “Đã gửi ảnh” |
| Text + image | Caption + 1 image | Preview shows truncated text + “· 1 ảnh” |
| Multiple images | 2–4 staged, send | Gallery grid; push “Đã gửi N ảnh” |
| Retry failed upload | Kill network mid-upload | Error state + retry |
| Remove before send | Stage then remove | Not sent |
| Buyer/shop parity | Same flows on `/rfq/t/…` and `/rfq/shop/:id` | Same API + UI |
| Slow mobile | Throttle 3G | Staged upload completes; send disabled until done |

---

## 4. Shop inbox — operational scanning

Backend: `rfqDispatch.repository` + `rfqInboxMap.js` expose:

- `last_message_preview`, `image_count`, `message_unread_count`, `vehicle_label`

UI (`/rfq/shop/inbox`):

- Vehicle + part snippet (compact)
- Tags: 📷 count, báo giá / chưa báo giá
- Last message line (2-line clamp); bold when chat unread
- Left border when `message_unread_count > 0`

---

## 5. Image viewer (lightbox)

`RfqImageLightbox.jsx` — fullscreen, swipe, keyboard, dots, lazy `decoding="async"`, `.rfq-lightbox__zoom-wrap` for future pinch.

Wired:

- `RfqConversationImageGallery` (chat)
- `RfqShopDispatchSummary` (RFQ request thumbs)
- `RfqBuyerChatHeader` + buyer detail images on `/rfq/t/[token]`

---

## Deploy checklist

1. DB migration 032 if not applied
2. nginx body size / `/uploads/` → Express (see `NGINX_RFQ_UPLOAD.md`)
3. Rebuild frontend + restart backend
4. Smoke: create RFQ upload, inbox preview, chat image + push (focused vs background)

## Debug snippets

```js
// Browser — RFQ create submit
sessionStorage.rfq_debug_submit = '1'

// Backend — tail push decisions
grep 'rfq.conversation.push_' /path/to/backend.log
```
