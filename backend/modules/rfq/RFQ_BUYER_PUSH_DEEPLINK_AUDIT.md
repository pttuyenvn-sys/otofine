# RFQ buyer push — deep link + multi-device audit (2026-05)

## BUG A — Notification opens wrong / empty thread

### Symptom

Mobile buyer receives push, tap opens RFQ page, new shop reply not visible or wrong shop tab active.

### Root causes

1. **Default tab = cheapest quote** — `messageDispatchOptions[0]` is lowest `priceAmount`, not the shop that sent the message. Any lost `?dispatchId` opens the wrong thread.

2. **Sticky tab wins over deep link** — When `dispatchId` was not yet in `messageDispatchOptions` on first effect run, code fell through to `prev ?? firstTab`. Once first tab was selected, later URL `dispatchId` could lose to `prev`.

3. **No refresh on notification open** — Timeline poll is 5s; opening from background did not force `reloadTimeline()`, so new message could be missing for one poll interval (or longer if visibility poll delayed).

4. **Mobile query param loss** — Some mobile WebViews / PWA openers strip `?dispatchId=` from OneSignal launch URLs.

5. **`filterThreadItemsStable(null)` showed merged threads** — While `messageDispatchId` was null, UI rendered all shops’ messages merged (confusing / looks like “wrong thread”).

### Fixes shipped

| Change | File |
|--------|------|
| Parse `?dispatchId=`, `#dispatch-{id}`, `sessionStorage` fallback | `frontend/lib/rfq/rfqBuyerDeepLink.js` |
| Deep link priority; don’t default to first tab while deep link pending | `app/rfq/t/[token]/page.js` |
| `reloadTimeline()` when deep-link tab applied + on `visibilitychange` | `app/rfq/t/[token]/page.js` |
| Push URL adds hash `#dispatch-{id}` | `rfqConversationPush.service.js` |
| OneSignal `data: { dispatchId, rfqRequestId }` + click listener | `rfqPush.service.js`, `rfqBuyerPushClick.js`, `PushInit.jsx` |
| Empty thread when no tab selected (not merged) | `RfqBuyerChatPanel.jsx` |

### Reproduction (before fix)

1. RFQ with 2+ shop quotes (tabs).
2. Shop B sends chat message; buyer on mobile receives push.
3. Open notification — if `?dispatchId=` dropped → tab A (cheapest) selected → shop B message “missing”.

### QA (after fix)

| Step | Expected |
|------|----------|
| Open ` /rfq/t/:token?dispatchId=178` | Tab 178 active |
| Open ` /rfq/t/:token#dispatch-178` | Tab 178 active (query stripped) |
| Tap push with `data.dispatchId=178` | Tab 178 + fresh timeline |
| Multi-tab RFQ, no dispatch in URL | First tab (cheapest) — unchanged |

---

## BUG B — Desktop no push, mobile yes (OneSignal success in logs)

### Symptom

Same RFQ: mobile receives conversation push; desktop never does. Backend: `push_attempted=true`, OneSignal API success.

### Subscription model (production)

```sql
-- Unique (rfq_request_id, onesignal_subscription_id) — multiple rows per RFQ allowed
rfq_push_subscriptions (
  rfq_request_id,
  onesignal_subscription_id,  -- OneSignal PushSubscription.id for THAT browser
  viewer_path
)
```

Push send:

```sql
SELECT onesignal_subscription_id FROM rfq_push_subscriptions WHERE rfq_request_id = ?
```

→ **all** subscription IDs sent in one OneSignal request (`include_subscription_ids`).

### Key facts

| Question | Answer |
|----------|--------|
| Same UUID as shop on one device? | Expected — one browser = one subscription per OneSignal app |
| Mobile overwrites desktop row? | **No** — different subscription IDs → separate rows |
| Only latest device stored? | **No** — unless only one row ever inserted |
| Why desktop silent? | Desktop subscription **never registered** in `rfq_push_subscriptions` |
| OneSignal success means desktop got it? | **No** — success if **any** target id accepted; others may be invalid/unsubscribed |

### Registration today (before fix)

- **Only** `tryRegisterBuyerRfqPush()` after OTP on `/rfq/success` on **that device**.
- If buyer verified OTP on phone, desktop never calls register → desktop id absent → no desktop push.
- `Notification.permission` must be `granted` and `PushSubscription.id` must exist at OTP moment.

### Not the primary cause

- Shop/buyer identity contamination (shared hook → shop `save-player-id`) affects **shop** row, not which buyer devices are in `rfq_push_subscriptions`.
- Matching shop + buyer subscription UUID on **one** machine is normal.

### Fix shipped

- Re-call `tryRegisterBuyerRfqPush(rfqRequestId, viewerPath)` on every `/rfq/t/[token]` load when `Notification.permission === 'granted'`.
- Adds desktop row when buyer opens RFQ on desktop with permission already granted.
- `GET /rfq/by-token` now includes `rfqRequestId` for client register.

### Recommended production model

**Target:** Buyer receives on **every device** that granted permission.

1. **Register on:** OTP verify, RFQ viewer page load (granted), optional permission prompt accept.
2. **Keep all rows** per `(rfq_request_id, subscription_id)` — do not delete on new device.
3. **Periodic prune** (optional): remove ids OneSignal marks invalid from delivery errors.
4. **Separate shop save from buyer prompt** (see `RFQ_ONESIGNAL_IDENTITY_AUDIT.md`) — prevents shop row cross-write, unrelated to multi-device buyer rows.

### Verify desktop gap

```sql
SELECT id, rfq_request_id, onesignal_subscription_id, viewer_path, created_at
FROM rfq_push_subscriptions
WHERE rfq_request_id = ?;
```

Compare with desktop DevTools → Application → check OneSignal / log `OneSignal.User.PushSubscription.id` on desktop after opening RFQ page.

### QA matrix

| Scenario | Expected |
|----------|----------|
| OTP on mobile only | 1 row (mobile sub id); mobile push only |
| Open RFQ on desktop (permission granted) | 2 rows; both receive push |
| Desktop deny permission | Still 1 row; desktop no push |
| Re-open RFQ on same desktop | Idempotent insert / viewer_path update only |

---

## Deploy

1. Backend restart (push URL hash + `data` payload + `rfqRequestId` in by-token).
2. Frontend rebuild (deep link + re-register + click listener).
