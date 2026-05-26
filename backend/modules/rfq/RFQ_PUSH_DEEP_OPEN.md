# RFQ Push Deep-Link Reopen

## Target flow

```
Push tap
  → /rfq/open?publicId=&dispatchId=&attributionId=
  → try localStorage viewer token + GET /rfq/by-token
  → else history session → POST /history/requests/:publicId/open (mint token)
  → redirect /rfq/t/{token}?dispatchId=#dispatch-{id}
```

Fallback (no valid token / no history session):

```
save intent → /rfq/history?auth=1 → OTP → resume intent → viewer chat
```

## Security model

| Rule | Detail |
|------|--------|
| **No publicId-only access** | `publicId` in URL is an identifier only |
| **Viewer token required** | Chat opens only after `X-RFQ-Viewer-Token` validates |
| **Mint requires history session** | New token only via authenticated history `open` endpoint (phone OTP) |
| **Stored token validated** | Stale tokens cleared on 401 |

## Push payload

OneSignal `url` + `data`:

- `publicId` (required)
- `dispatchId` (optional — chat thread)
- `attributionId` (optional — reminder analytics)
- `rfqRequestId` (optional — diagnostics)

Built by `backend/modules/rfq/utils/rfqPushDeepLink.js`.

## Analytics (client)

- `rfq.push.deep_open` — resolution started
- `rfq.push.deep_open_restored` — success (`stored_viewer_token` \| `history_mint`)
- `rfq.push.deep_open_failed` — e.g. `auth_required`

## Mobile / browser

- URL + hash `#dispatch-{id}` for query-param loss on mobile WebViews
- `sessionStorage` dispatch fallback (existing `rfqBuyerDeepLink.js`)
- `/rfq/open` shows brief loading state during token resolve
- OneSignal click handler calls same resolver as URL landing

## Files

| Layer | Path |
|-------|------|
| Backend URL builder | `utils/rfqPushDeepLink.js` |
| Push sends | `services/rfqPushBuyer.service.js` |
| Resolver | `frontend/lib/rfq/rfqPushDeepOpen.js` |
| Landing page | `frontend/app/rfq/open/page.js` |
| Intent resume | `frontend/app/rfq/history/page.js` |
| Click wire | `frontend/lib/rfq/rfqBuyerPushClick.js` |
