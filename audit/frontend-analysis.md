# Frontend Analysis — Otofine Next.js

**Stack:** Next.js 15.3 App Router, React 19, Tailwind 3 + custom CSS  
**Port dev:** 3001

---

## 1. Routing map

| Route | File | SSR | Auth |
|-------|------|-----|------|
| `/` | `app/page.js` | Static/SSR | Public |
| `/[slug]` | `app/[slug]/page.js` | `force-dynamic`, revalidate 3600 | Public SEO |
| `/product/[id]` | `app/product/[id]/page.js` | SSR + metadata | Public |
| `/shop/*` | `app/shop/**` | CSR heavy | ShopGuard |
| `/admin/*` | `app/admin/**` | CSR | AdminGuard |
| `/rfq/*` | `app/rfq/**` | Mixed | Token/session |
| `/robots.txt` | `app/robots.js` | Generated | — |
| `/sitemap.xml` | `app/sitemap.js` | Fetches backend | — |

**Middleware:** `middleware.js` — redirect `/product` → `/` only.

---

## 2. Layout & shell

| Component | Role |
|-----------|------|
| `app/layout.js` | Root: Inter font, global metadata, JSON-LD WebSite/Organization |
| `AppShell.jsx` | Sidebar + Topbar; **ẩn** trên `/`, `/rfq/*`, `/product/*`, auth pages |
| `rfq/layout.js` | Scoped `rfq-scope.css` |

**RFQ** dùng layout riêng — không có seller sidebar.

---

## 3. State management

**Không có** Redux, Zustand, React Context global.

| Pattern | Usage |
|---------|-------|
| `useState` / `useEffect` | Pages, forms |
| `localStorage` | `token`, `auth` (role), `shopId`, RFQ sessions |
| Custom hooks | `hooks/useRfq*.js`, `useShopInboxList.js`, `useVehicleSelector.js` |
| `clientJsonCache.js` | In-memory GET cache + TTL |

**Rủi ro:** State không đồng bộ giữa tabs; không server session.

---

## 4. API client patterns

```
lib/config.js → API_BASE, API_ORIGIN
api/axiosClient.js → Bearer interceptor
api/shopApi.js, productApi.js, adminApi.js, carApi.js
services/product.api.js → shop products
lib/rfq/*Api.js → RFQ fetch/axios
```

**Server components:** `getProductDetailCached.js`, `lib/seo/*` fetch trực tiếp backend.

**Proxy:** `next.config.mjs` rewrite `/api/:path*` → Express (optional nếu client gọi thẳng `NEXT_PUBLIC_API_URL`).

---

## 5. Auth flow (shop_accounts từ phía UI)

| Page | API |
|------|-----|
| `/shop/login` | `POST /api/auth/shop-login` |
| `/shop/register` | `POST /api/auth/shop-register` |
| `/shop/forgot-password` | UI có — **backend route thiếu** |
| `/admin/shops` | `GET /api/admin/shops` |
| Guards | `ShopGuard`, `AdminGuard` check localStorage |

**Lưu `shopId`:** `shops.id` (không phải `shop_accounts.id`).

---

## 6. Component inventory (cần chuẩn hóa)

### Public / Marketing
- `components/pages/Home.jsx` + `home/*`
- `components/seo/SeoLandingPage.jsx`, `SeoListingContent.jsx`, `PartKnowledgeSeoPage.jsx`
- `components/vehicle/VehicleSelector.jsx`

### Seller
- `ShopLogin`, `ShopRegister`, `ShopSettings`, `ShopAddProduct`
- `pages/products/ShopProducts.jsx`, `ProductForm.jsx`, popups (Add/Edit/Import)

### Admin
- `AdminLogin`, `AdminShops`, `AdminPartKnowledge`
- Stubs: `admin/seo`, `seo-pages`, `seo-articles` (notFound hoặc info only)

### RFQ (22 components in `components/rfq/`)
- Buyer: `RfqBuyerChatPanel`, `BuyerHistoryList`, `RfqOtpInput`
- Seller: `RfqShopInboxChatPane`, `RfqMessageComposer`

---

## 7. UI libraries & inconsistency

| Aspect | Hiện trạng |
|--------|------------|
| Styling | Tailwind + nhiều file `.css` riêng (Home.css, ProductDetail.css, seo/*.css) |
| Icons | react-icons (Feather) |
| Rich text | react-quill-new |
| Component library | **Không có** MUI/shadcn — custom mọi thứ |
| Inline styles | Guards, một số RFQ/admin |

**UI inconsistency:** Mix Tailwind utilities + legacy CSS classes; RFQ scope CSS tách biệt marketplace.

---

## 8. SEO

| Feature | Implementation |
|---------|----------------|
| Metadata | `generateMetadata` trên slug + product pages |
| robots.txt | Disallow `/rfq/`, `/shop/`, `/admin/`, `/product/`, query strings |
| sitemap.xml | Backend `GET /api/seo/sitemap-data` |
| JSON-LD | WebSite, Organization, Product, FAQ |
| Canonical | `lib/seo/siteUrl.js` |
| Slug convention | `phu-tung-o-to` base slug |

**Legacy:** Next API routes `/api/seo/*`, `/api/cron/seo-ai-nightly` → **410 Gone**

---

## 9. SSR / CSR / Hydration

| Page type | Mode |
|-----------|------|
| `[slug]` SEO | Dynamic SSR, revalidate 1h |
| Product detail | SSR metadata + client interactivity |
| Shop/Admin | Mostly client components + guards |
| RFQ chat | Client-only polling |

**Hydration risks:** Quill editor, OneSignal init — chỉ client (`useEffect`).

---

## 10. Accessibility & responsive

- **Không audit WCAG tự động** — cần manual test
- RFQ có QA doc: `app/rfq/CLOSED_BETA_UX_QA.md`
- Images: `next/image` ở một số nơi; RFQ lazy load custom

---

## 11. Technical debt frontend

| Item | Severity |
|------|----------|
| Client-only auth guards | High |
| No design system | Medium |
| Duplicate API clients (axios vs fetch in RFQ) | Medium |
| Legacy SEO admin stubs | Low |
| `frontend-rfq-dev` copy drift from `frontend` | High ops risk |
| vercel.json cron → 410 route | Low |
| No E2E tests visible | Medium |

---

## 12. Build & deploy

- `npm run build` → `next build`
- PM2 `npm start` on VPS
- `outputFileTracingRoot` for monorepo tracing
- Remote images: `img.otofine.com`, `*.r2.dev`

---

## 13. shop_accounts trên frontend

**Không có** page hay module tên `shop_accounts`. Mapping:

| UI | Backend entity |
|----|----------------|
| Shop login/register | `shop_accounts` table |
| Admin shops list | `GET /api/admin/shops` → `shop_accounts` rows |
| Shop settings/products | JWT → `shops` profile |
