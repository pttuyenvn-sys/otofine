# Auth Dependency Map

```mermaid
flowchart TB
  subgraph frontend_allowed [Frontend - allowed touch]
    SL[ShopLogin.jsx]
    SR[ShopRegister.jsx]
    SF[ShopForgotPassword.jsx]
  end

  subgraph api [API /api/auth]
    R[auth.routes.js]
  end

  subgraph domain [domains/auth - new]
    C[controllers]
    S[services]
    REP[repositories]
    M[middlewares]
  end

  subgraph legacy_shim [Backward shims]
    AC[controllers/authController.js re-export]
    AM[middlewares/auth.js re-export]
  end

  subgraph consumers_do_not_break [Consumers - DO NOT EDIT]
    PR[product.routes requireShop]
    SH[shop.routes requireShop]
    RFQ[rfqSeller.middleware]
  end

  SL --> R
  SR --> R
  SF --> R
  R --> C --> S --> REP
  C --> M
  AC --> C
  AM --> M
  PR --> AM
  SH --> AM
  RFQ --> AM
```

## JWT contract (must preserve)

| Field | Semantics | Consumers |
|-------|-----------|-----------|
| `id` | `shop_accounts.id` | `requireShop` → `shops.accountId` |
| `role` | `"shop"` \| `"admin"` | `requireAdmin` |
| `email` | login email | optional UI |

## Additive fields (safe)

| Field | Semantics |
|-------|-----------|
| `accountId` | same as `id` |
| `shopId` | `shops.id` if exists |

## Response contract (login - preserve)

```json
{
  "token": "<jwt>",
  "shop": { "id", "accountId", "name", "email", "status" }
}
```

Optional additive: `refreshToken`, `expiresIn`.
