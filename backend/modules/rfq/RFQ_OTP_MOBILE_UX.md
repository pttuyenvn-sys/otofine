# RFQ buyer OTP — mobile UX (2026-05)

## Changes

| Area | Implementation |
|------|----------------|
| Autofill | `autoComplete="one-time-code"`, `inputMode="numeric"`, `pattern="[0-9]*"` on capture + first box |
| WebOTP | `navigator.credentials.get({ otp: { transport: ['sms'] } })` when supported |
| UI | `RfqOtpInput` — 6 boxes, single string state, paste + backspace + arrows |
| Auto-submit | `onComplete` → verify when 6 digits; `verifyInFlightRef` prevents duplicates |
| Session | `localStorage` map `rfq_viewer_sessions_v1` keyed by `publicId`; validated via `GET /rfq/by-token` |
| SMS format | `formatRfqOtpSmsBody()` — `Otofine OTP: 431169\n\n@otofine.com #431169` |

## Viewer token lifecycle (unchanged security)

- OTP verify still required for first auth on `pending_otp` RFQ.
- Server stores `viewer_token_hash` only; raw token returned once at verify.
- `rfqViewerAuth` middleware unchanged — every API call validates hash + row exists.
- RFQ expiry still governed by `rfq_requests.expires_at` / status (not client session TTL).
- Client persistence **skips OTP screen only** after successful server validation — does not bypass checks.

## Files

- `frontend/components/rfq/RfqOtpInput.jsx`
- `frontend/app/rfq/success/page.js`
- `frontend/lib/rfq/rfqViewerSession.js`
- `frontend/app/rfq/rfq-scope.css` (OTP styles)
- `backend/modules/rfq/utils/rfqOtpSms.js`
- `backend/modules/rfq/services/rfqPublic.service.js` (SMS preview logs)

## QA

1. Android Chrome — SMS suggestion → fill → auto-submit
2. iPhone Safari — code suggestion → auto-submit
3. Paste `123456` — all boxes fill, single verify
4. Wrong code — error message, boxes stay editable
5. Revisit `/rfq/success` same `publicId` — skip OTP if token valid
