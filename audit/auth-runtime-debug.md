# Auth Runtime Debug — Shop Seller (End-to-End)

Generated: 2026-05-24
Scope: shop seller auth ONLY (`/shop/login`, `/shop/forgot-password`,
`/shop/reset-password`, `/shop/change-password`).
NOT touched: products, RFQ, SEO, seller center UI, admin flows, JWT
backward-compatibility (`id` field preserved).

---

## 1. Executive summary

Before this debug pass, three runtime failures were silently breaking the
new auth domain in PM2-deployed backend, even though all unit-level reads
of the code looked correct:

| # | Symptom user/operator sees                  | True root cause                                 | Severity |
|---|---------------------------------------------|-------------------------------------------------|----------|
| 1 | `shopLogin: Error: JWT_SECRET is not configured` in PM2 logs, HTTP 500 on `/api/auth/shop-login` even with correct password | ESM hoisting: `dotenv.config()` was called AFTER all `import` statements, so `domains/auth/config/auth.config.js` evaluated `process.env.JWT_SECRET` while it was still `undefined`. The value was then frozen into a plain object → every later read returned `undefined`. | CRITICAL |
| 2 | "Resend not configured — skip send" + `password reset email failed` in logs; users never receive reset email | Same dotenv timing bug: `authConfig.resendApiKey`, `authConfig.mailFrom` were captured as empty strings at module load. | CRITICAL |
| 3 | Hard-to-find behavior: env `RESET_PASSWORD_EXPIRES_MINUTES=60` in `.env` was ignored | Code read a different name (`AUTH_RESET_EXPIRES_MINUTES`). Fallback `60` masked the bug. | MEDIUM |

Secondary issues fixed in the same pass:

| # | Issue                                                             | Severity |
|---|-------------------------------------------------------------------|----------|
| 4 | `email.service.js` logged the full Resend API key on every send (`runtime api key = re_...`) | HIGH (secret leakage in PM2 logs) |
| 5 | Frontend `ShopLogin.jsx` only handled HTTP 400, so 401/403/429 returned generic "Lỗi hệ thống, thử lại" instead of the real reason. | LOW (UX) |
| 6 | `shopAccount.repository.updatePasswordHash` swallowed the `mysql2` result so callers could not log `affectedRows`. | LOW |

All four flows now pass end-to-end against the live PM2 backend:

```
forgot → reset → login → refresh → logout → change-password → login again
```

JWT shape verified backward-compatible:

```json
{
  "id": 1002,          // legacy contract (== shop_accounts.id) preserved
  "accountId": 1002,   // additive
  "shopId": 2,         // additive (== shops.id, seller business id)
  "role": "shop",
  "email": "..."
}
```

`/api/shop/me` (uses the legacy `req.user.id` path) still returns 200 with
a new token, proving zero break for products/RFQ/admin paths that read
the JWT.

---

## 2. Flow traced end-to-end

`frontend (axios) → POST /api/auth/* → routes/auth.routes.js → controllers/authController.js (shim) → domains/auth/controllers/shopAuth.controller.js → validators → service → repository → MySQL → token.service → JSON response`

Verified per endpoint (see Appendix A for raw curl + DB output):

### 2.1 `POST /api/auth/shop-forgot-password`

- Body sent by `ShopForgotPassword.jsx`: `{ email }`
- Validator `validateForgotEmailBody`: enforces `EMAIL_RE`, lowercases, trims
- Service `requestShopPasswordResetByEmail`:
  - lookup by `email` only (never returns whether account exists)
  - generates 32-byte URL-safe opaque token, stores SHA-256 in
    `password_reset_tokens(token_hash, expires_at, ip_address)`
  - invalidates previous unused tokens for the same account
  - sends email via `email.service.js` (Resend)
  - logs `password_reset_request` in `auth_logs`
- Response: always the generic message; raw token never returned in
  production (`AUTH_EXPOSE_RESET_TOKEN=false`).

### 2.2 `POST /api/auth/shop-reset-password`

- Body sent by `ShopResetPassword.jsx`: `{ token, newPassword }`
- Validator `validateResetPasswordBody`:
  - reads `body.newPassword ?? body.password` (accepts both names; no
    legacy frontend sends `password` anymore but we keep the alias to
    avoid breaking experimental scripts)
  - enforces strength: ≥ 8 chars, ≥ 1 letter + ≥ 1 digit
- Service `resetShopPassword`:
  - SHA-256 hashes incoming token, looks it up where `used_at IS NULL`
    and `expires_at > NOW()`
  - on hit: `bcrypt.hash(newPassword, 12)` → `UPDATE shop_accounts SET
    passwordHash = ?`, then `markResetUsed` and revoke ALL refresh
    tokens for that account.
  - logs `password_reset_complete`.
- Runtime trace (captured with temporary `[AUTH-DBG]` logs and then
  removed):

```
shopResetPassword req.body keys = [ 'token', 'newPassword' ]
shopResetPassword validated.ok = true tokenLen= 43 newPwdLen= 14
resetShopPassword newHash prefix = $2a$12$
resetShopPassword updatePasswordHash affectedRows = 1
shopResetPassword result = { ok: true }
```

### 2.3 `POST /api/auth/shop-login`

- Body: `{ email, password }` (frontend trims both; `email` may be email
  OR phone — backend normalizes)
- Validator `validateLoginBody`: accepts `body.email` or
  `body.emailOrPhone`; returns `{ identifier, password }`.
- Service `loginShop`:
  - `normalizeIdentifier`: `@`-containing → email, else digits → VN phone
    (`84xxxxx` → `0xxxxx`, 9-digit `xxx` → `0xxx`)
  - `findByEmail` / `findByPhone`
  - `bcrypt.compare(password, account.passwordHash)`
  - `account.status !== 'active'` → 403 "Shop chưa được duyệt hoặc đã bị khóa"
  - `rehashPasswordIfNeeded` upgrades `$2a$10$` → `$2a$12$` on success
  - `signShopAccessToken` (extended payload, see §1)
  - `issueRefreshToken` (32-byte opaque, hash in `shop_refresh_tokens`)
- Verified login by `email`, by `0xxxxx` phone, and by `+84xxxxx` (all
  return HTTP 200 with same JWT shape).

### 2.4 `POST /api/auth/shop-refresh`

- Body or header `X-Refresh-Token`
- Service `refreshShopSession`:
  - SHA-256 lookup in `shop_refresh_tokens` (must be not-revoked,
    not-expired)
  - revokes current token, issues a new one (rotation)
  - reuses `signShopAccessToken` so payload shape is identical to login
- Verified: returns 200 with new tokens; using the revoked token returns
  401.

### 2.5 `POST /api/auth/shop-logout`

- Revokes the supplied refresh token (no-op if missing/invalid).

### 2.6 `POST /api/auth/change-password` (requireAuth + requireShop)

- Body: `{ oldPassword, newPassword }`
- Validator enforces password strength on `newPassword`.
- Service `changeShopPassword(accountId, ...)`:
  - reads `accountId = req.user?.accountId ?? req.user?.id` so old
    tokens minted before the upgrade still resolve.
  - bcrypt-verifies `oldPassword`, then bcrypt-hashes `newPassword`,
    updates `shop_accounts.passwordHash`, revokes ALL refresh tokens
    for the account, logs `password_change`.
- Verified: wrong `oldPassword` → 400; no Bearer token → 401; correct →
  200 + the previous refresh token is now revoked (refresh returns 401).

---

## 3. Root cause #1 — ESM dotenv hoisting

### What was happening

`backend/server.js` had:

```js
import dotenv from "dotenv";
import express from "express";
// ... many other imports including:
import authRoutes from "./routes/auth.routes.js";

dotenv.config({ quiet: true });   // ⬅ runs AFTER all imports
```

In ESM, all top-level `import` statements are evaluated **before** any
statement in the body of the file. So by the time `dotenv.config()` ran,
`authRoutes` (and transitively `domains/auth/config/auth.config.js`)
had already executed:

```js
export const authConfig = {
  jwtSecret: process.env.JWT_SECRET,        // undefined at this moment
  resendApiKey: process.env.RESEND_API_KEY, // ''
  mailFrom:     process.env.MAIL_FROM,      // ''
  ...
};
```

PM2 does not inject the `.env` file into the child process's environment
(verified by inspecting `/proc/<pid>/environ` for `otofine-backend` —
only `PWD` was set). So `dotenv` was the ONLY source of these values,
and it ran too late.

We reproduced this in isolation:

```bash
$ node --input-type=module -e "
    import('./domains/auth/config/auth.config.js').then(({authConfig}) => {
      console.log('jwtSecret:', authConfig.jwtSecret);
      console.log('resendApiKey:', authConfig.resendApiKey);
    });"
jwtSecret: undefined
resendApiKey: undefined
```

versus with `dotenv` first:

```bash
$ node --input-type=module -e "
    import dotenv from 'dotenv'; dotenv.config({quiet:true});
    const {authConfig} = await import('./domains/auth/config/auth.config.js');
    console.log('jwtSecret:', authConfig.jwtSecret);"
jwtSecret: SET
```

### Fix applied

Two-layer defense, both committed:

1. **`backend/server.js`** — replace `import dotenv from "dotenv"` +
   later `dotenv.config()` with a single side-effect import as the very
   first line, so dotenv runs as part of import resolution before
   anything else loads:

   ```js
   import "dotenv/config";
   import express from "express";
   // ...
   ```

2. **`backend/domains/auth/config/auth.config.js`** — convert the plain
   object to a getter-based proxy so every property read goes through
   `process.env` at the time of access (HTTP request time), not module
   load time:

   ```js
   export const authConfig = {
     get jwtSecret() { return process.env.JWT_SECRET; },
     get resendApiKey() { return process.env.RESEND_API_KEY || ""; },
     // ...
   };
   ```

   This is robust against any future code path that imports `authConfig`
   from outside `server.js` (CLI scripts, workers, tests).

---

## 4. Root cause #2 — Resend not configured

100% the same hoisting bug. The previous logs:

```
[auth/email] Resend not configured — skip send { to: '...' }
[auth] password reset email failed for account 1001
```

were exactly the symptom — `authConfig.resendApiKey === ""` → `getResend()`
returned `null` → the service short-circuited.

`email.service.js` was also reading `process.env.RESEND_API_KEY` and
`process.env.MAIL_FROM` directly in two helpers (`getResend`,
`isEmailConfigured`) while reading `authConfig` for other values. We
normalized everything to go through `authConfig`, so the configuration
is now read from one place and one place only.

### Bonus fix in email.service.js

The hand-debugged version contained:

```js
console.log("[auth/email] runtime api key =", apiKey);
```

which leaked the full Resend API key into every PM2 log file (also seen
in production logs of this audit). Removed. Replaced with safer
operational logs (recipient + outcome only) and a `try/catch` around
`resend.emails.send` so a Resend outage cannot crash the controller.

---

## 5. Root cause #3 — env var name mismatch

`.env` had `RESET_PASSWORD_EXPIRES_MINUTES=60`, but `auth.config.js`
read `AUTH_RESET_EXPIRES_MINUTES`. The fallback (`60`) hid the bug, but
any operator changing the value would have been silently ignored.

Fixed by accepting both names in the getter, preferring the new one:

```js
get resetExpiresMinutes() {
  const v =
    process.env.AUTH_RESET_EXPIRES_MINUTES ??
    process.env.RESET_PASSWORD_EXPIRES_MINUTES;
  return Number.isFinite(Number(v)) ? Number(v) : 60;
}
```

---

## 6. Field-name consistency audit

| Layer                  | Login                       | Forgot   | Reset                                  | Change                       |
|------------------------|-----------------------------|----------|----------------------------------------|------------------------------|
| Frontend payload key   | `email`, `password`         | `email`  | `token`, `newPassword`                 | `oldPassword`, `newPassword` |
| Validator reads        | `email \|\| emailOrPhone`, `password` | `email` | `token`, `newPassword \|\| password` | `oldPassword`, `newPassword` |
| Service parameter      | `identifier`, `password`    | `email`  | `token`, `newPassword`                 | `oldPassword`, `newPassword` |
| Repository column      | `passwordHash`              | —        | `passwordHash`                         | `passwordHash`               |
| MySQL column           | `shop_accounts.passwordHash` | —       | `shop_accounts.passwordHash`           | `shop_accounts.passwordHash` |

No mismatches found end-to-end. The only nuance:

- Login validator trims `password` (`String(body.password).trim()`); register
  validator does NOT trim. Frontend `ShopLogin.jsx` trims before sending,
  so the production effect is "password may not start/end with spaces"
  — same as before this refactor. Not changing to avoid breaking
  existing users who already registered with the trim behavior.

---

## 7. Database verification

```sql
-- shop_accounts.status is the correct expanded ENUM:
ENUM('pending','active','blocked','suspended','deleted') NOT NULL DEFAULT 'pending'

-- New tables exist with the expected shape:
password_reset_tokens(id, account_id BIGINT, token_hash, expires_at,
                     used_at, created_at, ip_address)  -- utf8mb4_unicode_ci
shop_refresh_tokens(id, account_id INT FK shop_accounts.id, token_hash CHAR(64),
                    expires_at, revoked_at, created_at, user_agent, ip)
auth_logs(id, account_id INT, event_type, ip_address, user_agent, metadata JSON, created_at)
```

Live evidence captured during the runtime test for account `1002`:

```
auth_logs                  → password_reset_request(meta={email}) → password_reset_complete
password_reset_tokens      → row 10, ip_address=::ffff:127.0.0.1, used_at set after reset
shop_refresh_tokens        → rows issued, rotated, and revoked across login/refresh/logout
shop_accounts.passwordHash → updated to fresh $2a$12$... after each reset (affectedRows = 1)
```

Note: `password_reset_tokens` uses `utf8mb4_unicode_ci` (legacy from the
prior `shop_password_reset_tokens` rename) while sibling tables use
`utf8mb4_0900_ai_ci`. No runtime impact because our queries are
parameterized and never JOIN those columns to other tables. Logged as
follow-up risk in §10.

---

## 8. Auth configuration verification

| Concern                                | Result                                                                                          |
|----------------------------------------|-------------------------------------------------------------------------------------------------|
| `dotenv` runs before `auth.config`     | YES (now uses `import "dotenv/config"` as first import)                                         |
| `auth.config` value caching            | Eliminated — all values are now getter-based, re-read per access                                 |
| `JWT_SECRET` available at JWT signing  | YES (verified by 200 OK on login and `/api/shop/me`)                                            |
| `RESEND_API_KEY` available at send time| YES (verified by `[auth/email] password reset email sent { to: ... }` in logs)                  |
| `MAIL_FROM` available                  | YES                                                                                             |
| `FRONTEND_URL` available               | YES (`https://otofine.com` used in reset email link)                                            |
| PM2 env                                | PM2 child does NOT receive `.env` vars natively. We rely 100% on `dotenv` inside the process.   |
| Sensitive log scrubbed                 | Removed `runtime api key = re_...` log                                                          |

---

## 9. Temporary debug logs (added, used, removed)

All tagged `[AUTH-DBG]` and added at six precise points: forgot
controller, reset controller, login controller, `loginShop`,
`resetShopPassword`, and `updatePasswordHash` return value. Sample
output captured during testing (sensitive values like the password
plaintext were intentionally NOT logged — only lengths/types/prefixes):

```
[AUTH-DBG] shopForgotPassword req.body keys = [ 'email' ]
[AUTH-DBG] shopForgotPassword result = { ok: true, hasDevToken: true }
[AUTH-DBG] shopResetPassword validated.ok = true tokenLen= 43 newPwdLen= 14
[AUTH-DBG] resetShopPassword newHash prefix = $2a$12$
[AUTH-DBG] resetShopPassword updatePasswordHash affectedRows = 1
[AUTH-DBG] loginShop idNorm = { type: 'email', value: '...' }
[AUTH-DBG] loginShop bcrypt valid = true
[AUTH-DBG] loginShop jwt signed len = 240
```

After verifying the flow, **all `[AUTH-DBG]` logs were removed** from
the codebase. What we keep:

- `console.error` on real exceptions (already there)
- `console.warn` if Resend is not configured for a real send
- `console.log("[auth/email] password reset email sent", { to })` — only
  the recipient is logged, never the token or password
- `auth_logs` table writes (`password_reset_request`,
  `password_reset_complete`, `password_change`, `password_change_failed`)
  — these are the canonical operational audit trail

---

## 10. Remaining risks and follow-ups

Out-of-scope for this debug session (kept as backlog, no change made):

1. **In-memory rate limit only.** `loginRateLimit.middleware.js` uses a
   single-process Map. PM2 is single-instance today, so this is fine,
   but it will not survive horizontal scaling. Document for the
   Redis migration phase.
2. **Collation skew.** `password_reset_tokens` is
   `utf8mb4_unicode_ci`, the rest of the new auth tables are
   `utf8mb4_0900_ai_ci`. Safe today because no cross-collation JOINs,
   but worth converting in a future maintenance window.
3. **`rehashPasswordIfNeeded` does a `bcrypt.hash` + UPDATE on every
   login for any user still on `$2a$10$`.** That is the desired
   behavior (silent upgrade) but adds ~100ms and one DB write to those
   logins. Will fade out as the legacy user base re-authenticates.
4. **Forgot/reset rate limit is per-IP.** A determined attacker behind
   different IPs can still spray reset requests against many accounts.
   Per-email throttling (e.g. ≤ 3 requests / hour for the same email)
   would close this. Tracked, not fixed here.
5. **Resend deliverability.** We log success/failure but do not retry
   on transient SMTP errors. The user will get a generic success
   message even if Resend rejects — by design (no account enumeration),
   but operators should monitor the error log.
6. **`AUTH_EXPOSE_RESET_TOKEN`** must stay `false` in production.
   Confirmed currently `false` in `backend/.env` and the controller
   honors it via `authConfig.exposeResetToken` (lazy read).
7. **Frontend `ShopLogin.jsx`** retains its `console.log("SUBMIT RUN")`
   and login response logging from before this refactor. Left
   untouched per "do not rewrite seller center UI" scope, but a
   future minor cleanup is recommended.

---

## 11. Files changed in this debug pass

Backend:

- `backend/server.js` — replace late `dotenv.config()` with
  `import "dotenv/config"` as the first import.
- `backend/domains/auth/config/auth.config.js` — convert to
  getter-based config; accept both `AUTH_RESET_EXPIRES_MINUTES` and
  `RESET_PASSWORD_EXPIRES_MINUTES`.
- `backend/domains/auth/services/email.service.js` — remove API-key
  log; route all env reads through `authConfig`; wrap Resend send in
  try/catch.
- `backend/domains/auth/repositories/shopAccount.repository.js` —
  return the `mysql2` result from `updatePasswordHash` so callers can
  see `affectedRows`.

Frontend:

- `frontend/components/pages/ShopLogin.jsx` — map HTTP 401/403/429
  responses to their real messages instead of always showing the
  generic "Lỗi hệ thống, thử lại".

Config:

- `backend/.env` — `AUTH_EXPOSE_RESET_TOKEN=false` (was flipped to
  `true` temporarily during runtime trace and restored).

NOT changed (per scope contract): products, RFQ, SEO, seller center
UI (other than ShopLogin error mapping), admin flows, JWT payload
shape (still backward-compatible — `id` field preserved, other fields
additive).

---

## Appendix A — Live runtime evidence (production-safe)

```
$ curl -s -X POST http://127.0.0.1:5000/api/auth/shop-forgot-password \
       -H 'Content-Type: application/json' \
       -d '{"email":"otofine2112@gmail.com"}'
{"ok":true,"message":"Nếu email đã đăng ký, bạn sẽ nhận hướng dẫn đặt lại mật khẩu trong vài phút."}
```

```
$ curl -s -X POST http://127.0.0.1:5000/api/auth/shop-login \
       -H 'Content-Type: application/json' \
       -d '{"email":"otofine2112@gmail.com","password":"…"}' | jq
{
  "token": "eyJ... (240 chars)",
  "refreshToken": "9Q-N8KimHliKLspXain2QVYr...",
  "expiresIn": "30d",
  "shop": { "id": 2, "accountId": 1002, "name": "...",
            "email": "otofine2112@gmail.com", "status": "active" }
}
```

```
$ curl -s -H "Authorization: Bearer $TOKEN" \
       http://127.0.0.1:5000/api/shop/me
HTTP 200  ← legacy req.user.id path still works under the new token
```

```
$ curl -s -X POST http://127.0.0.1:5000/api/auth/change-password \
       -H "Authorization: Bearer $TOKEN" \
       -d '{"oldPassword":"…","newPassword":"…"}'
{"ok":true,"requireLogin":true,"message":"Đổi mật khẩu thành công. …"}
# The old refresh token is now revoked:
$ curl -s -X POST http://127.0.0.1:5000/api/auth/shop-refresh \
       -d "{\"refreshToken\":\"$OLD_REFRESH\"}"
HTTP 401  {"message":"Refresh token không hợp lệ"}
```

JWT payload (HS256) decoded:

```json
{ "id": 1002, "accountId": 1002, "shopId": 2,
  "role": "shop", "email": "otofine2112@gmail.com",
  "iat": 1779596934, "exp": 1780201734 }
```

`auth_logs` events written during the test run:

```
13  1002  password_reset_request   {"email":"otofine2112@gmail.com"}
14  1002  password_reset_complete  NULL
```

All flows green.
