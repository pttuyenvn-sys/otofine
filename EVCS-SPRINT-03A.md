# EVCS-SPRINT-03A — Above The Fold (Hero + KPI)

**Sprint:** 03A  
**Date:** 2026-07-01  
**Status:** ✅ Complete — chờ review PR  
**Branch:** `evcs/sprint-03a-hero`  
**PR:** https://github.com/pttuyenvn-sys/otofine/pull/new/evcs/sprint-03a-hero *(tạo PR trên GitHub — `gh` CLI chưa có trên server)*
**Scope:** Chỉ Above The Fold — không section khác

---

## Mục tiêu đã hoàn thành

| Hạng mục | Trạng thái |
|----------|------------|
| Hero copy (3 giây — trả lời “website giúp gì”) | ✅ |
| Hero Background (gradient + glow + grid) | ✅ |
| Hero Image placeholder (4:3) | ✅ |
| Hero Motion (`useReveal` + reduced-motion) | ✅ |
| Hero CTA (Primary + Secondary + hotline icon) | ✅ |
| KPI band (mock từ `homeContent.ts`) | ✅ |
| Scroll Indicator | ✅ |

**Không làm:** Interest, Giải pháp, Journey, Case study, CTA cuối, Footer mới.

---

## Product Principle

> EVCS không bán trạm sạc. EVCS bán sự an tâm khi đầu tư.

Hero tone: **truyền cảm hứng** — không quảng cáo, không bán hàng.

---

## Copy Hero

| Field | Nội dung |
|-------|----------|
| Eyebrow | Năng lượng xanh |
| H1 | Kiến tạo hạ tầng sạc xanh cho tương lai |
| Lead (3s) | Tư vấn đầu tư trạm sạc VinFast — có chuyên gia đồng hành từ khảo sát đến vận hành. |
| Subline | Minh bạch từng bước — không áp lực, không ràng buộc khi trao đổi qua Zalo. |

**CTA:**
- Primary: **Nhận phương án đầu tư** (`variant: plan` → Zalo)
- Secondary: **Đặt lịch khảo sát** (`variant: survey` → Zalo)
- Hotline: icon nhỏ (`HeroHotlineIcon`)

**Không dùng:** Giảm giá, khuyến mại, trả góp, giá bán, sản phẩm.

---

## KPI mock (`HERO_KPI_ITEMS`)

| Value | Label |
|-------|-------|
| 50+ | Mô hình đầu tư đã tư vấn |
| 63 | Tỉnh thành hỗ trợ khảo sát |
| 6 | Bước triển khai minh bạch |
| 24/7 | Hỗ trợ kỹ thuật |

Data trong `src/evcs/constants/homeContent.ts` — không hardcode trong component.

---

## Files tạo mới

```
frontend/src/evcs/
├── components/home/
│   ├── HomeHero.tsx
│   ├── HeroImage.tsx
│   ├── HeroCta.tsx
│   ├── HeroHotlineIcon.tsx
│   ├── KpiBand.tsx
│   └── ScrollIndicator.tsx
├── constants/homeContent.ts
├── hooks/useReveal.ts
└── styles/home.css
```

## Files sửa

| File | Thay đổi |
|------|----------|
| `views/HomeView.tsx` | Chỉ render `HomeHero` |
| `constants/cta.ts` | +variant `plan` |
| `types/index.ts` | +`plan` CtaVariant |
| `components/conversion/CtaButton.tsx` | Style `plan` |
| `hooks/index.ts` | Export `useReveal` |

**Không sửa** Marketplace / middleware / backend.

---

## Screenshots

| Viewport | File |
|----------|------|
| Desktop 1440×900 | [docs/evcs/sprint-03a/screenshots/evcs-03a-desktop.png](./docs/evcs/sprint-03a/screenshots/evcs-03a-desktop.png) |
| Tablet 834×1194 | [docs/evcs/sprint-03a/screenshots/evcs-03a-tablet.png](./docs/evcs/sprint-03a/screenshots/evcs-03a-tablet.png) |
| Mobile 390×844 | [docs/evcs/sprint-03a/screenshots/evcs-03a-mobile.png](./docs/evcs/sprint-03a/screenshots/evcs-03a-mobile.png) |

Preview local:

```bash
cd frontend && EVCS_DEV_ENABLED=true npm run dev
# http://localhost:3001/
```

---

## Acceptance checklist

- [x] Above The Fold only
- [x] Inspirational hero — không ecommerce tone
- [x] Không từ “sản phẩm”
- [x] CTA đúng copy Sprint 03A
- [x] Hotline = icon nhỏ
- [x] KPI mock từ constants
- [x] Hero image placeholder 4:3
- [x] Motion + `prefers-reduced-motion`
- [x] Scroll indicator → `#kpi`
- [x] `npm run build` pass
- [x] Zero Marketplace imports

---

## Sprint tiếp theo

**03B — Interest** (“Tôi đang quan tâm”, 5 cards) — chỉ sau khi 03A PR merge.

---

*Sprint 03A — review gate trước khi merge.*
