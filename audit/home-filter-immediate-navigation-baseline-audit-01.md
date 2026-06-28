# HOME-FILTER-IMMEDIATE-NAVIGATION-BASELINE-AUDIT-01

**Date:** 2026-06-22  
**Mode:** Read-only — no code changes  
**Context:** `HOME-FILTER-DEFERRED-APPLY-01` deferred vehicle picks to a single **Áp dụng** click. User feedback: previous immediate-per-step behavior felt faster and more natural.  
**Also considers:** `YEAR-RANGE-LINKS-DATASET-OPTIMIZATION-IMPLEMENT-01` (slug render no longer loads 8.9 MB sitemap-data).

---

## Executive summary

| Question | Answer |
|----------|--------|
| Did deferred apply improve **real-world** performance enough to justify UX change? | **Partially on paper, not in perceived UX.** |
| Is immediate navigation acceptable **after** recent optimizations? | **Yes** — post-opt immediate ~**1.8 s** user-visible vs pre-opt ~**7–10+ s**. |
| **Recommendation** | **OPTION C — Hybrid: restore immediate navigation per pick, keep optimized backend** (functionally a rollback of deferred apply with retained infra wins). |

Deferred apply saves ~**46%** of API/RSC wall-clock and ~**50%** of Playwright completion time, but it **defers all listing feedback** until an extra Apply click. With year-range-links optimization, the original reason to defer (multi-second slug renders) is largely gone.

---

## Scenarios measured

**Path:** Homepage → Toyota → Vios → 2020 → (Apply if deferred)

| Mode | Description |
|------|-------------|
| **A — Pre-deferred + pre year-range opt** | Historical baseline from `audit/home-filter-performance-regression-audit-01.md` |
| **B — Immediate (post-opt)** | Simulated: 3× `router.replace` / full slug navigation per pick |
| **C — Deferred (current)** | Panel picks + 1× Apply (live Playwright + API) |

Environment: `127.0.0.1:3000` / `127.0.0.1:5000`, PM2 production stack, 2026-06-22.

---

## Before/after timing table

### A. Historical — immediate navigation (pre-optimizations)

| Step | RSC (est.) | Listing cascade (est.) | Cumulative |
|------|------------|------------------------|------------|
| Pick Toyota | ~2.2–2.8 s | ~0.2–1.1 s | ~2.5–3.9 s |
| Pick Vios | ~2.2–2.8 s | ~0.2 s | ~5–7 s |
| Pick Year | ~2.2–2.8 s | ~0.2 s | **~7–10+ s** |

**Dominant cost:** `resolveListingYearRangeLinks` → full `sitemap-data` (~8.9 MB, ~2 s) on every slug render.

---

### B. Immediate navigation — **post year-range-links optimization** (measured)

#### API / RSC stack (warm)

| Step | RSC | Parallel listing cascade* | Per-step subtotal |
|------|-----|---------------------------|-------------------|
| Toyota | 102 ms | 142 ms | ~244 ms |
| Vios | 100 ms | 155 ms | ~255 ms |
| 2020 | 101 ms | 146 ms | ~247 ms |
| **3-step total** | **303 ms** | **442 ms** | **~745 ms** |

\*Parallel: `product-categories/canonical`, `products/locations`, `products`, `filter/models` / `years` / `specs` as applicable.

#### User-visible (Playwright, `goto` per slug until products paint)

| Step | Time to interactive listing |
|------|----------------------------|
| → `/phu-tung-toyota` | **725 ms** |
| → `/phu-tung-toyota-vios` | **523 ms** |
| → `/phu-tung-toyota-vios-2020` | **579 ms** |
| **Total from panel ready** | **1,827 ms** |

**First useful feedback (Toyota listing):** ~**725 ms** after brand pick.

#### Cold RSC (cache-busted)

| Step | RSC |
|------|-----|
| Toyota | 180 ms |
| Vios | 122 ms |
| 2020 | 121 ms |
| **Sum** | **422 ms** |

---

### C. Deferred apply — **current** (measured)

#### During picks (Toyota → Vios → 2020, before Apply)

| Signal | Result |
|--------|--------|
| URL | Stays `/` ✓ |
| H1 | Stays homepage H1 ✓ |
| `GET /api/products?brand=…` | **0** during picks (validated in `home-filter-deferred-apply-regression-audit-01`) |
| Panel APIs | `filter/models` ~5 ms + `filter/years` ~5 ms |

#### On Apply (single navigation)

| Component | Latency |
|-----------|---------|
| RSC → `/phu-tung-toyota-vios-2020` | 101–264 ms (warm–warm+) |
| Listing cascade | 122–146 ms |
| Panel picks (cumulative) | ~10 ms |

#### User-visible (Playwright)

| Phase | Duration |
|-------|----------|
| Picks only (no listing change) | **486 ms** |
| Apply → slug + products painted | **445 ms** |
| **Total panel-ready → final listing** | **931 ms** |

**First useful feedback:** only after Apply (~**931 ms**), still on homepage H1 during picks.

---

### Side-by-side summary (Toyota → Vios → 2020)

| Metric | A Pre-opt immediate | B Post-opt immediate | C Deferred (current) |
|--------|--------------------:|---------------------:|---------------------:|
| **Total user-visible** | ~7,000–10,000 ms | **1,827 ms** | **931 ms** |
| **API+RSC model total** | ~7,000+ ms | **745 ms** | **420 ms** |
| **Navigation events** | 3 | 3 | 1 |
| **Extra Apply click** | No | No | **Yes** |
| **Feedback after brand pick** | ~2.5 s | **~725 ms** | **None** (homepage until Apply) |
| **Slug RSC per step** | ~2,500 ms | **~100 ms** | **~100 ms** (once) |

**Deferred is ~49% faster to final state** (931 vs 1,827 ms Playwright), but **immediate gives progressive listing updates** after each step.

---

## Root-cause attribution (separate costs)

Costs apply **per slug navigation** unless noted.

| # | Cost driver | Pre-opt immediate | Post-opt immediate | Deferred |
|---|-------------|-------------------|--------------------|----------|
| **1** | **Navigation frequency** (3× vs 1×) | **3× full stacks** → main multiplier | 3× (~303 ms RSC + ~442 ms API) | 1× (~101 ms RSC + ~145 ms API) |
| **2** | **`[slug]/page.js` `force-dynamic`** | Every pick hits server render | Still true; **~100 ms/step warm** (was ~2.5 s) | Once on Apply |
| **3** | **`resolveListingYearRangeLinks` / dataset** | **~2,293 ms** `sitemap-data` fetch | **~13 ms** `year-range-links` (**−2,280 ms**) | Same savings on Apply |
| **4** | **Facet APIs** (Nhóm B) | ~140–310 ms / step (`categories` slowest) | ~142–155 ms / step | **Once** ~145 ms |
| **5** | **Product list API** | ~10–400 ms / step | Included in cascade ~145 ms/step | **Once** on Apply |
| **6** | **Panel picker APIs** | Same (models/years) | ~10 ms total | ~10 ms total |
| **7** | **Client hydration / paint** | Included in Playwright gap | ~1 s gap (745 ms model → 1827 ms UX) | ~0.5 s gap (420 ms → 931 ms) |

### Attribution conclusion

| Period | Primary bottleneck |
|--------|-------------------|
| **When deferred apply was justified** | Cost **#3** (8.9 MB sitemap) × cost **#1** (3× navigation) |
| **After year-range-links opt** | Cost **#3** largely removed; **#1** still matters but 3× ~100 ms RSC is tolerable |
| **Deferred benefit now** | Mostly avoiding 2 extra navigations (~570 ms API/RSC + ~900 ms UX) |

---

## Did deferred apply justify the UX change?

| Criterion | Assessment |
|-----------|------------|
| **Raw performance to final filter** | **Yes** — ~46% faster API/RSC; ~49% faster Playwright to final slug |
| **Perceived responsiveness** | **No** — user waits through picks with **no URL/H1/product change**, then must click Apply |
| **Progressive discovery** | **Worse** — immediate shows Toyota results in ~725 ms; deferred shows nothing until ~931 ms |
| **Post-optimization world** | Original pain (multi-second slug renders) **fixed independently** of deferred apply |

**Verdict:** Deferred apply was a **reasonable mitigation** before year-range-links optimization. It is **no longer necessary** for acceptable performance and **conflicts with stated user preference**.

---

## Would immediate navigation be acceptable after optimizations?

| Signal | Acceptable? |
|--------|-------------|
| 3-step total ~**1.8 s** user-visible | **Yes** (vs 7–10 s before) |
| Per-step ~**0.5–0.7 s** to updated listing | **Yes** for brand/model/year picks |
| Cold slug RSC ~**120–180 ms** | **Yes** |
| `categories` facet ~**140 ms**/step | Minor; unchanged by deferred apply |
| Extra Apply removed | **Improves** natural flow |

**Answer: Yes** — restoring immediate per-step navigation is performance-acceptable given current backend.

---

## Recommendation

### **OPTION C — Hybrid (recommended)**

**Restore immediate navigation on brand / model / year pick** (`navigateToState` in quick-pick handlers), **keep all backend optimizations**:

- `GET /api/seo/year-range-links` (~117 KB, ~13 ms)
- Redis/memory cache on year-range inventory
- `HOME-FILTER-DEFERRED-APPLY` panel UX improvements (Áp dụng can remain for mobile batch confirm **or** be removed if picks apply instantly)

This is effectively **rollback of deferred apply** while **retaining infra wins** that made immediate navigation viable again.

### OPTION A — Keep deferred apply

**Only if** product priority is minimizing total network/server work over UX. Saves ~**900 ms** to final state but adds Apply friction and hides feedback during selection. **Not aligned with user feedback.**

### OPTION B — Full rollback

Same as Option C functionally for pick handlers. No need to revert year-range-links or other SEO/image work.

---

## Expected user impact (Option C)

| Aspect | Impact |
|--------|--------|
| **Flow** | Toyota → instant Toyota listing; Vios → instant Vios listing; Year → instant year listing |
| **Clicks** | −1 Apply click per filter session |
| **Time to first relevant results** | ~**725 ms** after brand (vs ~**931 ms** at end of deferred flow) |
| **Time to complete 3-step filter** | ~**1.8 s** (vs ~**0.9 s** deferred) — user trades ~0.9 s for continuous feedback |
| **Perceived speed** | **Improves** — each click “does something” visible |
| **Server load** | +2 slug renders +2 listing cascades per full B→M→Y session (~+570 ms API/RSC warm) — acceptable post-opt |
| **Risk** | Low — measurements show slug path ~**100 ms** not ~**2.5 s** |

---

## Methodology notes

- **Immediate post-opt:** Playwright sequential `goto` to slug URLs (approximates 3× `router.replace` + hydration).
- **Deferred:** Live quick panel + Apply on `/` (from `home-filter-deferred-apply-regression-audit-01` methodology).
- **Historical pre-opt:** Prior audit measurements; not re-run (would require reverting code).
- **Warm vs cold:** Production PM2 warm; cold RSC uses cache-bust query params.

**No code changes made.**
