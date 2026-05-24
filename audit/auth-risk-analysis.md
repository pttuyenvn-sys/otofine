# Auth Risk Analysis — Shop Seller

**Date:** 2026-05-24  
**Scope:** Shop seller auth only (`shop_accounts`, `/api/auth/shop-*`, middleware)

---

## File inventory

| File | Purpose | Risk | Dependencies |
|------|---------|------|----------------|
| `backend/controllers/authController.js` | Register, login, forgot (shop+admin) | **HIGH** | pool, bcrypt, jwt |
| `backend/middlewares/auth.js` | requireAuth, requireShop, requireAdmin | **HIGH** | jwt, shops table |
| `backend/routes/auth.routes.js` | Wire `/api/auth/*` | MEDIUM | authController |
| `backend/routes/admin.routes.js` | Duplicate shop auth + admin shops | MEDIUM | authController |
| `frontend/.../ShopLogin.jsx` | Login UI | LOW | `/api/auth/shop-login` |
| `frontend/.../ShopRegister.jsx` | Register UI | LOW | `/api/auth/shop-register` |
| `frontend/.../ShopForgotPassword.jsx` | Forgot UI | **HIGH** | expects plaintext `newPassword` |
| `backend/controllers/adminController.js` | shop_accounts status/delete | MEDIUM | **Out of refactor scope** |
| `backend/controllers/adminAuthController.js` | Dead code | LOW | unused |
| RFQ `rfqSeller.middleware.js` | chains requireAuth+requireShop | MEDIUM | **Do not change** |

---

## Security findings

| ID | Issue | Severity |
|----|-------|----------|
| R1 | `shopForgotPassword` returns `newPassword` plaintext | **CRITICAL** |
| R2 | `adminForgotPassword` returns plaintext | **CRITICAL** |
| R3 | `shop-forgot-password` route not wired; UI calls dead endpoint | **HIGH** |
| R4 | No login rate limit | **HIGH** |
| R5 | JWT 7d, no refresh/revoke | **MEDIUM** |
| R6 | `status='deleted'` not in DB ENUM | **HIGH** |
| R7 | Login field named `email` but UI allows phone | **MEDIUM** |
| R8 | No password strength validation | **MEDIUM** |
| R9 | JWT only in localStorage (XSS) | **MEDIUM** |
| R10 | Generic register error leaks duplicate | LOW |

## Mitigations (this refactor)

- R1–R2: Reset token tables + generic responses
- R3: Wire routes + update forgot-password page only
- R4: express-rate-limit on login/register/forgot
- R5: Optional refresh token (additive response field)
- R6: Migration expands ENUM
- R7: Resolve email OR phone server-side
- R8: Validators on register/reset
