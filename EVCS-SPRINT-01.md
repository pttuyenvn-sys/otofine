# EVCS-SPRINT-01 — Foundation Scaffold (Revised)

**Sprint:** 01 — Foundation + Host Routing  
**Date:** 2026-07-01  
**Status:** ✅ Revised per review  
**Domain:** `tramsacvinfast.otofine.com`

---

## Thay đổi sau review

| # | Yêu cầu | Trạng thái |
|---|---------|------------|
| 1 | Homepage `/` qua middleware rewrite, bỏ `/home` | ✅ |
| 2 | Middleware host routing trong Sprint 01 | ✅ |
| 3 | Brand Guideline đầy đủ | ✅ `src/evcs/docs/BRAND-GUIDELINE.md` |
| 4 | Menu tiếng Việt | ✅ |
| 5 | Dự án = Case Study (không gallery) | ✅ |
| 6 | Investment Center, calculator là module con | ✅ |
| 7 | Design System riêng, không reuse Marketplace UI | ✅ |

---

## Host Routing

```
tramsacvinfast.otofine.com/              → rewrite /evcs
tramsacvinfast.otofine.com/giai-phap       → rewrite /evcs/giai-phap
tramsacvinfast.otofine.com/trung-tam-dau-tu → rewrite /evcs/trung-tam-dau-tu
...
```

- **File:** `src/evcs/lib/evcsHost.ts`, `src/evcs/lib/evcsMiddleware.ts`
- **Tích hợp:** `middleware.js` — chạy **trước** shop wildcard logic
- **Bảo vệ:** `/evcs/*` trên apex → 404 (không lộ internal paths)
- **Reserved:** `tramsacvinfast` trong `shopHost.js` + `publicShop.config.js`
- **Dev local:** `EVCS_DEV_ENABLED=true` → localhost được rewrite như EVCS host

### Env

```env
EVCS_SITE_HOST=tramsacvinfast.otofine.com
EVCS_DEV_ENABLED=true   # optional, local dev
```

---

## Folder Tree

```
frontend/
├── middleware.js                         # MODIFIED — +EVCS host branch
├── lib/shopHost.js                       # MODIFIED — +tramsacvinfast reserved
│
├── app/(evcs)/
│   ├── layout.tsx
│   └── evcs/                             # Internal paths (/evcs/*)
│       ├── page.tsx                      # Home
│       ├── giai-phap/page.tsx
│       ├── trung-tam-dau-tu/page.tsx     # Investment Center
│       ├── hoc-vien-ev/page.tsx
│       ├── du-an/page.tsx
│       ├── lien-he/page.tsx
│       └── ban-do-tram-sac/page.tsx
│
└── src/evcs/
    ├── components/
    │   ├── primitives/                   # Design System: Logo, Button, Card, Badge, Text
    │   ├── layout/                       # Header, Footer, Container, Section, PageHero
    │   ├── conversion/                   # CTA layer
    │   └── domain/                       # CaseStudyCard, CalculatorModule
    ├── constants/
    │   ├── routes.ts
    │   ├── navigation.ts                 # Menu tiếng Việt
    │   ├── site.ts
    │   ├── cta.ts
    │   └── projects.ts                   # Mock case studies
    ├── docs/
    │   └── BRAND-GUIDELINE.md
    ├── lib/
    │   ├── evcsHost.ts
    │   └── evcsMiddleware.ts
    ├── styles/
    │   ├── tokens.css
    │   ├── typography.css
    │   ├── primitives.css
    │   ├── components.css
    │   └── evcs.css
    ├── views/
    └── ...
```

---

## Public URLs (tiếng Việt)

| Nhãn menu | URL public |
|-----------|------------|
| Trang chủ | `/` |
| Giải pháp | `/giai-phap` |
| Trung tâm đầu tư | `/trung-tam-dau-tu` |
| Học viện EV | `/hoc-vien-ev` |
| Dự án | `/du-an` |
| Liên hệ | `/lien-he` |
| Bản đồ trạm sạc | `/ban-do-tram-sac` (footer) |

**Đã xóa:** `/home`, `/solutions`, `/academy`, `/investment`, `/calculator`, `/contact`, `/station-map`

---

## Files đã tạo (mới / thay thế)

### Middleware & routing
- `src/evcs/lib/evcsHost.ts`
- `src/evcs/lib/evcsMiddleware.ts`
- `src/evcs/constants/routes.ts`

### Design System
- `src/evcs/components/primitives/index.tsx`
- `src/evcs/styles/primitives.css`
- `src/evcs/docs/BRAND-GUIDELINE.md`

### Domain components
- `src/evcs/components/domain/CaseStudyCard.tsx`
- `src/evcs/components/domain/CalculatorModule.tsx`
- `src/evcs/constants/projects.ts`
- `src/evcs/views/InvestmentCenterView.tsx`

### Routes (internal)
- `app/(evcs)/evcs/*` (7 pages + home)

---

## Files đã sửa

| File | Thay đổi |
|------|----------|
| `frontend/middleware.js` | +`handleEvcsHostRouting` trước shop logic |
| `frontend/lib/shopHost.js` | +`tramsacvinfast` reserved |
| `backend/domains/shopPublic/config/publicShop.config.js` | +`tramsacvinfast` reserved |
| `src/evcs/constants/navigation.ts` | Menu tiếng Việt, paths mới |
| `src/evcs/components/layout/EvcsHeader.tsx` | Logo DS, `/`, nav active |
| `src/evcs/styles/tokens.css` | Glass, gradient, image ratio |
| `src/evcs/views/ProjectsView.tsx` | Case study layout |

---

## Files đã xóa

- `app/(evcs)/home/`, `solutions/`, `academy/`, `projects/`, `investment/`, `calculator/`, `contact/`, `station-map/`
- `src/evcs/views/CalculatorView.tsx`, `InvestmentView.tsx`

---

## Brand Guideline (tóm tắt)

Chi tiết: [`src/evcs/docs/BRAND-GUIDELINE.md`](frontend/src/evcs/docs/BRAND-GUIDELINE.md)

| Hạng mục | Nguồn |
|----------|-------|
| Logo | SVG `Logo` primitive |
| Color | `--evcs-color-*` tokens |
| Typography | DM Sans + Outfit |
| Spacing | 4px scale |
| Radius | sm → full |
| Shadow | xs → glow |
| Motion | fade-in, 150–400ms |
| Glass | header + `.evcs-card--glass` |
| Gradient | hero, accent, soft, glow |
| Image ratio | 16:9, 4:3, 3:4, 1:1, 21:9 |

---

## Screenshot Structure

```
┌──────────────────────────────────────────────────────────┐
│ [Logo] EVCS          Menu (VI)           Hotline | Zalo  │  ← glass header
├──────────────────────────────────────────────────────────┤
│  HERO — gradient / dark / soft                         │
│  [Nhận báo giá] [Tư vấn đầu tư]                        │
├──────────────────────────────────────────────────────────┤
│  Dự án: CASE STUDY                                       │
│  ┌─────────────┐ ┌─────────────┐                         │
│  │ Thách thức  │ │ Giải pháp   │  ← glass cards         │
│  └─────────────┘ └─────────────┘                         │
│  Kết quả · Metrics                                       │
├──────────────────────────────────────────────────────────┤
│  Trung tâm đầu tư                                        │
│  └─ Máy tính đầu tư (module con, placeholder)            │
├──────────────────────────────────────────────────────────┤
│  FOOTER — dark, tiếng Việt, no shop/seller               │
└──────────────────────────────────────────────────────────┘
```

---

## Dev preview

```bash
# .env.local
EVCS_DEV_ENABLED=true

cd frontend && npm run dev
# http://localhost:3001/              → EVCS home (rewrite)
# http://localhost:3001/giai-phap
# http://localhost:3001/trung-tam-dau-tu
# http://localhost:3001/du-an
```

Trên apex production (`otofine.com/`) — vẫn là Marketplace.  
Trên `tramsacvinfast.otofine.com/` — EVCS home (cần nginx trỏ host + `EVCS_SITE_HOST`).

---

## Chưa làm (Sprint 02+)

- Database, API, CMS, Admin
- Calculator logic (module UI đã có)
- Station map interactive
- Contact form submit
- Nginx vhost production
- Root layout isolation (loại Otofine PushInit/GA trên EVCS host)
- SEO sitemap/robots riêng

---

## Suggestions (không triển khai)

1. Nginx vhost dedicated `tramsacvinfast.otofine.com` → Sprint 02 deploy
2. Conditional root `app/layout.js` khi `x-evcs-site=1`
3. Legal pages `/chinh-sach-bao-mat` riêng
4. Font tiếng Việt: Be Vietnam Pro nếu cần

---

## Verification

- [x] `/` homepage qua middleware (không `/home`)
- [x] Middleware host routing
- [x] Brand Guideline
- [x] Menu tiếng Việt
- [x] Projects = Case Study
- [x] Investment Center + Calculator module
- [x] Design System riêng
- [x] `npm run build` exit 0
- [x] Marketplace `/` không conflict

---

*Sprint 01 revised — sẵn sàng approve và bắt đầu Sprint 02.*
