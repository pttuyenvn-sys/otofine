# Auth Migration Plan

## Phase 1 — Database (038_shop_auth_upgrade.sql)

1. Expand `shop_accounts.status` ENUM: `pending`, `active`, `blocked`, `suspended`, `deleted`
   - Keeps `blocked` for existing admin API without editing `adminController.js`
   - Adds `suspended`, `deleted` for code that already uses them
2. Create `shop_password_reset_tokens`
3. Create `shop_refresh_tokens`

**Rollback:** Drop new tables; ENUM shrink only if no rows use new values.

**Run:** `npm run migrate:auth`

## Phase 2 — Domain module

Add `backend/domains/auth/**` with shims at old paths.

## Phase 3 — Security endpoints

- Wire `POST /api/auth/shop-forgot-password`
- Add `POST /api/auth/shop-reset-password`
- Add `POST /api/auth/shop-refresh`, `POST /api/auth/shop-logout` (additive)

## Phase 4 — Frontend (minimal)

- `ShopForgotPassword.jsx` only: generic message + optional token query reset form

## Data migration

- No password resets for existing users
- On login: rehash bcrypt 10 → 12 if verify succeeds

## Environment variables (new, optional)

| Variable | Default |
|----------|---------|
| `AUTH_ACCESS_EXPIRES` | `7d` |
| `AUTH_REFRESH_EXPIRES` | `30d` |
| `AUTH_BCRYPT_ROUNDS` | `12` |
| `AUTH_RESET_EXPIRES_MINUTES` | `60` |
| `AUTH_LOGIN_RATE_MAX` | `20` |
| `AUTH_LOGIN_RATE_WINDOW_MS` | `900000` |
| `AUTH_EXPOSE_RESET_TOKEN` | `false` (dev only) |
