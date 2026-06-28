# MOBILE-RESTORE-PLAN-01 — Safe Restore Plan (Planning Only)

**Mode:** READ ONLY — no implementation, no git restore, no checkout  
**Date:** 2026-06-28  
**Baseline reference:** Git commit `28effe4` (`refactor: modularize Home.jsx orchestration rendering`) — last committed state **before** Mobile UX Phases 1–3B and Cleanup  
**Scope:** Mobile UX frontend only — do **not** rollback Discovery, SEO, Canonical, Sitemap, Shop SEO engine, or backend

---

## Executive summary

Mobile UX work (Phases 1, 2, 3B, Cleanup) touched **~20 frontend files**, but desktop filter regressions are concentrated in **Group B** shared files — especially the undocumented **`useVehicleQuickPanel` hook extraction** (Phase 1 era), **`LeftNav` desktop rewiring**, and **`PopularCategoriesSection` desktop extract** (Phase 2).

**Do not** wholesale-restore `Home.jsx` to `28effe4`: the current file also depends on post-baseline modularization (listing services, search suggest, section splits) that is unrelated to Mobile UX but lives in the same file.

**Recommended strategy:** **Surgical partial restore** of desktop vehicle/category paths from the pre–Phase 1 snapshot, while **keeping** mobile-only files (`MobileDrawers`, shop sheet helpers, mobile CSS) unless mobile UX must also roll back.

---

## Context: git vs working tree

| Fact | Implication |
|------|-------------|
| Mobile UX phases are **mostly uncommitted** on top of `28effe4` | `git checkout 28effe4 -- <file>` restores last commit, not “mid-modularization + pre-mobile” for new paths |
| New paths (`listing/`, `sections/`, `hooks/`, `shop/`) are **untracked** at commit time | Restoring = delete new files + patch `Home.jsx` imports |
| Large non-mobile work (Discovery, sitemap, listing identity, search) shares `Home.jsx` / `app/page.js` | Full `Home.jsx` restore **will** collateral-damage non-mobile features |

**Pre–Mobile UX vehicle/category behavior** (from `28effe4`):

- Vehicle quick state (`quickStep`, `quickDraft`, handlers) lived in **`Home.jsx`**
- `VehicleQuickPanel` was **presentational** (props in, events out)
- `LeftNav` received `renderVehiclePanelBody`, `quickDraft`, `goToAdvancedFromQuick`
- Categories: **`PopularCategoriesBox`** inline `<p>` links + `onCtaClick`
- Mobile drawers were **inline in `Home.jsx`** (`renderCategoryPanel`, `renderLeftQuickBlocks`)

---

## TASK 1 — Files modified by Mobile UX phases

Only files **named in phase docs** plus **one undocumented Phase 1 coupling** (`useVehicleQuickPanel.js`) confirmed by diff vs `28effe4`.

| File | First modified | Last modified | Purpose |
|------|----------------|---------------|---------|
| `frontend/components/pages/home/listing/PopularVehicleModelsSection.jsx` | Phase 1 | Phase 1 | Shared “Dòng xe phổ biến” (desktop rail + mobile sheet) |
| `frontend/components/pages/home/listing/LeftNav.jsx` | Phase 1 | Phase 2 | Desktop left rail; refactored from `home/LeftNav.jsx` |
| `frontend/components/pages/home/sections/MobileDrawers.jsx` | Phase 1 | Phase 3B | Mobile bottom sheets (Chọn xe, Danh mục, Shop, Hỏi giá) |
| `frontend/components/pages/Home.jsx` | Phase 1 | Cleanup | Orchestration: mobile state, callbacks, props, dead-code removal |
| `frontend/components/pages/Home.css` | Phase 1 | Cleanup | Mobile sheet styles; Cleanup removed legacy drawer CSS |
| `frontend/components/pages/home/VehicleQuickPanel.jsx` | Phase 1* | Phase 1* | Refactored to call `useVehicleQuickPanel` (*not in Phase 1 doc*) |
| `frontend/components/pages/home/hooks/useVehicleQuickPanel.js` | Phase 1* | Phase 1* | Extracted vehicle quick state/handlers from `Home.jsx` (*new, untracked*) |
| `frontend/components/pages/home/hooks/usePersistedOpen.js` | Pre-Phase 1 modularization | Phase 1 | SessionStorage sync for `mobileFilter` (used by mobile sheet) |
| `frontend/components/pages/home/listing/PopularCategoriesSection.jsx` | Phase 2 | Phase 2 | Shared “Danh mục phổ biến” (desktop chips + mobile list) |
| `frontend/components/pages/home/listing/PopularCategoriesBox.jsx` | Phase 2 | Phase 2 | Re-export shim → `PopularCategoriesSection` |
| `frontend/components/pages/home/PopularCategoriesBox.jsx` | — | Phase 2 | **Deleted** (moved/replaced by listing shim) |
| `frontend/components/pages/home/LeftNav.jsx` | — | Phase 1 | **Deleted** (replaced by `listing/LeftNav.jsx`) |
| `frontend/components/pages/home/sections/ShopRecommendSection.jsx` | Phase 3B | Phase 3B | Shared shop recommend fetch + UI (desktop rail + mobile sheet) |
| `frontend/components/pages/home/sections/ShopRecommendRail.jsx` | Phase 3B | Cleanup | Re-export shim; **deleted** in Cleanup |
| `frontend/components/pages/home/shop/mapMarketplaceToShopDirectoryParams.js` | Phase 3B | Phase 3B | Map marketplace brand/location → shop directory query |
| `frontend/components/pages/home/shop/buildShopDirectoryFetchUrl.js` | Phase 3B | Phase 3B | Build `GET /api/public/shops` URL |
| `frontend/components/pages/home/sections/MobileShopSellerSection.jsx` | Phase 3B | Phase 3B | Guest/seller footer inside mobile Shop sheet |
| `frontend/components/pages/home/sections/RightRail.jsx` | Phase 3B | Phase 3B | Desktop right rail; shop block switched to `ShopRecommendSection` |
| `frontend/components/pages/home/HomeSearch.jsx` | — | Cleanup | Removed unused props (drawer/search legacy wiring) |
| `frontend/components/pages/home/header/HomeHeader.jsx` | — | Cleanup | Removed unused `onOpenFilter` / `onOpenMenu` (mobile header; were already unused in JSX) |

**Not Mobile UX scope (do not include in restore):** `components/discovery/*`, `lib/discovery/*`, `lib/listing/*`, `lib/seo/sitemap/*`, `app/sitemap*.xml/*`, `app/[slug]/page.js`, shop SEO modules, search refactor beyond Cleanup prop trim, etc.

---

## TASK 2 — Classification

### Group A — Safe to restore / remove completely (mobile-only surface)

These files are **not required for desktop** at `28effe4` behavior. Removing or reverting them does not restore desktop filters by itself but is safe for Discovery/SEO/sitemap.

| File | Notes |
|------|-------|
| `sections/MobileDrawers.jsx` | All mobile sheets; at baseline, equivalent JSX was inline in `Home.jsx` |
| `sections/MobileShopSellerSection.jsx` | Mobile Shop sheet footer only |
| `listing/PopularCategoriesBox.jsx` | Shim only; safe to replace with real component |
| `sections/ShopRecommendRail.jsx` | Already deleted (Cleanup); no restore needed |
| Mobile-only **CSS blocks** in `Home.css` | e.g. `.of-rail-links--mobile`, `.mobile-shop-sheet-footer`, `.of-rail-cats--mobile`, vehicle sheet popular-models mobile rules |
| `hooks/usePersistedOpen.js` | Mobile sheet persistence only; baseline used inline sessionStorage in `Home.jsx` |

**Caution:** Group A files can be dropped independently, but **desktop will not match pre-Mobile UX** until Group B desktop paths are fixed.

### Group B — Shared desktop + mobile logic (partial restore only)

| File | Desktop impact | Mobile impact |
|------|----------------|---------------|
| `Home.jsx` | Vehicle/category callbacks, `LeftNav`/`RightRail`/`MobileDrawers` props, bottom nav, `vehicleQuickPanelProps`, `shopDirectoryContext` | All sheet open state and mobile wrappers |
| `Home.css` | Some `.car-left`, `.popular-cats*`, `.of-rail-*` rules shared | `.mobile-drawer`, sheet bodies, bottom nav |
| `listing/LeftNav.jsx` | Vehicle panel mount, category rail, popular models | N/A (hidden on mobile via CSS) |
| `VehicleQuickPanel.jsx` | Desktop panel inside `LeftNav` | Same component in mobile sheet |
| `hooks/useVehicleQuickPanel.js` | **Desktop filter regression hotspot** | Same hook in mobile sheet |
| `listing/PopularVehicleModelsSection.jsx` | Desktop “Dòng xe phổ biến” markup | Mobile block list in sheet |
| `listing/PopularCategoriesSection.jsx` | Desktop category chips | Mobile category list in sheet |
| `sections/ShopRecommendSection.jsx` | Desktop “SHOP PHÙ HỢP” rail | Mobile shop list |
| `shop/mapMarketplaceToShopDirectoryParams.js` | Desktop `RightRail` context | Mobile shop sheet title/query |
| `shop/buildShopDirectoryFetchUrl.js` | Desktop fetch | Mobile fetch (shared cache key) |
| `sections/RightRail.jsx` | Entire desktop right column | N/A |
| `HomeSearch.jsx` | Cleanup removed unused props only | Same |
| `header/HomeHeader.jsx` | Cleanup removed dead mobile props | Same |

---

## TASK 3 — Impact if restored to pre–Mobile UX state

Legend: **YES** = restoring this file (fully to `28effe4` or deleting post-mobile version) would affect the area; **NO** = no meaningful impact.

| File | Discovery | SEO | Canonical | Product URLs | Sitemap | Shop SEO | Homepage discovery |
|------|-----------|-----|-----------|--------------|---------|----------|-------------------|
| `PopularVehicleModelsSection.jsx` | NO | NO | NO | NO | NO | NO | NO |
| `PopularCategoriesSection.jsx` | NO | NO | NO | NO | NO | NO | NO |
| `PopularCategoriesBox.jsx` (shim) | NO | NO | NO | NO | NO | NO | NO |
| `MobileDrawers.jsx` | NO | NO | NO | NO | NO | NO | NO |
| `MobileShopSellerSection.jsx` | NO | NO | NO | NO | NO | NO | NO |
| `ShopRecommendSection.jsx` | NO | NO | NO | NO | NO | NO | NO |
| `mapMarketplaceToShopDirectoryParams.js` | NO | NO | NO | NO | NO | NO | NO |
| `buildShopDirectoryFetchUrl.js` | NO | NO | NO | NO | NO | NO | NO |
| `ShopRecommendRail.jsx` (deleted) | NO | NO | NO | NO | NO | NO | NO |
| `useVehicleQuickPanel.js` | NO | NO | NO | NO | NO | NO | NO |
| `usePersistedOpen.js` | NO | NO | NO | NO | NO | NO | NO |
| `VehicleQuickPanel.jsx` | NO | NO | NO | NO | NO | NO | NO |
| `listing/LeftNav.jsx` | NO | NO | NO | NO | NO | NO | NO |
| `RightRail.jsx` | NO | NO | NO | NO | NO | NO | NO |
| `HomeSearch.jsx` (Cleanup-only delta) | NO | NO | NO | NO | NO | NO | NO |
| `header/HomeHeader.jsx` (Cleanup-only delta) | NO | NO | NO | NO | NO | NO | NO |
| `Home.css` (full restore to `28effe4`) | NO | NO | NO | NO | NO | NO | NO |
| **`Home.jsx` (full restore to `28effe4`)** | **NO*** | **YES** | **NO** | **NO** | **NO** | **NO** | **NO*** |

\* **Homepage discovery** (`HomeDiscoveryNav` in `app/page.js`) is **outside** `Home.jsx` — full `Home.jsx` restore does **not** revert Discovery nav.  
\* **SEO:** full `Home.jsx` restore **would** revert in-page SEO composition wiring (e.g. `SeoContent` import path, `finalArticle`, dynamic SEO helpers) that changed during broader modularization — **avoid full restore**.

**Summary:** Mobile UX files alone do **not** touch Discovery, Canonical, Product URLs, Sitemap, or Shop SEO modules. Risk is **collateral** only if restoring entire `Home.jsx` / `[slug]/page.js` / listing libs.

---

## TASK 4 — Safe restore order

Each step: implement → `npm run build` → desktop smoke (vehicle chip, category chip, search submit) → mobile smoke (optional).

### Step 0 — Freeze reference (no code change)

- Export patch snapshots: `git show 28effe4:frontend/components/pages/Home.jsx` (vehicle block ~L500–L1850, `LeftNav`, `PopularCategoriesBox`, inline mobile drawers ~L2650+)
- Tag current HEAD for rollback of the restore attempt

### Step 1 — Desktop vehicle path (highest priority)

**Target (Group B, partial):**

- `VehicleQuickPanel.jsx` → presentational API (`quickStep`, `quickDraft`, `onPickBrand`, …)
- Remove `useVehicleQuickPanel.js` from render path
- `Home.jsx` → restore inline `quickStep` / `quickDraft` / handlers / `renderVehiclePanelBody()` from `28effe4`
- `listing/LeftNav.jsx` → restore props: `renderVehiclePanelBody`, `quickDraft`, `goToAdvancedFromQuick`; remove `vehicleQuickPanelProps` / `advancedControlRef` indirection

**Keep:** `MobileDrawers` may still call `renderVehiclePanelBody()` or shared panel once desktop path is fixed.

→ **Build** → **Smoke:** desktop Toyota chip & panel pick → URL + `/api/products?brand=` within 500ms

### Step 2 — Desktop category path

**Target (Group B, partial):**

- `listing/LeftNav.jsx` → use **`PopularCategoriesBox`** markup from `28effe4` (`onCtaClick`, `selectedCategory === name`)
- Option A: restore `home/PopularCategoriesBox.jsx` content (delete listing shim)
- Option B: keep `PopularCategoriesSection` but fix desktop `isActive` to compare **canonical name** (not slug only)
- `Home.jsx` → verify `handlePopularCategoryClick` unchanged; consider moving `navigateToState` **outside** `startTransition` for category (forward-fix; optional in restore)

→ **Build** → **Smoke:** desktop category pill → URL `/ma-phanh-truoc-o-to` within 500ms + product API `category=` param

### Step 3 — `PopularVehicleModelsSection` desktop parity (if Step 1 incomplete)

**Target:** Either restore inline popular-models block from `28effe4` `LeftNav`, or keep component with `variant="desktop"` verified identical.

→ **Build** → **Smoke:** desktop popular model link → same URL as Step 1 vehicle filter

### Step 4 — Mobile sheets only (Group A, optional rollback)

**Target:**

- Revert `MobileDrawers.jsx` to Phase 1-only (drop category + shop sheets) **OR**
- Re-inline drawer JSX from `28effe4` into `Home.jsx` and delete `MobileDrawers.jsx`
- Revert bottom nav: **Cẩm nang** scroll vs **Danh mục** sheet; Shop → `/shop/login`

→ **Build** → **Smoke:** mobile sheets open/close; **desktop unchanged**

### Step 5 — Phase 3B shop (desktop + mobile)

**Only if shop rail/sheet regressed** (not required for vehicle/category filter restore):

- `RightRail.jsx` → restore shop block to pre–`ShopRecommendSection` inline rail (if existed in modularization branch)
- Or keep `ShopRecommendSection` (desktop visual parity per Phase 3B doc)

→ **Build** → **Smoke:** desktop “SHOP PHÙ HỢP”; mobile Shop sheet

### Step 6 — Cleanup reversal (lowest priority)

**Only if evidence of regression from Cleanup** (unlikely for desktop filters):

- Do **not** restore `renderCategoryPanel`, `renderLeftQuickBlocks`, `filteredCategories` props — mobile-only dead code
- Do **not** restore `HomeHeader` `onOpenFilter` / `onOpenMenu` — unused at baseline
- Do **not** restore `HomeSearch` legacy drawer props — search refactor unrelated

→ **Build** → full regression checklist

---

## TASK 5 — Risk per step

| Step | Focus | Risk | Rationale |
|------|-------|------|-----------|
| 0 | Reference snapshot | **Low** | Read-only |
| 1 | Vehicle desktop path | **High** | Touches `Home.jsx` + panel hook; fixes primary regression but merge conflicts with modularization |
| 2 | Category desktop path | **Medium** | Smaller surface; handler already pre-mobile; markup/active-state fix |
| 3 | Popular models extract | **Low** | Isolated component; desktop-only markup |
| 4 | Mobile sheets rollback | **Low** (desktop) / **Medium** (mobile) | Desktop unaffected; loses Phase 2/3B mobile UX |
| 5 | Shop Phase 3B | **Medium** | Shared fetch/helpers; desktop rail visual change if reverted |
| 6 | Cleanup reversal | **High** | Re-introduces dead code; no filter benefit |

**Full-file `git checkout 28effe4 -- Home.jsx`:** **High** — rolls back listing identity egress, search suggest wiring, section imports, and SEO render paths beyond Mobile UX.

---

## TASK 6 — Minimum restore set (desktop only)

Goal: **Desktop identical to pre–Mobile UX** for **Chọn xe** + **Danh mục** filters, **without** rolling back mobile sheets or Discovery/SEO.

### Minimum files to touch (partial restore / forward-fix hybrid)

| Priority | File | Action |
|----------|------|--------|
| P0 | `hooks/useVehicleQuickPanel.js` | **Bypass for desktop** — restore handlers to `Home.jsx`; stop using hook from desktop `LeftNav` path |
| P0 | `VehicleQuickPanel.jsx` | Restore presentational contract from `28effe4` |
| P0 | `Home.jsx` | Partial: vehicle state/handlers + `renderVehiclePanelBody`; keep mobile sheet wiring |
| P0 | `listing/LeftNav.jsx` | Restore desktop props (`renderVehiclePanelBody`, `quickDraft`, `goToAdvancedFromQuick`) |
| P1 | `listing/PopularCategoriesSection.jsx` **or** `PopularCategoriesBox` | Restore desktop chip markup + `selectedCategory === name` |
| P1 | `Home.jsx` | Optional: call `navigateToState` outside `startTransition` in `handlePopularCategoryClick` (latency fix) |

### Explicitly **do not** restore (unnecessary for desktop filters)

| File | Reason |
|------|--------|
| `MobileDrawers.jsx` | Mobile-only; not on desktop filter path |
| `MobileShopSellerSection.jsx` | Mobile-only |
| `ShopRecommendSection.jsx` + shop helpers | Desktop shop rail; unrelated to filter regression |
| `RightRail.jsx` | Unless shop rail broken |
| `HomeSearch.jsx` | Cleanup-only prop trim |
| `header/HomeHeader.jsx` | Cleanup-only dead props |
| `Home.css` (full) | Partial mobile CSS removal sufficient |
| Cleanup-removed symbols (`renderCategoryPanel`, `filteredCategories`, etc.) | Dead after Phase 2; not used by desktop |

### Optional delete (mobile UX off switch, not needed for desktop)

- `sections/MobileDrawers.jsx` + mobile bottom-nav handlers in `Home.jsx` — only if product owner wants full mobile UX rollback

---

## Recommended approach vs blind restore

| Approach | Pros | Cons |
|----------|------|------|
| **Surgical partial restore** (recommended) | Fixes desktop; keeps Phase 2/3B mobile UX; no Discovery/SEO touch | Requires careful merge in `Home.jsx` |
| **Full git restore of Mobile UX file list** | Fast | Breaks modularization; `Home.jsx` collateral damage |
| **Forward fix without restore** | Smallest diff | Not a “restore”; e.g. fix hook sync, category `isActive`, `startTransition` latency |

For **desktop filter regressions**, evidence points to **Phase 1 hook extraction + LeftNav rewiring** (vehicle) and **Phase 2 category extract + transition latency** (category) — not Cleanup removals.

---

## Smoke test checklist (after each step)

### Desktop (1280px)

- [ ] Click Toyota in vehicle panel → `/phu-tung-toyota` within **≤500ms**
- [ ] Click “Má Phanh Trước” category → `/ma-phanh-truoc-o-to` within **≤500ms**
- [ ] Product API includes `brand=` / `category=` on first fetch after click
- [ ] Search suggest submit unchanged
- [ ] Right rail shop block renders (if not reverted)

### Mobile (375px) — if sheets kept

- [ ] Bottom nav: Chọn xe, Danh mục, Shop sheets open
- [ ] Category/vehicle selection closes sheet + same URL as desktop

### Non-regression (must stay unchanged)

- [ ] `HomeDiscoveryNav` / category discovery pages
- [ ] `/sitemap.xml` and partitioned sitemaps
- [ ] Product detail URLs / canonical tags
- [ ] Shop subdomain SEO routes

---

## Planning constraints honored

- No source modifications  
- No git restore / checkout executed  
- Discovery, SEO, Canonical, Sitemap, Shop SEO backend excluded from restore scope  
- Minimum set optimized for **desktop filter parity**, not full mobile UX rollback  

**Next step (when approved):** implement Step 1 partial restore in a dedicated fix task — not this document.
