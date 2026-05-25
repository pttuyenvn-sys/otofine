# UI/UX polish — `/shop/settings` storefront sections

Frontend-only visual hierarchy + usability polish. **No backend, API,
DB, sanitizer, upload pipeline, save flow, SEO logic, or routing was
touched.** Data bindings, slug generation, Tiptap engine, embed
parsers, CTA shortcuts, and the storefront preview renderer are all
the same components — only their containers, sizes, and labels changed.

## Files touched

| File | Kind of change |
| --- | --- |
| `frontend/components/pages/shop-settings/ShopSeoPreviewPanel.jsx` | Preview composer now emits `<slug>.otofine.com` host. Backend canonical/og:url/JSON-LD untouched (lives elsewhere). |
| `frontend/components/pages/ShopSettings.jsx` | Section C rebuilt as asymmetric `[150px_1fr]` grid (avatar 150 / cover hero-wide), mobile cover-first. Section D copy + nav labels polished. `ImageUploader` now accepts `maxWidth={null}` / `className` for the new layout. |
| `frontend/components/shopsite/ShopRichEditorWithPreview.jsx` | Full rewrite of the layout shell. Editor full-width with sticky aside preview at xl+, collapsible drawer below xl. |
| `frontend/components/shopsite/ShopRichEditor.css` | New `.shop-rich-editor--tall` variant — 480px canvas, 520px at xl+. Base 280px canvas (policy editors) unchanged. |

## Spec compliance

### 1) SEO preview URL → subdomain

`composePreview` now emits `host = "<slug>.otofine.com"` and
`url = "https://<slug>.otofine.com/"`. Applied uniformly to:

- Google SERP card (host chip, blue link host, breadcrumb)
- Facebook / Messenger / Zalo card (host chip)

The backend canonical, sitemap, `og:url`, and JSON-LD continue to
emit whichever URL the existing SEO logic computes (untouched here).
See `frontend/components/pages/shop-settings/ShopSeoPreviewPanel.jsx`
lines around `composePreview` for the inline comment explaining the
preview-only scope.

### 2) Branding section visual balance

Grid: `lg:grid-cols-[150px_minmax(0,1fr)] lg:items-start`.

- Avatar tile: `maxWidth={150}` + `aspect="1/1"` → 150×150 px square.
- Cover tile: `maxWidth={null}` (opt-out of legacy 260 px cap) +
  `aspect="16/6"` → fills remaining column, hero-wide.
- Mobile order: `order-1` on cover, `order-2` on avatar → cover
  first on phones, avatar below, mirroring the storefront header
  stacking on small screens.
- Click areas, file picker, `handleAvatarPick`, `handleCoverPick`,
  WebP pipeline, `aspect-ratio` props, validation `helperText`,
  spinner state — all preserved.

### 3 + 4) Intro section as primary, dominant editor

`xl:grid-cols-[minmax(0,1fr)_340px]` — editor takes `1fr`, preview
aside is a fixed-340 secondary column at ≥1280 px.

Below xl: single column. Editor first. A "Xem trước storefront" /
"Ẩn xem trước" toggle reveals a lightweight preview drawer directly
under the editor. Default state is collapsed so the editing canvas
isn't squeezed.

Editor canvas size via the new `.shop-rich-editor--tall` opt-in:

- ≥1280 px: `min-height: 520px`
- <1280 px: `min-height: 480px`
- Existing `.shop-rich-editor .ProseMirror` rule (280 px) stays as
  the default for every other consumer (policy editors etc.).

Toolbar stickiness is preserved (the underlying `ShopRichEditor`
already uses `sticky top-0 z-10` on its toolbar — no change needed).

Preview side panel:

- max-width 340 px
- subtle `bg-gray-50/60` + `backdrop-blur-sm`
- sticky `top-24`
- caps at `max-h-[70vh] overflow-y-auto` so long intros don't push
  the sticky save bar around

### 5) Copy polish

| Surface | Before | After |
| --- | --- | --- |
| Jump-nav chip | "Branding" | "Hình ảnh thương hiệu" |
| Jump-nav chip | "Giới thiệu" | "Giới thiệu doanh nghiệp" |
| Section C title | "C. Branding" | "C. Hình ảnh thương hiệu" |
| Section C subtitle | "Ảnh đại diện và ảnh bìa hiển thị trên trang storefront. …" | "Ảnh đại diện và ảnh bìa xuất hiện trên header của storefront. Tỉ lệ trong panel này phản ánh đúng tỉ lệ hiển thị thật cho khách hàng." |
| Section D title | "D. Giới thiệu" | "D. Giới thiệu doanh nghiệp" |
| Section D subtitle | "Nội dung xuất hiện trên trang storefront và trong danh sách Otofine." | "Trang giới thiệu là phần nội dung quan trọng nhất trên storefront — nơi shop thể hiện thương hiệu, năng lực và lý do để khách hàng tin chọn." |
| Section D bio label | "Giới thiệu ngắn (bio)" | "Mô tả ngắn (hiển thị dưới tên shop)" |
| Section D editor label | "Giới thiệu chi tiết (intro — storefront)" | "Nội dung hiển thị trên storefront" |

### 6) Responsive

| Breakpoint | Branding | Intro |
| --- | --- | --- |
| Desktop ≥1280 px | avatar 150 px + hero cover | editor 1fr + sticky aside 340 px |
| Tablet 1024–1279 px | avatar 150 px + hero cover (still side-by-side from lg breakpoint) | editor full width, preview collapsible below |
| Mobile <1024 px | cover first (full width), avatar below (150 px) | editor full width, preview collapsed behind toggle |

### 7) No regression

Preserved end-to-end (visually verified via Playwright + DOM probe
post-rebuild):

- Tiptap editor engine, all extensions
- Sanitizer contract (server-side, untouched)
- Storefront preview renderer (`ShopRichContentRenderer`) — same
  component used by the public storefront `/shops/<slug>/gioi-thieu`
- Image uploads (avatar / cover / inline editor) — WebP pipeline
  unchanged, click areas preserved
- CTA embeds + YouTube/TikTok/Facebook embed insertion
- SEO readiness scoring (`computeShopSeoReadiness`) — inputs and
  outputs identical
- Save flow + dirty-bit detection
- Existing data bindings (`basic.*`, `pub.*`, `extras.*`)
- Auto-slug generation
- Sticky save bar
- All storefront page contracts

## Visual verification

Screenshots (Playwright, headless Chromium, JWT-mocked seller
session, API forwarded to local backend) in
`audit/screenshots/shop-settings-uxpolish/`:

- `desktop-{full,seo,branding,intro}.png` — 1440×900 viewport
- `tablet-{full,seo,branding,intro}.png` — 1024×1200 viewport
- `mobile-{full,seo,branding,intro,intro-preview-open}.png` —
  414×900 viewport

DOM probe confirmed at desktop:

```json
{
  "pmComputed": "520px",
  "pmRectHeight": 520,
  "pmFontSize": "15.5px",
  "asideVisible": "block",
  "aside.height": 241
}
```

## Build

`npm run build` — clean. No new lint warnings.
