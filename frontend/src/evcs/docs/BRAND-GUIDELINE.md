# EVCS Brand Guideline

**Phiên bản:** 1.0 (Sprint 01)  
**Phạm vi:** Design System độc lập — không dùng UI Marketplace Otofine

---

## 1. Logo

| Thuộc tính | Quy định |
|------------|----------|
| **Component** | `@evcs/components/primitives` → `Logo` |
| **Mark** | SVG vuông bo góc 10px, chữ E + chấm electric |
| **Màu mark** | Nền `--evcs-color-primary`, glyph trắng, chấm `--evcs-color-electric` |
| **Wordmark** | `EVCS` — Outfit Semibold |
| **Kích thước** | `sm` (header), `md` (default), `lg` (hero) |
| **Clear space** | Tối thiểu ½ chiều cao logo xung quanh |
| **Không** | Logo Otofine, icon shop, product badge |

---

## 2. Color

### Primary palette

| Token | Hex | Dùng cho |
|-------|-----|----------|
| `--evcs-color-primary` | `#0d4f3c` | CTA chính, heading accent |
| `--evcs-color-primary-hover` | `#0a3d2e` | Hover state |
| `--evcs-color-accent` | `#00c896` | Electric green, badge, link |
| `--evcs-color-electric` | `#00e5a8` | Highlight, glow, footer link |
| `--evcs-color-bg-dark` | `#0a1f17` | Footer, dark hero |

### Surface

| Token | Dùng cho |
|-------|----------|
| `--evcs-color-bg` | Page background |
| `--evcs-color-bg-elevated` | Card nền trắng |
| `--evcs-color-bg-muted` | Section xen kẽ |
| `--evcs-color-primary-light` | Tint xanh nhạt |

### Text

| Token | Dùng cho |
|-------|----------|
| `--evcs-color-text` | Body chính |
| `--evcs-color-text-secondary` | Mô tả |
| `--evcs-color-text-muted` | Caption, placeholder |
| `--evcs-color-text-inverse` | Trên nền tối |

---

## 3. Typography

| Vai trò | Font | Token |
|---------|------|-------|
| **Display / Heading** | Outfit | `--evcs-font-display` |
| **Body / UI** | DM Sans | `--evcs-font-sans` |

### Scale

| Class | Size |
|-------|------|
| `.evcs-heading-1` | clamp 2.25rem → 3.75rem |
| `.evcs-heading-2` | clamp 1.875rem → 3rem |
| `.evcs-heading-3` | 1.5rem |
| `.evcs-body-lg` | 1.125rem |
| `.evcs-body` | 1rem |
| `.evcs-caption` | 0.875rem |
| `.evcs-eyebrow` | 0.75rem, uppercase, tracking wide |

**Ngôn ngữ UI:** Toàn bộ menu và nhãn hiển thị **tiếng Việt**.

---

## 4. Spacing

Base unit: **4px**

| Token | Value |
|-------|-------|
| `--evcs-space-4` | 1rem (16px) |
| `--evcs-space-6` | 1.5rem |
| `--evcs-space-8` | 2rem |
| `--evcs-space-16` | 4rem — section mobile |
| `--evcs-space-24` | 6rem — section desktop |

| Layout | Value |
|--------|-------|
| `--evcs-container-max` | 76rem (1216px) |
| `--evcs-container-narrow` | 48rem |
| `--evcs-header-height` | 4.5rem |

---

## 5. Radius

| Token | Value | Dùng cho |
|-------|-------|----------|
| `--evcs-radius-sm` | 6px | Input nhỏ |
| `--evcs-radius-md` | 10px | Nav link hover |
| `--evcs-radius-lg` | 16px | Placeholder |
| `--evcs-radius-xl` | 20px | Card |
| `--evcs-radius-2xl` | 24px | Hero visual |
| `--evcs-radius-full` | 9999px | Button, badge |

---

## 6. Shadow

| Token | Dùng cho |
|-------|----------|
| `--evcs-shadow-xs` | Card idle |
| `--evcs-shadow-sm` | Button, header |
| `--evcs-shadow-md` | Card hover |
| `--evcs-shadow-lg` | Modal (tương lai) |
| `--evcs-shadow-xl` | Hero visual |
| `--evcs-shadow-glow` | CTA accent hover |
| `--evcs-shadow-inner` | Glass card inset |

---

## 7. Motion

| Token | Value |
|-------|-------|
| `--evcs-duration-fast` | 150ms |
| `--evcs-duration-normal` | 250ms |
| `--evcs-duration-slow` | 400ms |
| `--evcs-ease-default` | cubic-bezier(0.4, 0, 0.2, 1) |
| `--evcs-ease-out` | cubic-bezier(0, 0, 0.2, 1) |

### Patterns

- **Fade-in:** `.evcs-animate-in` — translateY 12px → 0, opacity 0 → 1
- **Button press:** `scale(0.98)` on `:active`
- **Không** dùng animation nặng, parallax, auto-play video

---

## 8. Glass

| Token | Value |
|-------|-------|
| `--evcs-glass-bg` | `rgba(247, 250, 248, 0.72)` |
| `--evcs-glass-border` | `rgba(255, 255, 255, 0.45)` |
| `--evcs-glass-blur` | `16px` |

**Áp dụng:** Header sticky, `.evcs-card--glass`, case study blocks

---

## 9. Gradient

| Token | Dùng cho |
|-------|----------|
| `--evcs-gradient-hero` | Hero visual, dark sections |
| `--evcs-gradient-accent` | Primary button |
| `--evcs-gradient-soft` | Page hero gradient variant |
| `--evcs-gradient-glow` | Decorative glow orb |

---

## 10. Image Ratio

| Token | Ratio | Dùng cho |
|-------|-------|----------|
| `--evcs-ratio-hero` | 16:9 | Hero banner |
| `--evcs-ratio-card` | 4:3 | Card thumbnail |
| `--evcs-ratio-portrait` | 3:4 | Case study portrait |
| `--evcs-ratio-square` | 1:1 | Avatar, icon block |
| `--evcs-ratio-wide` | 21:9 | Cinematic strip |

**Utility class:** `.evcs-media--hero`, `.evcs-media--card`, `.evcs-media--square`

**Dự án:** Case study — **không** dùng gallery grid ảnh. Ưu tiên cấu trúc nội dung + metrics.

---

## 11. CTA (Conversion layer)

4 CTA duy nhất — component `@evcs/components/conversion/CtaButton`:

| Variant | Nhãn tiếng Việt |
|---------|----------------|
| `quote` | Nhận báo giá |
| `consult` | Tư vấn đầu tư |
| `survey` | Đặt lịch khảo sát |
| `hotline` | Gọi Hotline |

---

## 12. Kiến trúc URL

| Public (EVCS host) | Internal (Next.js) |
|--------------------|-------------------|
| `/` | `/evcs` |
| `/giai-phap` | `/evcs/giai-phap` |
| `/trung-tam-dau-tu` | `/evcs/trung-tam-dau-tu` |
| `/hoc-vien-ev` | `/evcs/hoc-vien-ev` |
| `/du-an` | `/evcs/du-an` |
| `/lien-he` | `/evcs/lien-he` |
| `/ban-do-tram-sac` | `/evcs/ban-do-tram-sac` |

Host: `tramsacvinfast.otofine.com` (middleware rewrite)

---

*Tài liệu này là nguồn truth cho Design System EVCS. Mọi component mới phải tuân thủ tokens trong `src/evcs/styles/tokens.css`.*
