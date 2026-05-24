# Resend Setup — Otofine Shop Auth

## 1. Resend account

1. Create account at [https://resend.com](https://resend.com)
2. Add and verify sending domain (e.g. `otofine.com`)
3. Create API key

## 2. Backend environment variables

Add to `backend/.env` (never commit):

```env
RESEND_API_KEY=re_xxxxxxxx
MAIL_FROM=Otofine Shop <noreply@yourdomain.com>
FRONTEND_URL=https://otofine.com

# Optional (defaults shown)
AUTH_RESET_EXPIRES_MINUTES=60
AUTH_EXPOSE_RESET_TOKEN=false
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `RESEND_API_KEY` | Yes (prod) | Resend API |
| `MAIL_FROM` | Yes | Verified sender in Resend |
| `FRONTEND_URL` | Yes | Reset link base URL |
| `AUTH_EXPOSE_RESET_TOKEN` | No | `true` only for local dev without email |

## 3. Install dependency

```bash
cd /var/www/otofine/backend
npm install resend
```

Already in `package.json` after this change.

## 4. Deploy checklist

```bash
npm run migrate:auth:email
pm2 restart otofine-backend
```

Test forgot password with a real shop email on `active` account.

## 5. Email content

- Subject: `Đặt lại mật khẩu Otofine Shop`
- Link: `${FRONTEND_URL}/shop/reset-password?token=...`
- HTML + plain text in `domains/auth/templates/passwordResetEmail.js`

## 6. Troubleshooting

| Symptom | Check |
|---------|--------|
| Generic OK but no email | `RESEND_API_KEY`, `MAIL_FROM` domain verified |
| 400 invalid token | Expired (>60m) or already used |
| Migration failed | Run `migrate:auth:email`; check `password_reset_tokens` exists |

## 7. Frontend routes

| URL | Page |
|-----|------|
| `/shop/forgot-password` | Request email |
| `/shop/reset-password?token=` | Set new password |
| `/shop/change-password` | Logged-in change (ShopGuard) |
