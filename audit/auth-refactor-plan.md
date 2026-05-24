# Auth Refactor Plan — Shop Seller

## Principles

1. **Stability first** — shims at `controllers/authController.js`, `middlewares/auth.js`
2. **JWT `id` unchanged** — still `shop_accounts.id`
3. **Same URLs** — `/api/auth/shop-login`, `/shop/login`, etc.
4. **No products/RFQ edits**

## Target structure

```
backend/domains/auth/
├── config/auth.config.js
├── controllers/shopAuth.controller.js
├── controllers/adminAuth.controller.js
├── services/password.service.js
├── services/token.service.js
├── services/shopAuth.service.js
├── services/passwordReset.service.js
├── services/session.service.js
├── repositories/shopAccount.repository.js
├── repositories/shopProfile.repository.js
├── repositories/passwordReset.repository.js
├── repositories/refreshToken.repository.js
├── validators/shopAuth.validators.js
├── middlewares/auth.middleware.js
├── middlewares/loginRateLimit.middleware.js
├── routes/shopAuth.routes.js
└── index.js
```

## Phases & commits

| Phase | Commit message | Changes |
|-------|----------------|---------|
| 0 | docs: shop auth audit and refactor plans | 4 markdown files |
| 1 | feat(auth): migration for shop status enum and token tables | SQL + runner |
| 2 | feat(auth): domains/auth module with backward-compatible shims | domain + shims |
| 3 | feat(auth): rate limits, validation, phone login, JWT extensions | services |
| 4 | feat(auth): secure password reset flow | routes + ShopForgotPassword |
| 5 | feat(auth): refresh token and logout endpoints | session service |

## Out of scope

- `adminController.js` (shop list/approve) — ENUM fix only via migration
- Admin frontend forgot password page
- Email SMTP integration (reset link via env flag for dev)
