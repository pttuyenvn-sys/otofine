# F & G. Security Analysis — Otofine

**Phạm vi:** Backend Express + Frontend Next.js + DB schema  
**Không thực hiện penetration test** — phân tích tĩnh từ source.

---

## 1. Auth model summary

| Actor | Mechanism | Storage |
|-------|-----------|---------|
| Shop | JWT 7d, payload `{ id: shop_accounts.id, role: shop, email }` | localStorage `token` |
| Admin | JWT 7d, `{ id, role: admin, email }` | localStorage |
| RFQ buyer viewer | Hashed token on `rfq_requests`, header `x-rfq-viewer-token` | URL / localStorage |
| RFQ history | OTP → session token `x-rfq-history-token` | localStorage |

**Không có:** refresh token, session revocation, MFA, OAuth shop login.

---

## 2. RBAC & Permissions

| Role | Enforcement |
|------|-------------|
| `admin` | `requireAdmin` — check `req.user.role === 'admin'` |
| `shop` | `requireAuth` + `requireShop` — DB lookup `shops` by `accountId` |
| Public | No middleware |

**Hạn chế:** Không có permission granularity (chỉ 2 role). Admin có full access part-knowledge, shop management, RFQ ops.

---

## 3. Password security

| Item | Status |
|------|--------|
| Hashing | bcryptjs cost 10 ✅ |
| Admin/shop forgot password | Random 8 chars → **trả plaintext trong JSON** 🔴 |
| `shopForgotPassword` | Implemented nhưng **không expose route** |
| Legacy `bcrypt` package | Chỉ trong dead `adminAuthController.js` |

---

## 4. Security issues — Nghiêm trọng (F)

| # | Issue | Vị trí | Mức độ | Đề xuất |
|---|-------|--------|--------|---------|
| S1 | **Forgot password trả mật khẩu plaintext** | `authController.adminForgotPassword`, `shopForgotPassword` | 🔴 Critical | Email reset link + token one-time; never return password |
| S2 | **Zalo OAuth callback trả token JSON** | `server.js` `/api/zalo/oa/callback` | 🔴 Critical | Server-side only storage; redirect without exposing secret |
| S3 | **Zalo test-send endpoint public** | `server.js` `/api/zalo/test-send` | 🔴 Critical | Remove hoặc admin-only + env guard |
| S4 | **`shop_accounts.status='deleted'` vs ENUM** | `adminController.deleteShop` | 🔴 High | Migration fix ENUM; data integrity |
| S5 | **JWT không refresh / revoke** | Global | 🟠 High | Short-lived access + refresh; blacklist on logout |
| S6 | **Client-side only guards** | `ShopGuard.jsx`, `AdminGuard.jsx` | 🟠 High | Server must enforce (đã có middleware — OK nếu mọi route protected) |
| S7 | **Static `/uploads` public** | `server.js` | 🟠 Medium-High | Auth hoặc signed URLs cho sensitive |
| S8 | **Không global rate limit** (non-RFQ) | Core API | 🟠 Medium | express-rate-limit trên auth/login |
| S9 | **CORS hardcoded IPs** | `server.js` defaultOrigins | 🟡 Medium | Chỉ dùng `CORS_ORIGINS` env trên prod |
| S10 | **25MB body limit** | JSON parser | 🟡 Medium | DoS vector — giảm cho hầu hết routes |

---

## 5. Security issues — Medium (G)

| # | Issue | Chi tiết |
|---|-------|----------|
| M1 | Không `helmet` | Missing security headers |
| M2 | Không input validation library | Joi/Zod — SQL injection risk thấp (parameterized) nhưng business validation yếu |
| M3 | RFQ rate limit in-memory | Bypass khi multi-instance PM2 cluster |
| M4 | Logs có thể leak PII | `console.log` err objects, Zalo webhook body |
| M5 | `db_backup_*.sql` trong repo root | Credentials/hash exposure nếu commit |
| M6 | Duplicate auth routes | Attack surface rộng hơn cần thiết |
| M7 | Admin forgot password không audit log | Không trace ai reset |
| M8 | JWT in localStorage | XSS → token theft (mitigate CSP, sanitize HTML quill) |
| M9 | Zalo webhook POST unauthenticated | Cần verify signature |
| M10 | `RFQ_MODULE_ENABLED` false trên prod? | Feature flag mismatch dev/prod |

---

## 6. SQL injection

**Đánh giá:** Risk **thấp** — hầu hết dùng `pool.query(sql, [params])` parameterized.

**Chú ý:** Dynamic SQL trong listing/search builders — cần review `productSearch.service.js`, `productList.repository.js` khi refactor (đảm bảo không string-concat user input).

---

## 7. XSS

| Surface | Risk |
|---------|------|
| `descriptionHtml`, Quill editor | Stored HTML — cần sanitize server-side |
| SEO pages `dangerouslySetInnerHTML`? | Review `components/seo/*` |
| RFQ messages | Text validation in `rfqMessageValidation.js` ✅ partial |

---

## 8. Upload risk

| Type | Control |
|------|---------|
| Product images | Multer memory → R2, Sharp |
| RFQ images | `rfqMulter.middleware.js`, size limits in nginx docs |
| Excel import | `uploadExcel.js` → local disk |

**Rủi ro:** MIME validation, malware scan — không thấy trong code.

---

## 9. Secret management

- Secrets trong `backend/.env`, `frontend/.env.local` — **không commit** (có backup files `*.backup_*` ⚠️)
- Không có `.env.example` cho backend chính
- `JWT_SECRET` single key — rotation khó

---

## 10. Auth bypass vectors cần test

1. Gọi shop API với JWT `role: shop` nhưng `shops` row chưa tạo → 403 (OK)
2. JWT expired → 401 (OK)
3. Truy cập `/api/admin/shops` với shop token → 403 (expected)
4. RFQ viewer token brute force → có throttle (RFQ only)
5. `GET /api/products` shop filter bypass — verify không lộ shop khác

---

## 11. Đề xuất xử lý (ưu tiên)

1. **Ngay:** Gỡ/vô hiệu `zalo/test-send`, sửa forgot-password flow
2. **Tuần 1:** Fix ENUM `shop_accounts.status`, thêm rate limit auth
3. **Tuần 2–4:** Helmet, validation layer, upload hardening
4. **Trước scale:** Redis rate limits, JWT refresh, CSP headers
