# Password Reset Flow — Technical

## Tables

### `password_reset_tokens`

| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT PK | |
| account_id | INT FK → shop_accounts | |
| token_hash | CHAR(64) | SHA-256(raw token) |
| expires_at | DATETIME | Default 60 minutes |
| used_at | DATETIME NULL | Set on successful reset |
| created_at | DATETIME | |
| ip_address | VARCHAR(45) | Request IP |

**Never store raw token in DB.**

### `auth_logs`

| event_type | When |
|------------|------|
| `password_reset_request` | Forgot email sent |
| `password_reset_complete` | Reset succeeded |
| `password_change` | Change password OK |
| `password_change_failed` | Wrong old password |

## Token lifecycle

```
generateOpaqueToken()  → 64 bytes base64url
hashToken()            → SHA-256 hex (store)
email link             → raw token in query only
reset API              → hash compare + used_at + expiry
```

## Migration

- `038` created `shop_password_reset_tokens`
- `039` renames to `password_reset_tokens`, adds `ip_address`, creates `auth_logs`

```bash
cd backend && npm run migrate:auth:email
```

## Code map

| Layer | File |
|-------|------|
| Service | `domains/auth/services/passwordReset.service.js` |
| Email | `domains/auth/services/email.service.js` |
| Template | `domains/auth/templates/passwordResetEmail.js` |
| Repository | `domains/auth/repositories/passwordReset.repository.js` |

## Backward compatibility

- Login JWT unchanged
- `POST /api/auth/shop-forgot-password` path unchanged
- Accepts `newPassword` or `password` on reset body
- Legacy `AUTH_EXPOSE_RESET_TOKEN=true` still returns dev token (non-production)
