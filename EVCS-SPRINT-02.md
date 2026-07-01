# EVCS-SPRINT-02 — Homepage Experience Design

**Sprint:** 02 — Experience Design (không code)  
**Date:** 2026-07-01  
**Status:** ✅ Approved — **Revision 2** (2026-07-01)  
**Phụ thuộc:** Sprint 01 ✅ Approved  
**Sprint tiếp theo:** [EVCS-SPRINT-03-PLAN.md](./EVCS-SPRINT-03-PLAN.md) — chia 03A→03F, review từng phần

---

## Product Principle (bắt buộc)

> **EVCS không bán trạm sạc.**  
> **EVCS bán sự an tâm khi đầu tư.**

Mọi section Homepage phải truyền tải **an tâm, đồng hành, minh bạch** — không commerce, không áp lực mua.

---

## Quy tắc ngôn ngữ Homepage

| ❌ Cấm | ✅ Dùng |
|--------|---------|
| Sản phẩm | **Giải pháp** |
| Mua ngay / Bán / Giá | Nhận phương án / Tư vấn / Đồng hành |
| Danh mục sản phẩm | Giải pháp theo quy mô |

*Rà soát copy toàn Homepage trước mỗi PR Sprint 03.*

---

## Tóm tắt điều hành

Sprint 02 định nghĩa **trải nghiệm Homepage** EVCS. Mục tiêu duy nhất: **khách nhắn Zalo**.

**Định vị thị giác:** Tesla Energy × Apple × Minimal × Green Energy × Technology × Trust.

**Anti-pattern:** Marketplace Otofine, ecommerce, shop grid, landing quảng cáo, tone bán hàng.

**Revision 2** bổ sung: KPI mock, 5 interest cards, Cam kết, case study theo mô hình đầu tư, CTA/footer cập nhật, chia Sprint 03 nhỏ.

---

## Mục lục

1. [Wireframe Homepage](#1-wireframe-homepage)
2. [UX Flow](#2-ux-flow)
3. [Lý do từng Section](#3-lý-do-từng-section)
4. [Component List](#4-component-list)
5. [Motion Proposal](#5-motion-proposal)
6. [Image Proposal](#6-image-proposal)
7. [CTA Strategy](#7-cta-strategy)
8. [Responsive Strategy](#8-responsive-strategy)
9. [SEO Strategy — Homepage](#9-seo-strategy--homepage)
10. [Sprint 03 — Chia nhỏ](#10-sprint-03--chia-nhỏ)

---

## 1. Wireframe Homepage

### 1.1. Desktop (≥ 1280px)

```
┌────────────────────────────────────────────────────────────────────────────┐
│  HEADER (glass, sticky) — Hotline | Tư vấn Zalo                            │
├────────────────────────────────────────────────────────────────────────────┤
│  §01 HERO — inspirational, ~85vh, whitespace lớn                           │
│  ┌─────────────────────────────┐  ┌──────────────────────────────────┐    │
│  │ H1: Kiến tạo hạ tầng sạc    │  │  HERO IMAGE (tĩnh, 4:3)          │    │
│  │     xanh cho tương lai        │  │  Cảm hứng — không quảng cáo      │    │
│  │ Sub: hành trình + đồng hành   │  └──────────────────────────────────┘    │
│  │ [Nhận phương án đầu tư]      │                                          │
│  │ [Đặt lịch khảo sát]           │                                          │
│  └─────────────────────────────┘                                          │
├────────────────────────────────────────────────────────────────────────────┤
│  §02 KPI — mock data, 4 ô số (không counter animation)                     │
│     50+          63           6            24/7                              │
│   Mô hình ĐT   Tỉnh thành   Bước triển   Hỗ trợ                           │
├────────────────────────────────────────────────────────────────────────────┤
│  §03 TÔI ĐANG QUAN TÂM — 5 card lớn                                        │
│  [Nhà] [Trạm sạc] [Đầu tư KD] [DN] [Chưa biết chọn trụ → Trung tâm ĐT]    │
├────────────────────────────────────────────────────────────────────────────┤
│  §04 TẠI SAO CHỌN EVCS — 4 lợi ích ✓                                      │
├────────────────────────────────────────────────────────────────────────────┤
│  §05 GIẢI PHÁP — use-case → công suất (KHÔNG gọi sản phẩm)                │
│  Gia đình→AC11 · Cafe→DC20 · Khách sạn→DC30 · Bãi xe→DC60 · DV→DC120       │
├────────────────────────────────────────────────────────────────────────────┤
│  §06 HÀNH TRÌNH — ① Tư vấn → … → ⑥ Vận hành                              │
├────────────────────────────────────────────────────────────────────────────┤
│  §07 CAM KẾT CỦA CHÚNG TÔI — 3–4 cam kết ngắn, tone an tâm                │
├────────────────────────────────────────────────────────────────────────────┤
│  §08 MÔ HÌNH ĐẦU TƯ — 2 case study (headline = mô hình, không tên DA)      │
├────────────────────────────────────────────────────────────────────────────┤
│  §09 HỌC VIỆN EV — 3 bài nổi bật                                          │
├────────────────────────────────────────────────────────────────────────────┤
│  §10 CTA — "Hãy để chuyên gia đồng hành cùng bạn" → Zalo                   │
├────────────────────────────────────────────────────────────────────────────┤
│  §11 FOOTER — tối giản: logo · hotline · © · 2 link pháp lý               │
└────────────────────────────────────────────────────────────────────────────┘
```

### 1.2. Thứ tự section

| # | Anchor | Section | Sprint code |
|---|--------|---------|-------------|
| 01 | `#hero` | Hero | 03A |
| 02 | `#kpi` | KPI (mock) | 03A |
| 03 | `#quan-tam` | Tôi đang quan tâm | 03B |
| 04 | `#tai-sao` | Tại sao chọn EVCS | 03G |
| 05 | `#giai-phap` | Giải pháp | 03C |
| 06 | `#hanh-trinh` | Hành trình đầu tư | 03D |
| 07 | `#cam-ket` | Cam kết của chúng tôi | 03H |
| 08 | `#mo-hinh-dau-tu` | Mô hình đầu tư (case study) | 03E |
| 09 | `#hoc-vien` | Học viện EV | 03I |
| 10 | `#cta` | CTA cuối | 03F |
| 11 | — | Footer tối giản | 03F |

---

## 2. UX Flow

### 2.1. Conversion funnel

```
Landing → Hero (cảm hứng) → KPI (tin cậy số) → Interest (tự chọn)
    → Giải pháp / Hành trình / Cam kết → Case study (mô hình)
    → CTA "Chuyên gia đồng hành" → Zalo
```

### 2.2. Persona bổ sung (rev.2)

| Persona | Entry | Điểm chuyển đổi |
|---------|-------|-----------------|
| Chưa biết chọn trụ | §03 card 5 | `/trung-tam-dau-tu` → Zalo |
| Cần an tâm | §07 Cam kết | §10 CTA |

### 2.3. Card §03 — routing

| Card | Link |
|------|------|
| Lắp tại nhà | `/giai-phap#gia-dinh` |
| Mở trạm sạc | `/giai-phap#cafe` |
| Đầu tư kinh doanh | `/giai-phap#dau-tu` |
| Doanh nghiệp | `/giai-phap#doanh-nghiep` |
| **Tôi chưa biết chọn trụ nào** | `/trung-tam-dau-tu` |

---

## 3. Lý do từng Section

### §01 Hero — Inspirational

**Tone:** Truyền cảm hứng, tầm nhìn — **không quảng cáo, không bán hàng.**

| ✅ | ❌ |
|----|-----|
| Kiến tạo, tương lai, đồng hành | Giảm giá, ưu đãi, mua ngay |
| Ảnh lớn tĩnh — cảm xúc | Slider, banner sale |
| Sub 1–2 câu — ít chữ | Bullet spec trụ sạc |

**Copy chốt:**
- **H1:** Kiến tạo hạ tầng sạc xanh cho tương lai
- **Sub:** Hành trình đầu tư trạm sạc VinFast — có chuyên gia đồng hành từ ý tưởng đến vận hành.

---

### §02 KPI — Mock data (thiết kế sẵn)

**Vai trò:** Trust signal nhẹ — không phải quảng cáo số liệu phóng đại.

| Số (mock) | Nhãn |
|-----------|------|
| 50+ | Mô hình đầu tư đã tư vấn |
| 63 | Tỉnh thành hỗ trợ khảo sát |
| 6 | Bước triển khai minh bạch |
| 24/7 | Hỗ trợ kỹ thuật |

- Không animation đếm số
- Sprint 04+ thay bằng API khi có data thật

---

### §03 Tôi đang quan tâm

- **5 card** — thêm *“Tôi chưa biết chọn trụ nào”* → Investment Center
- Hiện **nhu cầu**, không hiện giải pháp dạng catalog
- **Không** từ “sản phẩm”

---

### §04 Tại sao chọn EVCS

4 lợi ích: Chính sách rõ ràng · Hỗ trợ khảo sát · Thi công toàn quốc · Đồng hành vận hành

---

### §05 Giải pháp

- Chỉ dùng từ **“Giải pháp”** — format `Use-case → Công suất`
- Không product grid, không giá, không CTA mua

---

### §06 Hành trình đầu tư

6 bước linear — giảm lo lắng, minh bạch quy trình

---

### §07 Cam kết của chúng tôi *(mới rev.2)*

**Vai trò:** Product Principle trên UI — “bán sự an tâm”.

| Cam kết đề xuất |
|-----------------|
| Minh bạch báo giá — không phí ẩn |
| Khảo sát thực tế trước khi tư vấn |
| Thi công đúng chuẩn VinFast |
| Đồng hành sau nghiệm thu |

Không cam kết ROI cụ thể — thuộc Trung tâm đầu tư.

---

### §08 Mô hình đầu tư (Case Study)

**Hiển thị theo mô hình đầu tư — không headline = tên dự án.**

| ✅ Headline | ❌ Headline |
|-------------|-------------|
| Cafe + trạm sạc công cộng | Trạm sạc ABC Hà Nội |
| Bãi xe kết hợp sạc nhanh | Dự án Vinhomes XYZ |

Cấu trúc card: **Mô hình** → Thách thức → Giải pháp → Kết quả → CTA  
Tên dự án (nếu có): caption phụ, không dominant.

---

### §09 Học viện EV

3 bài nổi bật — không gọi Blog

---

### §10 CTA cuối

**Headline chốt:** **Hãy để chuyên gia đồng hành cùng bạn**

- Sub: Trao đổi qua Zalo — miễn phí, không ràng buộc
- CTA primary: Nhận phương án đầu tư → Zalo
- Footnote: Gọi chuyên gia

---

### §11 Footer — Tối giản

```
[Logo EVCS]     Hotline · Zalo
© 2026 EVCS     Chính sách · Điều khoản
```

- 1 hàng brand + contact
- 1 hàng legal
- **Không** Shop · Seller · Marketplace · sitemap dài

---

## 4. Component List

| Component | Section | Sprint |
|-----------|---------|--------|
| `HomeHero` | §01 | 03A |
| `KpiBand` | §02 | 03A |
| `InterestGrid` / `InterestCard` ×5 | §03 | 03B |
| `TrustBenefits` | §04 | 03G |
| `SolutionStrip` / `SolutionRow` | §05 | 03C |
| `InvestmentTimeline` | §06 | 03D |
| `CommitmentSection` | §07 | 03H |
| `CaseStudyPreview` / `InvestmentModelTeaser` | §08 | 03E |
| `AcademyFeatured` | §09 | 03I |
| `HomeCtaBand` | §10 | 03F |
| `EvcsFooter` variant `minimal` | §11 | 03F |

**Không dùng:** ProductCard, ProductGrid, Carousel, Otofine components.

---

## 5. Motion Proposal

| Section | Motion |
|---------|--------|
| §01 Hero | Fade-up stagger |
| §02 KPI | Fade-in đồng loạt — **không** count-up |
| §03 Cards | Hover lift + scroll stagger |
| §06 Timeline | Line draw nhẹ |
| §10 CTA | Glow 1 lần on enter |

`prefers-reduced-motion`: tắt toàn bộ.

---

## 6. Image Proposal

| Vị trí | Ratio | Ghi chú |
|--------|-------|---------|
| §01 Hero | 4:3 | Ảnh cảm hứng — trạm sạc, ánh sáng xanh, không banner text |
| §08 Case | Không ảnh lớn | Text-first |
| §09 Academy | 16:9 | 3 bìa bài |

---

## 7. CTA Strategy

| Cấp | Copy | Hành động |
|-----|------|-----------|
| Primary | Nhận phương án đầu tư | Zalo |
| Secondary | Đặt lịch khảo sát | Zalo |
| Tertiary | Gọi chuyên gia | `tel:` |

**§10 headline:** Hãy để chuyên gia đồng hành cùng bạn

**Không dùng:** Mua ngay · Giỏ hàng · Thanh toán · “Xem sản phẩm”

---

## 8. Responsive Strategy

- Mobile-first, §03 5 cards: 2+2+1 hoặc scroll horizontal snap
- Card 5 full-width mobile — nhấn mạnh Investment Center path
- KPI 2×2 mobile
- Footer 1 cột mobile

---

## 9. SEO Strategy — Homepage

- Title: `Đầu tư trạm sạc VinFast | Tư vấn trọn gói — EVCS`
- H1 duy nhất §01
- Keyword tự nhiên: “giải pháp trạm sạc”, “đầu tư trạm sạc” — **không** “sản phẩm trạm sạc”
- Canonical: `https://tramsacvinfast.otofine.com/`

---

## 10. Sprint 03 — Chia nhỏ

**Không code toàn bộ Homepage một lần.**

Chi tiết: **[EVCS-SPRINT-03-PLAN.md](./EVCS-SPRINT-03-PLAN.md)**

| Sprint | Nội dung | Review trước merge |
|--------|----------|-------------------|
| **03A** | Hero + KPI | ✅ |
| **03B** | Interest (5 cards) | ✅ |
| **03G** | Tại sao chọn EVCS | ✅ |
| **03C** | Giải pháp | ✅ |
| **03D** | Hành trình | ✅ |
| **03H** | Cam kết | ✅ |
| **03E** | Case study (mô hình ĐT) | ✅ |
| **03I** | Học viện EV | ✅ |
| **03F** | CTA + Footer minimal | ✅ Final |

---

## Phụ lục A — Copy deck (rev.2)

### §01
- **H1:** Kiến tạo hạ tầng sạc xanh cho tương lai
- **Sub:** Hành trình đầu tư trạm sạc VinFast — có chuyên gia đồng hành từ ý tưởng đến vận hành.

### §03
- **H2:** Tôi đang quan tâm
- Card 5: **Tôi chưa biết chọn trụ nào**

### §05
- **H2:** Giải pháp theo quy mô *(không “Sản phẩm”)*

### §07
- **H2:** Cam kết của chúng tôi

### §08
- **H2:** Mô hình đầu tư thực tế

### §10
- **H2:** Hãy để chuyên gia đồng hành cùng bạn

---

## Phụ lục B — Revision log

| Rev | Date | Thay đổi |
|-----|------|----------|
| 1 | 2026-07-01 | Initial experience design |
| 2 | 2026-07-01 | Product Principle; cấm “sản phẩm”; Hero inspirational; KPI mock; 5 interest cards; Cam kết; case study theo mô hình ĐT; CTA/footer; Sprint 03 chia nhỏ |

---

*Sprint 02 rev.2 approved. Bắt đầu implementation tại **Sprint 03A** khi được chỉ đạo.*
