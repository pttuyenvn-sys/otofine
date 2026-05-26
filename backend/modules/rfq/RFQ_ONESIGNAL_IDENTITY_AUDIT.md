# OneSignal identity audit — buyer vs shop contamination

## Production observation

```
SHOP PLAYER: 1fe9ff72-e2df-4c5e-8304-397b31ac8806
BUYER PUSH IDS NORMALIZED: ["1fe9ff72-e2df-4c5e-8304-397b31ac8806"]
```

Same UUID in shop dispatch logs and buyer conversation push logs.

---

## Identity model (current)

| Layer | Buyer | Shop |
|-------|-------|------|
| OneSignal app | `NEXT_PUBLIC_ONESIGNAL_APP_ID` (single) | Same app |
| SDK init | Global `PushInit` → `initOneSignal()` once per tab | Same |
| Browser subscription | `OneSignal.User.PushSubscription.id` | Same physical subscription on same origin |
| DB storage | `rfq_push_subscriptions.onesignal_subscription_id` per RFQ | `shops.onesignal_player_id` per shop |
| Registration API | `POST /api/rfq-push/register` (no auth) | `POST /api/push/save-player-id` (no auth) |
| OneSignal `login()` / external id | **Not used** | **Not used** |
| localStorage | None for buyer | `token`, `shopId`, `auth` |

**Naming:** Code and DB say `playerId` / `onesignal_player_id`, but values are OneSignal **Web Push subscription IDs** (`PushSubscription.id`), sent via `include_subscription_ids` — not legacy player IDs.

---

## Are matching IDs expected?

**Yes — on the same browser + same origin + same OneSignal app.**

OneSignal Web SDK v16 creates **one push subscription per browser profile per app**. Shop login and buyer RFQ flows share:

- `https://otofine.com`
- One `OneSignal.init({ appId })`
- One service worker (`OneSignalSDKWorker.js`, scope `/`)

So `PushSubscription.id` **will be identical** when the same person (or same browser session) uses both shop and buyer flows. That alone is **not** proof of a bug.

**Proof of contamination** is cross-writing between roles (buyer flow updating shop row, or vice versa), or delivering pushes to the wrong business identity — not merely equal UUIDs on one device.

---

## Registration flows (exact)

### Shop

1. **Global:** `PushInit` in root layout calls `initOneSignal()` on every page (including `/rfq/*`).
2. **Prompt:** `ShopPushPrompt` on `/shop/login` → shared `useOneSignalCustomPrompt`.
3. **On Allow:** `OneSignal.Notifications.requestPermission()` → read subscription id → `POST /api/push/save-player-id` with `{ playerId, shopId }` from `localStorage.shopId` (or `/shop/me` if token present).
4. **On login:** `ShopLogin.jsx` after JWT save → reads `PushSubscription.id` → same `save-player-id` endpoint.

### Buyer

1. Same global `initOneSignal()` (shop app already initialized).
2. **Prompt:** `BuyerPushPrompt` on `/rfq/success` → **same** `useOneSignalCustomPrompt` (shop logic included).
3. **On Allow:** permission + **`POST /api/push/save-player-id`** if `shopId` in localStorage — **buyer UI can update shop row**.
4. **After OTP:** `tryRegisterBuyerRfqPush(rfqRequestId, viewerPath)` → `PushSubscription.id` → `POST /api/rfq-push/register`.

Buyer DB registration runs **only after OTP verify**, and only if subscription id already exists. Permission prompt may run **before** OTP via auto-ask on success page.

---

## Contamination paths (confirmed in code)

### 1. Shared prompt hook (P0)

`BuyerPushPrompt` and `ShopPushPrompt` both use `useOneSignalCustomPrompt.js`, which **always** calls shop save API:

```javascript
await fetch(`${base}/push/save-player-id`, {
  body: JSON.stringify({ playerId, shopId }),
});
```

On buyer pages, if `localStorage.shopId` remains from a prior shop login, **buyer granting notification rewrites `shops.onesignal_player_id`**.

### 2. Unauthenticated shop player endpoint (P0)

`POST /api/push/save-player-id` has **no JWT**. Any client that knows a `shopId` can set that shop’s `onesignal_player_id`.

### 3. Stale `shopId` in localStorage (P1)

`shopId` is set on shop login/settings and cleared only on explicit logout (`Topbar` → `localStorage.clear()`). Buyer RFQ users who previously logged in as shop on the same browser keep `shopId` until logout.

### 4. Single OneSignal app (P1)

No role separation at SDK level. Same subscription id is reused for both channels; targeting is only via which DB table/id you pass to `include_subscription_ids`.

### 5. ID field inconsistency (P2)

| Call site | ID source |
|-----------|-----------|
| `rfqPushRegister.js` | `PushSubscription.id` only |
| `ShopLogin.jsx` | `PushSubscription.id` \|\| `onesignalId` |
| `useOneSignalCustomPrompt` | `PushSubscription.id` \|\| `onesignalId` |

If fallback ever resolves to `onesignalId` for shop but `PushSubscription.id` for buyer, logs could diverge; matching UUIDs imply both paths returned the same subscription id in your case.

### 6. Buyer re-register does not refresh subscription on duplicate (P2)

`rfq_push_subscriptions` unique key: `(rfq_request_id, onesignal_subscription_id)`.

`ON DUPLICATE KEY UPDATE viewer_path = VALUES(viewer_path)` only — new subscription id on same RFQ inserts a **second row** (old stale rows remain).

---

## Production delivery risks

| Risk | Severity | Effect |
|------|----------|--------|
| Buyer prompt updates wrong shop’s `onesignal_player_id` | **High** | Shop gets RFQ/dispatch pushes on a browser that last granted buyer permission (shared PC, shop owner testing buyer flow) |
| Same device shop+buyer testing | **Low (expected)** | Both tables store same subscription id; both push types arrive on one device |
| `save-player-id` unauthenticated | **High** | Arbitrary shop id hijack / overwrite |
| Stale subscription rows in `rfq_push_subscriptions` | **Medium** | OneSignal API may error or ignore invalid ids in batch |
| No `visibilityState` / role in OneSignal | **Medium** | Cannot distinguish “viewing as shop” vs “viewing as buyer” in OneSignal dashboard |

**Not a typical risk:** buyer push “stealing” shop subscription in the sense of OneSignal merging identities — the SDK does not have separate identities; the app writes the same browser subscription into two tables.

---

## How to verify in production

```sql
-- Same subscription on shop + buyer for one RFQ (same-browser expected)
SELECT s.id AS shop_id, s.name, s.onesignal_player_id
FROM shops s
WHERE s.onesignal_player_id = '1fe9ff72-e2df-4c5e-8304-397b31ac8806';

SELECT rfq_request_id, onesignal_subscription_id, viewer_path, created_at
FROM rfq_push_subscriptions
WHERE onesignal_subscription_id = '1fe9ff72-e2df-4c5e-8304-397b31ac8806';
```

Interpretation:

- **Same shop + same RFQ, one tester on one laptop** → expected.
- **Shop A id + unrelated buyer RFQ, shop A owner never used that browser for buyer** → investigate contamination or shared device.

Check server logs for buyer OTP page:

```
CALL SAVE API { playerId: '...', shopId: '...' }   // shopId non-null on buyer page = bug path
RFQ PUSH REGISTER: { rfqRequestId, playerId }
```

---

## Recommended separation strategy

### Immediate (minimal risk)

1. **Split prompt hooks**
   - `useBuyerOneSignalPrompt` — permission only; **never** call `/push/save-player-id`.
   - `useShopOneSignalPrompt` — permission + authenticated shop save.

2. **Harden `save-player-id`**
   - Require shop JWT (`requireShop`).
   - Set `shopId` from token, ignore client-supplied id.

3. **Buyer-only register after permission**
   - After buyer grants permission, call `tryRegisterBuyerRfqPush` (pass `rfqRequestId` when known).
   - On `/rfq/success`, do not auto-call shop save.

4. **Normalize ID source**
   - Always use `OneSignal.User.PushSubscription.id` (never `onesignalId` for send API).

### Medium term

5. **Route-scoped localStorage guard**
   - On `/rfq/*`, do not read `shopId` for push registration.
   - Optional: `sessionStorage` flag `otofine_push_role=buyer|shop` set by route layout.

6. **Stale buyer subscription cleanup**
   - On register, optionally delete other `onesignal_subscription_id` rows for same `rfq_request_id` if product allows one device per RFQ.

### Long term (strong isolation)

7. **Separate OneSignal apps**
   - `NEXT_PUBLIC_ONESIGNAL_APP_ID_BUYER` vs `_SHOP` (separate service workers or path-scoped workers).
   - Backend: `ONESIGNAL_APP_ID_BUYER` / `ONESIGNAL_APP_ID_SHOP` + matching REST keys.

8. **OneSignal external id (same app fallback)**
   - Shop login: `OneSignal.login('shop:' + shopId)`
   - Buyer verify: `OneSignal.login('buyer:rfq:' + rfqRequestId)` (anonymous; logout on leave if needed)

---

## QA matrix (identity)

| # | Scenario | Expected subscription ids | Expected DB writes |
|---|----------|----------------------------|-------------------|
| 1 | Shop only, one browser | UUID-A | `shops.onesignal_player_id = A` only |
| 2 | Buyer only, one browser | UUID-A | `rfq_push_subscriptions` only |
| 3 | Shop login then buyer RFQ, same browser | **Same UUID-A** | Both tables may contain A — OK |
| 4 | Shop login, logout, buyer RFQ | Same UUID-A if permission not reset | Buyer table only if `shopId` cleared on logout |
| 5 | Shop login, **no** logout, buyer RFQ | Same UUID-A | **Bug today:** buyer prompt may also hit `save-player-id` for shop |
| 6 | Two different physical devices | Different UUIDs | No cross-device id match |

---

## Files reference

| File | Role |
|------|------|
| `frontend/lib/onesignal.js` | Single-app init |
| `frontend/lib/useOneSignalCustomPrompt.js` | **Shared — shop save on buyer** |
| `frontend/lib/rfqPushRegister.js` | Buyer DB register |
| `frontend/components/push/BuyerPushPrompt.jsx` | Uses shared hook |
| `frontend/components/pages/ShopLogin.jsx` | Shop save on login |
| `backend/routes/push.routes.js` | Unauthenticated shop save |
| `backend/controllers/rfqPush.controller.js` | Buyer subscription insert |
