# Auth Email Flow — Shop Seller

## Overview

| Flow | API | Auth |
|------|-----|------|
| Forgot password | `POST /api/auth/shop-forgot-password` | Public + rate limit |
| Reset password | `POST /api/auth/shop-reset-password` | Public + rate limit |
| Change password | `POST /api/auth/change-password` | Bearer JWT + `requireShop` |

## Forgot password

1. Seller submits `{ "email": "shop@example.com" }`
2. API always responds with generic success message (no email enumeration)
3. If account exists and not deleted:
   - Invalidate prior reset tokens
   - Insert `password_reset_tokens` (SHA-256 hash, 60 min TTL, `ip_address`)
   - Log `auth_logs.password_reset_request`
   - Send Resend email with link:  
     `${FRONTEND_URL}/shop/reset-password?token=<opaque>`

## Reset password

1. Seller opens email link → `/shop/reset-password?token=...`
2. Submits `{ "token", "newPassword" }`
3. API verifies token unused + not expired
4. Updates `shop_accounts.passwordHash` (bcrypt 12 rounds)
5. Marks token `used_at`, revokes all `shop_refresh_tokens`
6. Logs `auth_logs.password_reset_complete`
7. Frontend clears `localStorage` tokens → redirect login

## Change password (logged in)

1. `POST /api/auth/change-password` with Bearer token
2. Body: `{ "oldPassword", "newPassword" }`
3. Verify old password with bcrypt
4. Hash new password, revoke refresh tokens, log `auth_logs.password_change`
5. Client clears session → login again

## Security

- No plaintext passwords in API responses
- Rate limits on login / forgot / reset
- Password policy: min 8 chars, letter + digit (new/reset/change only)
- JWT shape unchanged (`id` = `shop_accounts.id`)

## Env

See `resend-setup.md`.
