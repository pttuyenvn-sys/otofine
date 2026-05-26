# RFQ conversation push — production audit (2026-05)

## Symptom

Shop sends message → DB row saved → buyer receives **no** OneSignal notification.

Quote push (`notifyBuyerQuotePushed`) unaffected — no active-view suppression.

## End-to-end pipeline

```
POST /api/rfq/conversations/:dispatchId/messages
  → sendConversationMessage (rfqConversation.service.js)
  → insertMessage + commit
  → notifyConversationMessagePush (fire-and-forget)
      → findReadCursor (rfq_conversation_reads)
      → evaluateActiveViewSuppression
      → rfq_push_subscriptions (buyer) / shops.onesignal_player_id (shop)
      → sendBuyerQuotePush / sendPush → OneSignal REST API
```

## Root cause (regression)

Active-view suppression compared `last_read_message_id` to **`prevLatestMessageId`** (latest id **before** insert), not the **new** message id.

When the buyer was caught up on the prior tail (`last_read >= prev_latest`) with a fresh read cursor (`read_age < 4s`), **every new shop message was suppressed** even though the buyer had not read that message yet.

This surfaced after polling/mark-read stabilization because:

1. Buyer tab sets `stickToBottomRef = true` on dispatch tab switch → aggressive mark-read when visible.
2. Mark-read scoped to active `markReadDispatchId` keeps cursor fresh on the open thread.
3. Push runs async after commit; suppression checked stale “caught up on old latest” instead of “read new message”.

**Background / locked phone:** Same bug if the buyer had been viewing the thread within the 4s window before backgrounding — cursor still “fresh at old latest”, new message suppressed.

## Fix

**Server (`rfqConversationPush.service.js`):** Suppress only when:

```text
last_read_message_id >= messageId   (new message already in cursor)
AND read_age_ms < ACTIVE_VIEW_MS (4000)
```

**Client (`rfqConversationRead.js`):** Mark-read requires explicit `stickToBottomRef === true`, verified scroll bottom, or short thread — no longer assumes “near bottom” when `listRef` is unset.

## Structured audit log

Every push attempt emits one JSON line:

```json
{
  "event": "rfq.conversation.push_audit",
  "dispatch_id": 123,
  "conversation_id": 456,
  "recipient_type": "buyer",
  "latest_message_id": 789,
  "prev_latest_message_id": 788,
  "push_attempted": true,
  "push_suppressed": false,
  "suppression_reason": null,
  "last_read_message_id": 788,
  "last_read_at": "2026-05-19T12:00:00.000Z",
  "read_age_ms": 1200,
  "active_view_window_ms": 4000,
  "subscription_found": true,
  "subscription_count": 1,
  "onesignal_called": true,
  "onesignal_notification_id": "..."
}
```

`suppression_reason` values:

| Reason | Meaning |
|--------|---------|
| `active_view_read_includes_message` | Foreground caught up on this message ≤4s ago |
| `no_buyer_subscription` | No rows in `rfq_push_subscriptions` |
| `invalid_rfq_request_id` | Missing conversation rfq_request_id |
| `no_shop_player_id` | Shop row missing OneSignal id |
| `onesignal_failed` / `onesignal_error` | API error (see `[BUYER PUSH]` logs) |

## Subscription audit

Table: `rfq_push_subscriptions` — unique `(rfq_request_id, onesignal_subscription_id)`.

- Registration: `POST /api/rfq-push/register` after OTP (`frontend/lib/rfqPushRegister.js`).
- Multiple subscription rows per RFQ allowed (new browser/device → new row).
- Push query: all `onesignal_subscription_id` for `rfq_request_id`.
- Deep link: latest non-empty `viewer_path` + `?dispatchId=` for conversation push.

Verify in production:

```sql
SELECT id, rfq_request_id, onesignal_subscription_id, viewer_path, created_at
FROM rfq_push_subscriptions
WHERE rfq_request_id = ?;
```

## Production QA matrix

| # | Scenario | Expected push | Expected suppression log |
|---|----------|---------------|--------------------------|
| 1 | Buyer tab hidden / phone locked | Yes | `push_suppressed: false`, `onesignal_called: true` |
| 2 | Buyer on **different** shop tab | Yes | Same |
| 3 | Buyer on thread, scrolled up (not at bottom) | Yes | `last_read_message_id < latest_message_id` |
| 4 | Buyer on thread, at bottom, **new** message arrives, stays ≤4s | No (poll delivers in UI) | `active_view_read_includes_message` after mark-read |
| 5 | Buyer on thread, at bottom, backgrounds within 4s of **old** read | Yes (fixed) | Must NOT suppress on `prev_latest` alone |
| 6 | Shop sends image-only | Yes | Preview body “Đã gửi ảnh” |
| 7 | No subscription row | No push | `no_buyer_subscription` |
| 8 | Chat polling UX | No flicker | Unchanged — mark-read still debounced 800ms, poll 5s |

## Log grep (production)

```bash
# All conversation push audits for a dispatch
grep 'rfq.conversation.push_audit' app.log | grep '"dispatch_id":123'

# OneSignal payload/response (stdout)
grep '\[BUYER PUSH\]' app.log
```

## Rollout

1. Deploy backend only (push logic is server-side).
2. Frontend mark-read tightening is additive — rebuild when convenient.
3. No migration required.
