# Otofine — Auth, Permissions & Admin Boundary Audit

> **Phase:** Structural Observation Only  
> **Date:** 2026-05-26  
> **Scope:** Read-only. No refactor suggestions. No fixes proposed. Reflects current production architecture as-is.  
> **Sources:** Full file reads across `domains/auth/`, `middlewares/`, `controllers/`, `routes/`, `server.js`, and 16 frontend auth/session files.

---

## Table of Contents

1. [Authentication Architecture](#1-authentication-architecture)
   - [Seller Auth Flow](#11-seller-auth-flow)
   - [Admin Auth Flow](#12-admin-auth-flow)
   - [Token & Session Handling](#13-token--session-handling)
   - [JWT Usage](#14-jwt-usage)
   - [Cookie Usage](#15-cookie-usage)
   - [Auth Middleware Chain](#16-auth-middleware-chain)
   - [Dual Auth Controllers](#17-dual-auth-controllers)
2. [Authorization Model](#2-authorization-model)
   - [Roles](#21-roles)
   - [Backend Permission Middleware](#22-backend-permission-middleware)
   - [Frontend Guards](#23-frontend-guards)
   - [Shop Ownership Validation](#24-shop-ownership-validation)
   - [Route Protection Map](#25-route-protection-map)
3. [Admin Boundaries](#3-admin-boundaries)
   - [Admin Routes (Backend)](#31-admin-routes-backend)
   - [Admin Routes (Frontend)](#32-admin-routes-frontend)
   - [Admin/Storefront Separation](#33-adminstorefront-separation)
4. [Session & Identity Flow](#4-session--identity-flow)
   - [Login](#41-login)
   - [Persistence](#42-persistence)
   - [SSR Auth Handling](#43-ssr-auth-handling)
   - [Client Auth Handling](#44-client-auth-handling)
   - [Logout](#45-logout)
   - [Token Refresh](#46-token-refresh)
5. [Dangerous Auth Coupling](#5-dangerous-auth-coupling)
6. [Existing RBAC Groundwork](#6-existing-rbac-groundwork)
7. [Security-Sensitive Modules](#7-security-sensitive-modules)

---

## 1. Authentication Architecture

### 1.1 Seller Auth Flow

```
POST /api/auth/shop-login
  (shopLoginRateLimit middleware applied)
  → shopAuth.controller.js → loginShop()
     → shopAuth.validators.js: validate body
     → shopAuth.service.js:
        1. SELECT FROM shop_accounts WHERE email = ?
        2. CHECK status NOT IN (pending, blocked, suspended, deleted)
        3. bcryptjs.compare(password, passwordHash)
        4. SELECT id FROM shops WHERE accountId = ?
        5. token.service.js: jwt.sign({id, accountId, shopId, role:"shop", email})
        6. session.service.js: issueRefreshToken
           → crypto.util.js: generateToken() → SHA-256 hex stored
           → INSERT INTO shop_refresh_tokens
        7. Return: { token, refreshToken, expiresIn, shop }
```

**No cookies set by backend.** Token delivery is JSON body only.

**Frontend (after successful login):**
```
ShopLogin.jsx:
  localStorage.setItem("token", res.data.token)
  localStorage.setItem("refreshToken", res.data.refreshToken)
  localStorage.setItem("shopId", res.data.shop.id)
  localStorage.setItem("auth", JSON.stringify({ role: "shop", email }))
  window.dispatchEvent(new Event("auth-changed"))
  writeOwnerCookie(res.data.token)   ← cross-subdomain UX cookie
  router.replace(getShopLoginDestinationFromSearch(search))
```

### 1.2 Admin Auth Flow

```
POST /api/auth/admin-login
  (shopLoginRateLimit middleware applied on /api/auth mount)
  (NO rate limit on /api/admin/admin-login mount)
  → adminAuth.controller.js → adminLogin()
     → adminAuth.service.js:
        1. SELECT id, email, passwordHash FROM admin WHERE email = ?
        2. bcryptjs.compare(password, passwordHash)
        3. Optional bcrypt rehash if rounds < current config
        4. token.service.js: jwt.sign({id, role:"admin", email})
        5. Return: { token, admin: { id, email } }
```

**No refresh token issued for admin.** Admin session is single access token only.

**Admin forgot password is a stub:**
```javascript
// adminAuth.service.js: requestAdminPasswordReset
// Returns generic message only — no DB token created, no email sent
return { message: "Nếu email tồn tại, bạn sẽ nhận được link reset." };
```

**Frontend (after successful admin login):**
```
AdminLogin.jsx:
  localStorage.setItem("token", res.data.token)
  localStorage.setItem("auth", JSON.stringify({ role: "admin", email }))
  window.dispatchEvent(new Event("auth-changed"))
  // NO writeOwnerCookie — admin does not get ot_owner cookie
  router.push("/admin/shops")   ← hardcoded, no returnTo
```

### 1.3 Token & Session Handling

**Backend storage:**

| Token type | Table | Stored as | TTL |
|---|---|---|---|
| Access JWT | Not stored | Stateless (verify via secret) | `AUTH_ACCESS_EXPIRES` (default `7d`) |
| Refresh token | `shop_refresh_tokens` | SHA-256 hex of opaque base64url | `AUTH_REFRESH_EXPIRES` (default `30d`) |
| Password reset | `password_reset_tokens` | SHA-256 hex | `AUTH_RESET_EXPIRES_MINUTES` (default 60 min) |

**Token generation** (`crypto.util.js`):
```
generateToken() → crypto.randomBytes(32) → base64url string
hashToken(raw)  → SHA-256(raw) → hex string (stored)
```

**Refresh rotation** (`session.service.js`):
- Validate existing refresh token (status not revoked, not expired, match hash)
- `UPDATE shop_refresh_tokens SET revoked_at = NOW()` (revoke old)
- Issue new access + refresh pair
- No binding between access token and refresh token — any valid refresh token rotates independently

**Logout** (`session.service.js`):
- `UPDATE shop_refresh_tokens SET revoked_at = NOW() WHERE token_hash = ?`
- Access token remains valid until expiry (no blocklist)

### 1.4 JWT Usage

**Token signing** (`token.service.js`):
```javascript
// Shop token payload
{ id, accountId, shopId, role: "shop", email }

// Admin token payload
{ id, role: "admin", email }
```

| Property | Value |
|---|---|
| Algorithm | jsonwebtoken default (HS256) |
| Secret | `process.env.JWT_SECRET` |
| Shop expiry | `AUTH_ACCESS_EXPIRES` or `"7d"` |
| Admin expiry | Same |
| **Shared secret** | Shop and admin JWTs signed with the same `JWT_SECRET` |

**JWT verification** (`auth.middleware.js`):
```javascript
const payload = jwt.verify(token, authConfig.jwtSecret);
req.user = payload;
```
No explicit algorithm pinning — relies on jsonwebtoken default rejection of `alg:none`.

**Frontend JWT decode** (`useStorefrontOwnerState.js`):
```javascript
import { jwtDecode } from "jwt-decode";
const decoded = jwtDecode(token); // No signature verification
```
Used for storefront owner UX only — not for API auth decisions.

### 1.5 Cookie Usage

**`ot_owner` cookie (frontend-only):**

| Property | Value |
|---|---|
| Name | `ot_owner` |
| Value | URL-encoded JWT (same as `localStorage.token`) |
| Domain | `.otofine.com` (cross-subdomain) |
| Path | `/` |
| Max-Age | 7 days default |
| SameSite | `Lax` |
| Secure | On HTTPS |
| HttpOnly | **No** — readable by JavaScript |
| Set by | `sellerOwnerCookie.js:writeOwnerCookie()` after shop login |
| Cleared by | `clearOwnerCookie()` on logout |
| Read by | `useStorefrontOwnerState.js`, `StorefrontOwnerStrip`, `StorefrontSellerShortcut` |
| Backend reads it | **Never** — backend uses `Authorization: Bearer` only |

**Purpose:** Allows the storefront page on a subdomain (`{slug}.otofine.com`) to recognize the logged-in seller as the shop owner, since `localStorage` is per-origin and not shared between apex and subdomain.

**Admin sessions:** No `ot_owner` cookie written. Admin login only writes to `localStorage`.

**Backend cookies:** `res.cookie` is not called anywhere in the auth stack. `withCredentials: false` on `axiosClient.js`.

### 1.6 Auth Middleware Chain

**Canonical middleware** (`domains/auth/middlewares/auth.middleware.js`):

```javascript
// requireAuth
// - Reads Authorization: Bearer <token>
// - Calls jwt.verify(token, jwtSecret)
// - Sets req.user = payload
// - Returns 401 on missing or invalid token

// requireAdmin
// - Reads req.user.role
// - Returns 403 if !== "admin"
// - No DB call

// requireShop
// - Reads req.user.accountId ?? req.user.id
// - SELECT id FROM shops WHERE accountId = ?
// - Sets req.shop = { id: rows[0].id }
// - Returns 401 if no accountId, 403 if shop row missing
// - Does NOT re-check shop_accounts.status
```

**Legacy shim** (`middlewares/auth.js`): Re-exports all three from domain. No own logic.

**Execution order on protected routes:**
```
requireAuth → [requireAdmin | requireShop] → handler
```

`requireAdmin` and `requireShop` are never combined — a request is either admin-only or shop-only, not both.

**Rate limiting** (`loginRateLimit.middleware.js`):

| Limiter | Routes | Window | Max |
|---|---|---|---|
| `shopLoginRateLimit` | `/auth/shop-login`, `/auth/admin-login` | `AUTH_LOGIN_RATE_WINDOW_MS` (15m) | `AUTH_LOGIN_RATE_MAX` (20) |
| `shopRegisterRateLimit` | `/auth/shop-register` | same | same |
| `shopForgotRateLimit` | `/auth/*-forgot-password`, `/auth/shop-reset-password` | same | same |

Rate limits are **in-memory per process** — not shared across PM2 worker instances.

### 1.7 Dual Auth Controllers

Two admin auth controller files exist simultaneously:

**Canonical: `domains/auth/controllers/adminAuth.controller.js`**
- Uses `adminAuth.service.js` → `bcryptjs`, raw SQL on `admin` table
- Imported via `domains/auth/index.js`
- Mounted on `/api/auth/admin-login` and `/api/admin/admin-login`

**Dead code: `controllers/adminAuthController.js`**
- Uses Sequelize `Admin` model (not used elsewhere in codebase)
- Uses `bcrypt` (not `bcryptjs`)
- JWT payload missing `email`; TTL hardcoded `"7d"` (ignores `AUTH_ACCESS_EXPIRES`)
- No imports of this file found anywhere in the codebase
- Not mounted in `server.js`
- Not referenced by any route

---

## 2. Authorization Model

### 2.1 Roles

Two roles exist in the current system:

| Role | JWT field | Backend check | Frontend check |
|---|---|---|---|
| `shop` | `role: "shop"` | `requireShop` (DB lookup) | `auth.role === "shop"` in localStorage |
| `admin` | `role: "admin"` | `requireAdmin` (string compare) | `auth.role === "admin"` in localStorage |

No sub-roles, no permission scopes, no RBAC beyond these two strings. There is no `superadmin`, `moderator`, or `viewer` role in any part of the codebase.

**Role assignment:** Set at token issue time. Only changed by re-login (no role update API endpoint).

### 2.2 Backend Permission Middleware

**`requireAuth`:**
- Verifies JWT signature and expiry
- Sets `req.user` with full token payload
- Does not check `shop_accounts.status` on each request

**`requireAdmin`:**
- `req.user.role === "admin"` string comparison only
- No DB call — purely token-based

**`requireShop`:**
- DB call: `SELECT id FROM shops WHERE accountId = ?`
- Fails if no `shops` row exists for the account
- Does **not** re-validate `shop_accounts.status === "active"` — a blocked/suspended account whose token has not expired retains shop API access until token expiry

**No middleware for:**
- Shop-to-shop resource isolation beyond `req.shop.id` being set
- Admin sub-permissions
- Read-only vs read-write distinctions
- RFQ-specific access control (RFQ has its own middleware — see below)

**RFQ-specific middleware** (`modules/rfq/middlewares/`):

| Middleware | Check |
|---|---|
| `rfqSeller.middleware.js` | Seller authenticated + `req.shop.id` set |
| `rfqViewer.middleware.js` | Buyer token from `viewer_token_hash` in `rfq_requests` |
| `rfqConversationAccess.middleware.js` | Either seller with dispatch or buyer via token |
| `rfqHistory.middleware.js` | Buyer phone-based history session |
| `rfqRateLimit.middleware.js` | Per-IP rate limit on RFQ creation |
| `rfqConversationRateLimit.middleware.js` | Per-IP rate limit on messages |

RFQ middleware is self-contained in the module and does not use `requireAuth`/`requireAdmin`.

### 2.3 Frontend Guards

**`ShopGuard.jsx`** — wraps all seller center pages:
```
Client useEffect:
  1. localStorage.getItem("token")  → missing → router.replace(loginUrl)
  2. localStorage.getItem("auth")   → missing/invalid JSON → router.replace(loginUrl)
  3. JSON.parse(auth).role === "shop" → false → router.replace(loginUrl)
  4. setReady(true) → render children
```

**`AdminGuard.jsx`** — wraps all admin pages:
```
Client useEffect:
  1. localStorage.getItem("token")  → missing → router.replace("/admin/login")
  2. localStorage.getItem("auth")   → missing/invalid JSON → router.replace("/admin/login")
  3. JSON.parse(auth).role === "admin" → false → router.replace("/admin/login")
  4. setReady(true) → render children
```

**Critical observation:** Both guards are purely client-side. They do not call the backend to verify the token. An expired JWT still passes the guard as long as `localStorage.auth.role` is set correctly. Guards are bypassable by setting `localStorage.auth` to `{"role":"shop"}` in browser dev tools.

**Real enforcement** is performed by the backend on every API call via `requireAuth` → `requireAdmin/requireShop`.

### 2.4 Shop Ownership Validation

**Backend (`requireShop`):**
```sql
SELECT id FROM shops WHERE accountId = ?
```
Sets `req.shop.id`. All protected shop API handlers use `req.shop.id` to scope queries to the owner's shop, preventing cross-shop data access at the DB level.

**Frontend storefront owner (`useStorefrontOwnerState.js`):**
```javascript
const decoded = jwtDecode(token);  // No signature verify
return decoded.role === "shop" && String(decoded.shopId) === String(expectedShopId);
```
Client-side only. No API call. JWT decoded without signature verification using `jwt-decode`. Only controls visibility of the owner strip UI — no data access.

### 2.5 Route Protection Map

**Backend routes — protection chain:**

| Route prefix | Middleware applied | Role required |
|---|---|---|
| `POST /api/auth/shop-login` | `shopLoginRateLimit` | None |
| `POST /api/auth/shop-register` | `shopRegisterRateLimit` | None |
| `POST /api/auth/admin-login` | `shopLoginRateLimit` | None |
| `POST /api/auth/shop-refresh` | None | None (refresh token in body) |
| `POST /api/auth/shop-logout` | None | None (refresh token in body) |
| `POST /api/auth/change-password` | `requireAuth → requireShop → shopLoginRateLimit` | `shop` |
| `GET /api/shop/me` | `requireAuth → requireShop` | `shop` |
| `PUT /api/shop/me` | `requireAuth → requireShop` | `shop` |
| `GET/POST/PUT/DELETE /api/products/*` | `requireAuth → requireShop` | `shop` |
| `GET /api/shop/metrics/overview` | `requireAuth → requireShop` | `shop` |
| `GET/PATCH/DELETE /api/admin/shops/*` | `requireAuth → requireAdmin` | `admin` |
| `GET/POST/PATCH/DELETE /api/admin/part-knowledge/*` | `requireAuth → requireAdmin` | `admin` |
| `POST /api/admin/shop-login` | **None** | None |
| `POST /api/admin/shop-register` | **None** | None |
| `POST /api/admin/admin-login` | **None** | None |
| RFQ buyer routes | `rfqViewer.middleware` or `rfqRateLimit` | Buyer token |
| RFQ seller routes | `requireAuth → requireShop → rfqSeller` | `shop` |
| RFQ admin routes | `requireAuth → requireAdmin` | `admin` |
| `GET /api/public/shops/*` | `publicApiRateLimit → responseCache` | None (public) |

**Frontend pages — guard applied:**

| Page | Guard | Type |
|---|---|---|
| `/shop/products`, `/shop/settings`, `/shop/account`, etc. | `ShopGuard` | Client-only |
| `/shop/add-product`, `/shop/public-page`, `/shop/insights` | `ShopGuard` | Client-only |
| `/shop/login`, `/shop/register`, `/shop/forgot-password` | None | Public |
| `/admin/shops`, `/admin/seo`, `/admin/part-knowledge` | `AdminGuard` | Client-only |
| `/admin/login`, `/admin/forgot-password` | None | Public |
| `/rfq/*` | No guard (RFQ uses token-based buyer auth) | Mixed |
| `/(shopsite)/*` | None (public storefront) | Public |
| `/`, `/[slug]`, `/p/[id]` | None | Public |

---

## 3. Admin Boundaries

### 3.1 Admin Routes (Backend)

**Mounted at:** `/api/admin` via `routes/admin.routes.js`

| Method | Path | Middleware | Handler | Notes |
|---|---|---|---|---|
| `POST` | `/shop-login` | **None** | `shopLogin` | Duplicate of `/api/auth/shop-login` without rate limit |
| `POST` | `/shop-register` | **None** | `registerShop` | Duplicate without rate limit |
| `POST` | `/admin-login` | **None** | `adminLogin` | Duplicate without rate limit |
| `POST` | `/admin-forgot-password` | **None** | `adminForgotPassword` | Duplicate without rate limit |
| `GET` | `/shops` | `requireAuth → requireAdmin` | `getAllShops` | List all shops |
| `PATCH` | `/shops/:id/status` | `requireAuth → requireAdmin` | `updateShopStatus` | Set `active`/`blocked` |
| `DELETE` | `/shops/:id` | `requireAuth → requireAdmin` | `deleteShop` | Soft delete shop |

**Also mounted for admin:**

- `GET /api/admin/part-knowledge` (via admin middleware chain)
- `POST /api/admin/part-knowledge` (create)
- `PATCH /api/admin/part-knowledge/:id` (update)
- `DELETE /api/admin/part-knowledge/:id` (delete)
- `POST /api/admin/part-knowledge/import-batch1` (batch import)

**RFQ admin routes** (`modules/rfq/routes/rfq.admin.routes.js`):

| Method | Path | Handler |
|---|---|---|
| `GET` | `/rfq/admin/health` | Health check |
| `GET` | `/rfq/admin/analytics` | Funnel analytics |
| `GET` | `/rfq/admin/seller-performance` | Per-seller metrics |
| `POST` | `/rfq/admin/requests/:id/spam` | Flag as spam |
| `POST` | `/rfq/admin/requests/:id/close` | Force close |
| `POST` | `/rfq/admin/requests/:id/replay` | Replay dispatch |

### 3.2 Admin Routes (Frontend)

| Route | Guard | Component | Capability |
|---|---|---|---|
| `/admin/login` | None | `AdminLogin` | Login form |
| `/admin/forgot-password` | None | `AdminForgotPassword` | Password reset (stub on backend) |
| `/admin/shops` | `AdminGuard` | `AdminShops` | View/block/delete shops |
| `/admin/part-knowledge` | `AdminGuard` | `AdminPartKnowledge` | Part knowledge CRUD, batch import |
| `/admin/seo` | `AdminGuard` | Admin SEO pages | SEO management |
| `/admin/seo-articles` | `AdminGuard` | SEO articles | Article management |
| `/admin/seo-pages` | `AdminGuard` | SEO pages | Page management |
| `/rfq/admin/health` | No `AdminGuard` | RFQ health page | RFQ system health |

> The `/rfq/admin/health` frontend page does not use `AdminGuard`. Its backend route does use `requireAuth → requireAdmin`.

### 3.3 Admin/Storefront Separation

**Storefront data is public — no admin access control applied:**

| Layer | Boundary |
|---|---|
| `GET /api/public/shops/*` | No auth; `publicApiRateLimit + responseCache` only |
| `GET /api/public/shops/_facets/*` | Same |
| `POST /api/storefront-events/track` | No auth; IP rate limit only |
| `app/(shopsite)/*` (frontend) | No guard; public |
| `middleware.js` (edge) | Routing only; no auth |

**Admin cannot directly write storefront content** through the admin API. Storefront content (bio, intro_html, rich content, slug, working_hours) is managed exclusively through the seller center (`/shop/public-page` → `requireAuth → requireShop`). Admins can change `shop.public_status` via `PATCH /api/admin/shops/:id/status`, which indirectly removes a shop from public visibility.

**SEO content boundaries:**

| Content type | Write path |
|---|---|
| `seo_routes`, `seo_page_cache` | Admin API + scripts |
| `part_knowledge` | Admin API (`/api/admin/part-knowledge`) |
| `category_seo_content` | No admin UI found — DB/script access only |
| Shop storefront metadata | Seller center only |

---

## 4. Session & Identity Flow

### 4.1 Login

**Seller login sequence:**
```
1. ShopLogin.jsx renders (no pre-auth check)
2. User submits form → POST /api/auth/shop-login
3. shopLoginRateLimit (per IP, in-memory)
4. shopAuth.validators.js: validate email, password
5. shopAuth.service.js: account lookup + status check + bcrypt verify
6. jwt.sign({id, accountId, shopId, role:"shop", email})
7. issueRefreshToken → INSERT shop_refresh_tokens
8. Response: { token, refreshToken, expiresIn, shop }
9. Frontend:
   localStorage.token = token
   localStorage.refreshToken = refreshToken
   localStorage.shopId = shop.id
   localStorage.auth = {role:"shop", email}
   writeOwnerCookie(token) → ot_owner cookie set
   window.dispatchEvent("auth-changed")
10. router.replace(safeReturnPath or /shop/settings)
```

**Admin login sequence:**
```
1. AdminLogin.jsx renders
2. User submits → POST /api/auth/admin-login
3. (rate limited on /api/auth; NOT rate limited on /api/admin)
4. adminAuth.service.js: admin table lookup + bcrypt verify + optional rehash
5. jwt.sign({id, role:"admin", email})
6. No refresh token issued
7. Response: { token, admin }
8. Frontend:
   localStorage.token = token
   localStorage.auth = {role:"admin", email}
   (no ot_owner cookie)
9. router.push("/admin/shops")  ← hardcoded, no returnTo
```

### 4.2 Persistence

**Server-side:** Stateless except for refresh token rows in `shop_refresh_tokens`. Access tokens are not stored server-side. A token cannot be individually revoked before expiry (no blocklist).

**Client-side:**

| Key | Value | Written by | Read by |
|---|---|---|---|
| `localStorage.token` | JWT string | ShopLogin, AdminLogin | All API clients, guards, useStorefrontOwnerState |
| `localStorage.auth` | `{role, email}` JSON | ShopLogin, AdminLogin | ShopGuard, AdminGuard |
| `localStorage.refreshToken` | Refresh token string | ShopLogin only | Not used by any visible 401 handler |
| `localStorage.shopId` | Shop ID string | ShopLogin only | Various seller components |
| `document.cookie ot_owner` | URL-encoded JWT | ShopLogin (via writeOwnerCookie) | useStorefrontOwnerState (fallback), StorefrontOwnerStrip |

> `localStorage.token` and `localStorage.auth` use the same key names for both shop and admin. When an admin logs in, they overwrite `localStorage.auth` to `{role:"admin"}`, replacing any active shop session silently.

### 4.3 SSR Auth Handling

**No server-side auth exists in the Next.js layer.**

- `app/shop/*` and `app/admin/*` pages are wrapped in client-side guards only
- `app/shop/page.js` and `app/admin/page.js` perform server-side `redirect()` to login, but do not check authentication
- Next.js `middleware.js` performs only subdomain routing — no token validation
- No `next/headers` cookie reads for auth; `next/headers` is used only for `host` header in storefront service helpers

SSR pages such as `(shopsite)/shops/[slug]/layout.js` render without any auth context and are fully public.

### 4.4 Client Auth Handling

**API request auth (`axiosClient.js`, `shopApi.js`, `adminApi.js`):**
```javascript
config.headers.Authorization = `Bearer ${localStorage.getItem("token")}`;
```
- Applied per request by interceptor
- `withCredentials: false` — no cookie sent
- **No 401 response interceptor** in `axiosClient.js` — expired tokens cause individual API calls to fail without automatic refresh or redirect

**`auth-changed` event:**
```javascript
window.addEventListener("auth-changed", handler)
```
Dispatched by login (ShopLogin, AdminLogin) and logout (Topbar). Consumed by components that need to re-read auth state (e.g. `useStorefrontOwnerState`). Custom DOM event — no BroadcastChannel, no cross-tab sync.

### 4.5 Logout

**Seller logout:**
```
1. User clicks logout (Topbar)
2. clearOwnerCookie()  → ot_owner = "" Max-Age=0
3. POST /api/auth/shop-logout  body: { refreshToken }
   → session.service.js → UPDATE shop_refresh_tokens SET revoked_at = NOW()
4. localStorage.removeItem("token")
5. localStorage.removeItem("auth")
6. localStorage.removeItem("shopId")
7. localStorage.removeItem("refreshToken")
8. window.dispatchEvent("auth-changed")
9. router.replace("/shop/login")
```

Access token remains valid until expiry after logout — no server-side blocklist.

**Admin logout:** Same localStorage clear pattern; no refresh token to revoke; no `ot_owner` to clear.

### 4.6 Token Refresh

**Refresh endpoint** (`POST /api/auth/shop-refresh`):
```
Body: { refreshToken } OR Header: x-refresh-token
→ session.service.js:
   1. hashToken(raw) → lookup shop_refresh_tokens
   2. Verify not revoked, not expired
   3. Revoke old token
   4. Issue new access + refresh pair
   5. Return: { token, refreshToken, expiresIn }
```

**Frontend refresh:** The `refreshToken` is written to `localStorage` on login. However, `axiosClient.js` has **no 401 interceptor** that triggers an automatic refresh. The refresh endpoint exists but is not called automatically when an access token expires. Token refresh must be triggered manually (no visible call sites in the 16 audited frontend files).

---

## 5. Dangerous Auth Coupling

### A1. Dual Route Mount with Asymmetric Rate Limiting

The same login handlers are mounted on two prefixes:

| Endpoint | Path | Rate limit |
|---|---|---|
| Shop login | `POST /api/auth/shop-login` | `shopLoginRateLimit` (20 req/15min per IP) |
| Shop login | `POST /api/admin/shop-login` | **None** |
| Admin login | `POST /api/auth/admin-login` | `shopLoginRateLimit` |
| Admin login | `POST /api/admin/admin-login` | **None** |
| Shop register | `POST /api/auth/shop-register` | `shopRegisterRateLimit` |
| Shop register | `POST /api/admin/shop-register` | **None** |

The `/api/admin/*` auth endpoints are unguarded by rate limiting. The admin login is accessible via both paths with different protection levels.

### A2. Shared `localStorage.token` Key — Role Collision

Both shop and admin sessions write to `localStorage.token` and `localStorage.auth`. There is a single "logged in user" slot in the browser. Logging in as admin while already a shop seller silently overwrites the shop session (and vice versa). No warning, no multi-session support.

### A3. Guards Check `auth` Object, Not JWT

Frontend guards (`ShopGuard`, `AdminGuard`) read `localStorage.auth.role` (a plain JSON string) independently of the JWT. These two sources can become desynchronized:
- If `localStorage.token` is tampered with but `localStorage.auth` is unchanged, the guard passes
- If `localStorage.auth` is set manually to `{"role":"shop"}` without a valid token, the guard passes — but all API calls fail with 401
- There is no guard-level JWT expiry check

The actual security enforcement is at the API level, not the guard level.

### A4. `requireShop` Does Not Re-Verify Account Status

`requireShop` middleware:
```sql
SELECT id FROM shops WHERE accountId = ?
```
It does not check `shop_accounts.status`. A seller whose account is `blocked` or `suspended` after login retains API access until their access token expires (up to 7 days by default). Blocking an account does not immediately revoke access.

### A5. Shared `JWT_SECRET` for Shop and Admin

Both shop tokens (`role: "shop"`) and admin tokens (`role: "admin"`) are signed with the same `JWT_SECRET`. A compromised shop JWT secret also compromises admin token verification. There is no key separation by role.

### A6. `AUTH_EXPOSE_RESET_TOKEN` Dev Flag in Production Config

`auth.config.js` exposes:
```javascript
get exposeResetToken() {
  return process.env.AUTH_EXPOSE_RESET_TOKEN === "true";
}
```

When this env var is set to `"true"`, `passwordReset.service.js` includes the raw reset token (and a dev reset URL) in the API response body. This is a production risk if deployed with the flag enabled.

### A7. No Refresh Token for Admin — No Revocation Path

Admin tokens have no refresh token. The only way to revoke an admin session is to wait for the access token to expire. There is no logout endpoint that invalidates an admin token server-side.

### A8. `ot_owner` Cookie Is Not HttpOnly

`ot_owner` is a cross-domain cookie containing the full JWT, set with `SameSite=Lax` but not `HttpOnly`. This means it is readable by JavaScript on any page under `.otofine.com`. An XSS vulnerability on any `.otofine.com` subdomain could read this cookie (same risk profile as `localStorage.token`, but the cookie surface is wider — all subdomains share it).

### A9. No 401 Auto-Refresh in `axiosClient`

When an access token expires, API calls return 401. `axiosClient.js` has no response interceptor to catch 401, call the refresh endpoint, and retry the request. Expired sessions result in silent API failures rather than a clean re-authentication flow.

### A10. Admin Forgot Password Is a Stub

`adminAuth.service.js:requestAdminPasswordReset()` returns a generic message but does not:
- Create a `password_reset_tokens` row
- Send an email
- Provide any actual reset mechanism

Admin password recovery requires direct database intervention.

### A11. `useStorefrontOwnerState` — Client-Side JWT Decode Without Verification

`useStorefrontOwnerState.js` uses `jwtDecode` (not `jwt.verify`). This decodes the JWT payload without verifying the signature. If a token has been tampered with (but formatted correctly), `decoded.shopId` could be set to an arbitrary value, causing the wrong owner strip UI to render.

The storefront analytics data and `StorefrontOwnerStrip` visibility are controlled by this decoded value. The actual metrics API (`/api/shop/metrics/overview`) is still protected by `requireAuth → requireShop` server-side.

### A12. `auth_logs.account_id` Has No Foreign Key

`auth_logs` records security events (reset, password change) with `account_id INT NULL` but no FK constraint. Deleted accounts leave orphan audit log rows, and there is no integrity guarantee linking log events to live accounts.

---

## 6. Existing RBAC Groundwork

The current system has **no RBAC implementation**. The following is what exists today:

**Roles as token strings:**
- Two hardcoded role values: `"shop"` and `"admin"`
- No role table in the database
- No permission scopes
- No resource-level permissions

**Capability boundary:**
- `shop` role: access to own shop resources only (scoped by `req.shop.id`)
- `admin` role: full access to all admin endpoints

**`shop_accounts.status` enum** (`pending, active, blocked, suspended, deleted`) represents account lifecycle states, not permission tiers.

**No groundwork exists for:**
- Multi-admin accounts with different permission levels
- Read-only admin role
- Seller tiers with different feature access
- Per-resource ownership checks beyond `shopId` matching
- OAuth / third-party identity providers

---

## 7. Security-Sensitive Modules

The following modules perform authentication, authorization, or token operations and represent the highest-risk surface for security-related changes:

### Backend

| Module | Location | Role |
|---|---|---|
| `auth.middleware.js` | `domains/auth/middlewares/` | JWT verify; sets `req.user`; gates all protected routes |
| `token.service.js` | `domains/auth/services/` | JWT sign/verify; defines both shop and admin payload shapes |
| `session.service.js` | `domains/auth/services/` | Refresh token issue, rotation, revocation |
| `shopAuth.service.js` | `domains/auth/services/` | Login gate; account status check; bcrypt verify |
| `adminAuth.service.js` | `domains/auth/services/` | Admin login; rehash path; stub reset |
| `passwordReset.service.js` | `domains/auth/services/` | Token generation; `AUTH_EXPOSE_RESET_TOKEN` flag |
| `crypto.util.js` | `domains/auth/utils/` | Token generation and hashing primitives |
| `auth.config.js` | `domains/auth/config/` | JWT secret access; bcrypt rounds; all auth env vars |
| `loginRateLimit.middleware.js` | `domains/auth/middlewares/` | In-memory rate limits for login/register/reset |
| `requireShop` in `auth.middleware.js` | `domains/auth/middlewares/` | Shop ownership resolution; DB query on every protected call |
| `rfqViewer.middleware.js` | `modules/rfq/middlewares/` | RFQ buyer token verification |
| `rfqConversationAccess.middleware.js` | `modules/rfq/middlewares/` | RFQ conversation access gating |

### Frontend

| Module | Location | Role |
|---|---|---|
| `ShopGuard.jsx` | `components/` | Seller route protection (client-only) |
| `AdminGuard.jsx` | `components/` | Admin route protection (client-only) |
| `sellerOwnerCookie.js` | `lib/auth/` | Cross-subdomain JWT cookie management |
| `safeShopRedirect.js` | `lib/auth/` | Open redirect prevention for post-login flow |
| `axiosClient.js` | `api/` | Bearer token attachment on all API requests |
| `useStorefrontOwnerState.js` | `hooks/` | Client-side JWT decode for storefront owner UI |
| `ShopLogin.jsx` | `components/pages/` | Token write to localStorage + cookie |
| `AdminLogin.jsx` | `components/pages/` | Token write to localStorage |

### Dead Code — Auth Surface

| Module | Location | Status |
|---|---|---|
| `adminAuthController.js` | `controllers/` | **Orphaned** — Sequelize-based; not imported anywhere; uses `bcrypt` vs `bcryptjs` |

This file represents an inconsistent, unmounted code path that could cause confusion about which admin auth logic is authoritative.
