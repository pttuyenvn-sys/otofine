# HOME-FILTER-DEFERRED-APPLY-REGRESSION-AUDIT-01

**Date:** 2026-06-22  
**Mode:** Read-only regression audit — no code changes  
**Verifies:** `HOME-FILTER-DEFERRED-APPLY-01` (deferred vehicle quick-pick → single Apply navigation)

---

## Verdict

**1. Working as designed** ✓

Apply is **not broken**. Listing URL, H1, SEO surface, and product list all update **only after Áp dụng**. Draft picks update panel state and localStorage only.

One **cosmetic UX gap** (header eyebrow vs panel crumbs) is expected with deferred apply — not a functional regression.

---

## Methodology

| Layer | Approach |
|-------|----------|
| Static trace | `useVehicleQuickPanel.js`, `Home.jsx`, `useListingController.js` |
| Runtime E2E | Playwright on `http://127.0.0.1:3000` (headless) |
| Network | Classify `products-list`, `facet-categories`, `panel-models`, `panel-years`, `rsc` |

---

## State model (two layers)

| Layer | State | Updated when |
|-------|--------|--------------|
| **Draft** | `quickDraft` + panel breadcrumb chips | Brand / model / year pick |
| **Applied** | `brand`, `model`, `year` in `useListingController` | **Áp dụng**, **Xóa**, rail shortcuts, category/search navigation |

`navigateToState()` / `router.replace()` are only reachable from picks via **`onApply`** and **`resetQuickVehicle`** inside the quick panel — not from `handleQuickPickBrand` / `Model` / `Year` / breadcrumb steps.

---

## Test flow: Brand → Model → Year → Apply (homepage)

Playwright: `/` → Toyota → Vios → year → **Áp dụng**

### Before Apply (each pick)

| Signal | Expected | Observed |
|--------|----------|----------|
| **Draft state** (`quickDraft` / panel crumbs) | Updates each pick | `[]` → `["Toyota"]` → `["Toyota","Vios"]` → `["Toyota","Vios","2027"]` ✓ |
| **Applied state** (`brand`/`model`/`year`) | Unchanged | Unchanged (header eyebrow stayed `HÃNG XE / DÒNG XE / NĂM`) ✓ |
| **`navigateToState()`** | Not called on pick | Confirmed in source; no URL change ✓ |
| **`router.replace()`** | Not called | `pathname` stayed `/` through all picks ✓ |
| **`listingState.stateKey`** | Unchanged | No listing scroll / cascade during picks ✓ |
| **URL** | No change | `/` throughout picks ✓ |
| **H1** | No change | `Phụ tùng ô tô chính hãng giá tốt` throughout picks ✓ |
| **SEO entity / `document.title`** | No change | Homepage title unchanged ✓ |
| **Product list reload** | No `GET /api/products?brand=…` | **0** listing product requests during pick phase ✓ |
| **Nhóm B facets** | No reload | **0** `product-categories` during picks ✓ |

**Allowed during picks (picker only):**

| Request | When | Count |
|---------|------|------:|
| `GET /api/filter/models?brand=Toyota` | After brand pick | 1 |
| `GET /api/filter/years?brand=Toyota&model=Vios` | After model pick | 1 |

These do **not** update the product grid or slug URL.

### After Apply

| Signal | Expected | Observed |
|--------|----------|----------|
| **`navigateToState()`** | Called once | `onApply` → `navigateToState({ brand, model, year })` ✓ |
| **`router.replace()`** | Once | `/` → `/phu-tung-toyota-vios-2027` ✓ |
| **URL** | Vehicle slug | `/phu-tung-toyota-vios-2027` ✓ |
| **H1** | Vehicle-specific | `Phụ tùng Toyota Vios 2027` ✓ |
| **`document.title`** | Matches H1 | `Phụ tùng Toyota Vios 2027 \| Otofine` ✓ |
| **Header eyebrow** | Synced to applied | `Toyota / Vios / 2027` ✓ |
| **SEO entity** | Slug RSC + vehicle context | 5× `_rsc` requests on apply ✓ |
| **Product list** | Reload | 2× `products-list` (bootstrap + fetch) ✓ |
| **Nhóm B** | Reload | `facet-categories`, `facet-specs` on apply ✓ |

---

## Additional scenarios

### SEO slug page (`/phu-tung-toyota-vios`)

| Step | URL |
|------|-----|
| Load | `/phu-tung-toyota-vios` |
| Pick year (draft) | **Unchanged** `/phu-tung-toyota-vios` ✓ |
| Apply | `/phu-tung-toyota-vios-2027` ✓ |

Listing API requests during year pick on SEO page: **0**.

### Single-year pick (2014)

Panel year chips are **single years** (not range labels like `2014-2020`). Picking the `2014` chip then Apply → `/phu-tung-toyota-vios-2014`, H1 `Phụ tùng Toyota Vios 2014` ✓.

---

## Cosmetic UX gap (not a failure)

| UI region | During draft picks | After Apply |
|-----------|-------------------|-------------|
| Panel breadcrumb chips | Shows `quickDraft` | Synced ✓ |
| Left nav header eyebrow (`car-header__eyebrow`) | Shows **applied** `brand/model/year` | Updates ✓ |

While selecting Toyota → Vios on `/`, the panel shows draft crumbs but the header still reads `HÃNG XE / DÒNG XE / NĂM` until Apply. **Functional filters are correct**; only the header preview lags draft.

---

## Paths that still navigate immediately (by design)

Not regressions — documented exceptions from `HOME-FILTER-DEFERRED-APPLY-01`:

| Entry | Behavior |
|-------|----------|
| **Áp dụng** / mobile header **Áp dụng** | Deferred target — navigates once ✓ |
| **Xóa** (`resetQuickVehicle`) | Clears + navigates immediately |
| Left rail **Dòng xe phổ biến** (`applyVehicleQuickFilter`) | One-click shortcut — navigates immediately |
| Footer brand shortcuts | Same |
| Category / search / location picks | Unchanged — immediate `navigateToState` |

---

## Static code confirmation

```380:431:frontend/components/pages/home/hooks/useVehicleQuickPanel.js
  const handleQuickPickBrand = useCallback(
    (name) => {
      // setQuickDraft only — no navigateToState
    },
    [persistQuickVehicleDraft],
  );
  // handleQuickPickModel / handleQuickPickYear — same pattern
```

```306:334:frontend/components/pages/home/hooks/useVehicleQuickPanel.js
  const onApply = useCallback(() => {
    startTransition(() => {
      navigateToState({
        category: "",
        location,
        brand: quickDraft.brand || "",
        model: quickDraft.model || "",
        year: pickedYear,
      });
      setSeoData(null);
      setPage(1);
    });
    onApplyScroll?.();
    onAfterApply?.();
  }, [...]);
```

Product + facet effects in `Home.jsx` depend on applied `brand`/`model`/`year` — not `quickDraft`:

```639:678:frontend/components/pages/Home.jsx
  }, [category, brand, model, year, location, keyword]);
```

---

## Answers to audit questions

| # | Question | Answer |
|---|----------|--------|
| 1 | Working as designed? | **Yes** — core deferred-apply contract met |
| 2 | Apply broken? | **No** — Apply triggers navigation, H1, SEO slug, and product reload |
| 3 | State sync broken? | **No functionally** — applied listing state stays stable until Apply; **minor header preview lag** vs panel draft |

---

## Summary table

| Phase | Draft | Applied | URL | H1 | Products | Listing facets |
|-------|-------|---------|-----|----|-----------|----------------|
| Pick brand/model/year | ✓ updates | — frozen | — frozen | — frozen | — no reload | — no reload |
| Click Áp dụng | synced | ✓ updates | ✓ changes | ✓ changes | ✓ reload | ✓ reload |

**No code changes recommended from this audit.**
