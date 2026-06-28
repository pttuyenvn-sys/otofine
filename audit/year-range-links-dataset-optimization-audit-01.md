# YEAR-RANGE-LINKS-DATASET-OPTIMIZATION-AUDIT-01

**Date:** 2026-06-22  
**Mode:** Read-only — no code changes, no implementation  
**Consumer:** `resolveListingYearRangeLinks()` → `fetchSitemapInventory()` → `GET /api/seo/sitemap-data`  
**Related:** `audit/home-filter-performance-regression-audit-01.md` (slug RSC ~2.2–2.8 s; sitemap fetch ~2 s)

---

## Executive summary

`resolveListingYearRangeLinks` loads the **entire** `sitemap-data` blob (~**8.5 MB**, ~**2.1 s** fetch + ~**122 ms** parse) but uses **only two arrays** (`bmyRangeListings`, `cbmyRangeListings`) totaling **~893 KB** (**10.0%** of payload). After governance filtering and field trimming, the **minimal useful dataset is ~117 KB** (**98.7%** smaller than today).

A dedicated `GET /api/seo/year-range-links` (static slim inventory or per-query resolved links) would cut slug-server work by an estimated **~1.7–2.0 s** per render and **~8.6 MB** transient heap per request.

---

## 1. Total `sitemap-data` payload size

Measured on production stack (`127.0.0.1:5000`, 2026-06-22):

| Metric | Value |
|--------|-------|
| **Raw bytes** | **8,911,374** (~8.50 MiB) |
| **Fetch time** | **2,134 ms** (warm backend) |
| **JSON parse** | **123 ms** |
| **Top-level keys** | 15 |
| **Products in blob** | 7,385 |

### Section breakdown (by serialized size)

| Section | Bytes | % of total | Used by year-range builder? |
|---------|------:|----------:|----------------------------|
| `products` | 3,149,249 | 35.3% | **No** |
| `categoryBrandVehicleLocationListings` | 1,689,329 | 19.0% | **No** |
| `categoryBrandVehicleYearRangeLocationListings` | 1,093,000 | 12.3% | **No** *(location contextual)* |
| `categoryBrandLocationListings` | 906,532 | 10.2% | **No** |
| **`cbmyRangeListings`** | **880,430** | **9.9%** | **Yes** |
| `categoryBrandListings` | 529,867 | 5.9% | **No** |
| `governanceInventory` | 277,941 | 3.1% | **No** |
| `brandVehicleYearRangeLocationListings` | 144,978 | 1.6% | **No** *(location contextual)* |
| `partNames` | 80,109 | 0.9% | **No** |
| `cbmListings` | 71,865 | 0.8% | **No** |
| `brandVehicleLocationListings` | 42,710 | 0.5% | **No** |
| `bmyListings` | 19,791 | 0.2% | **No** |
| **`bmyRangeListings`** | **12,912** | **0.1%** | **Yes** |
| `brandModels` | 8,576 | 0.1% | **No** |
| `brandLocationListings` | 3,705 | 0.0% | **No** |

**Year-range arrays combined:** **893,342 bytes** (**10.02%** of payload).

---

## 2. Fields actually used by year-range builder

Source: `frontend/lib/seo/buildListingYearRangeLinks.server.js`

### Inventory consumed

| Namespace | Array | Row count (live) | Purpose |
|-----------|-------|------------------|---------|
| **BMY_RANGE** | `bmyRangeListings` | 106 | Vehicle listing pages (`entity.kind === "vehicle"`) |
| **CBMY_RANGE** | `cbmyRangeListings` | 3,665 | Category+BMY listing pages (`entity.kind === "category"` + `isCbmy`) |

### Fields read per row

| Namespace | Fields used | Output |
|-----------|-------------|--------|
| **BMY_RANGE** | `slug`, `brand`, `model`, `yearFrom`, `yearTo`, `productCount` | Sibling links `{ href: /${slug}, label: yearFrom–yearTo }` |
| **CBMY_RANGE** | `slug`, `categorySlug`, `brand`, `model`, `yearFrom`, `yearTo`, `productCount` | Same, filtered by `categorySlug` core |

**Governance gates** (in-memory, not separate API fields):

| Namespace | Gate function | `productCount` threshold |
|-----------|---------------|--------------------------|
| BMY_RANGE | `gateVehicleYearRangeEntry` | **≥ 10** |
| CBMY_RANGE | `gateCategoryBrandVehicleYearRangeEntry` | **≥ 2** |

Live pass counts: **106 / 106** BMY rows pass; **651 / 3,665** CBMY rows pass (3,014 rows have `productCount === 1` and are filtered out at render time).

### Parent links — **not** in sitemap-data

Phase-02 parent rows are **computed locally**:

| Page type | Parent link builder | Data source |
|-----------|---------------------|-------------|
| BMY range page | `parentBmyLink(brand, model)` | `buildVehicleOwnerPath` |
| CBMY range page | `parentCbmyLink(meta)` | `buildCategoryOwnerPathFromState` + `categoryMeta` |

No sitemap inventory row is required for parent links.

### Sibling links

Filtered in-memory from `bmyRangeListings` / `cbmyRangeListings` by `brand`, `model`, (`categorySlug` for CBMY), optional `excludeYear`, then capped at **24** (`LISTING_YEAR_RANGE_LIMITS`).

### Year-range contextual / location links — **not** used

These sitemap sections exist but are **not** read by `resolveListingYearRangeLinks`:

| Section | Bytes | Notes |
|---------|------:|-------|
| `brandVehicleYearRangeLocationListings` | 144,978 | BMY range + city |
| `categoryBrandVehicleYearRangeLocationListings` | 1,093,000 | CBMY range + city |

Shop crawl link graphs (`projectShopSeoCrawlLinks`, `projectShopSeoContextualCrawlLinks`) use **shop-local** `vehicleYearRanges` — separate pipeline, not `sitemap-data`.

---

## 3. Unused %

### vs full `sitemap-data` payload (8,911,374 B)

| Scope | Bytes needed | Unused bytes | Unused % |
|-------|-------------:|-------------:|---------:|
| Raw year-range arrays only | 893,342 | 8,018,032 | **90.0%** |
| Slim fields, all rows | 614,570 | 8,296,804 | **93.1%** |
| Slim fields + governance pre-filter | 116,768 | 8,794,606 | **98.7%** |
| Per-query resolved response (avg sample) | ~556 | ~8,910,818 | **~100%** |

### Within `cbmyRangeListings` row shape

Full row keys from backend (`cbmyRangeSitemapQuality.server.js`):

`category`, `categorySlug`, `brand`, `brandSlug`, `model`, `modelSlug`, `yearFrom`, `yearTo`, `productCount`, `slug`

| Field | Used? |
|-------|-------|
| `category` | **No** |
| `brandSlug` | **No** |
| `modelSlug` | **No** |
| All others | Yes |

**Unused field overhead in CBMY section:** **278,814 bytes** (**31.7%** of `cbmyRangeListings` JSON) — redundant slug strings already derivable from `brand` / `model` / `categorySlug`.

`bmyRangeListings` rows use **100%** of emitted fields (no dead columns).

---

## 4. Minimal dataset size estimate

| Dataset shape | Rows (gated) | Est. bytes | Est. MiB | Notes |
|---------------|-------------:|-----------:|---------:|-------|
| **A. Gated slim inventory** (recommended static) | 106 BMY + 651 CBMY | **116,768** | **0.11** | Pre-filter `productCount`, drop 3 CBMY fields |
| **B. Ungated slim inventory** | 106 + 3,665 | **614,570** | **0.59** | Keeps sub-threshold rows client must discard |
| **C. Per-query resolved** | ≤25 links/page | **112–811** | **&lt;0.001** | Server returns `{ title, links[] }` only |

Row density (gated slim): ~**154 B/row** CBMY, ~**122 B/row** BMY.

---

## Simulated: `GET /api/seo/year-range-links`

No endpoint exists today. Simulation based on live data replay + direct DB timing of existing getters.

### Option A — Static slim inventory (mirror sitemap split pattern)

```
GET /api/seo/year-range-links
→ { bmyRangeListings: [...], cbmyRangeListings: [...] }  // gated + slim fields only
```

| Metric | Current `sitemap-data` | Simulated Option A |
|--------|------------------------|-------------------|
| **Payload** | 8,911,374 B | **116,768 B** |
| **DB work** | 11 listing queries + 7,385 product enrich | **2 queries** (`getBmyRange…`, `getCbmyRange…`) |
| **DB latency** | ~2,100 ms (dominated by products) | **~368 ms** (measured direct) |
| **Parse time** | ~122 ms | **~1.3 ms** |
| **Filter CPU** (per slug page) | ~0.1–0.3 ms scan | Same (client/server filter on 757 rows) |
| **Heap delta (parse)** | ~8.6 MB | **&lt;1 MB** |

**Payload reduction:** **98.7%**  
**End-to-end latency reduction (fetch+parse):** **~1,885 ms → ~370 ms** (~**83%** faster)

### Option B — Per-query resolved links (smallest wire format)

```
GET /api/seo/year-range-links?kind=bmy&brand=Toyota&model=Vios
GET /api/seo/year-range-links?kind=cbmy&categorySlug=ma-phanh&brand=Toyota&model=Vios
GET /api/seo/year-range-links?kind=bmy&brand=Toyota&model=Vios&excludeYear=2014-2020  // range sibling pages
```

Simulated response sizes (live inventory replay):

| Query | Response bytes | Links returned |
|-------|---------------:|----------------|
| BMY Toyota Vios | 811 | 12 |
| BMY Toyota Vios (exclude 2014-2020) | 746 | 11 |
| CBMY ma-phanh Toyota Vios | 112 | 1 |

| Metric | Option B (est.) |
|--------|-----------------|
| **Payload** | **0.1–0.8 KB** per request |
| **DB latency** | **~20–80 ms** if SQL-filtered by brand/model/category; **~368 ms** if reuse Option A cache server-side |
| **Parse** | **&lt;0.1 ms** |
| **Memory** | Negligible |

**Payload reduction vs full sitemap:** **~99.99%**

### Option C — Hybrid (cached inventory + in-process filter)

Same as Option A but `React.cache()` / Redis / memory TTL 3600 s on backend — amortizes 368 ms across slug renders. Matches current `revalidate: 3600` intent without shipping products.

---

## Memory impact (per slug server render)

| Stage | Full `sitemap-data` | Gated slim (A) | Per-query (B) |
|-------|--------------------:|---------------:|--------------:|
| Network download | 8.5 MB | 0.11 MB | &lt;1 KB |
| `JSON.parse` heap growth | **~8.6 MB** | **&lt;1 MB** | **&lt;50 KB** |
| Retained inventory in `React.cache()` | 8.5 MB parsed object | 0.11 MB | None (or small link array) |

On a busy slug crawl burst, full payload parsing multiplies memory pressure; slim/per-query avoids retaining **~8.5 MB × concurrent renders**.

---

## Expected savings (slug `[slug]/page.js` path)

From `audit/home-filter-performance-regression-audit-01.md`, sitemap fetch is the **#3 root cause** (~2 s) on every `force-dynamic` slug render.

| Metric | Today | After dedicated endpoint (est.) | Savings |
|--------|------:|--------------------------------:|--------:|
| Bytes transferred | 8.9 MB | 0.11 MB (A) or &lt;1 KB (B) | **98.7–99.99%** |
| Fetch + parse | ~2,256 ms | ~370 ms (A) or ~50 ms (B) | **~1.9 s (83%)** or **~2.2 s (97%)** |
| RSC total (slug page) | ~2.2–2.8 s | ~0.5–1.0 s | **~60–75%** *(other work: `resolveSeoEntity`, Home shell)* |
| Unused data loaded | 98.7% | 0% | — |

**Per 1,000 slug page renders:** ~**8.9 GB** less egress (static inventory) or ~**8.9 GB** (per-query).

---

## Inventory reference (live counts)

| Item | Count |
|------|------:|
| `bmyRangeListings` (total) | 106 |
| `bmyRangeListings` (gated ≥10) | 106 |
| `cbmyRangeListings` (total) | 3,665 |
| `cbmyRangeListings` (gated ≥2) | 651 |
| `cbmyRangeListings` (`productCount === 1`) | 3,014 |
| Max links rendered per page | 24 (+1 parent on range pages) |

---

## Recommendation summary (audit only — no implementation)

| Priority | Action |
|----------|--------|
| **1** | Add `GET /api/seo/year-range-links` returning **gated slim** `bmyRangeListings` + `cbmyRangeListings` only (~117 KB) |
| **2** | Point `fetchSitemapInventory` in `buildListingYearRangeLinks.server.js` at new endpoint (future task) |
| **3** | Optional: per-query resolved mode for zero client filter CPU |
| **4** | Optional: pre-filter CBMY at source to 651 rows (drop 82% dead rows before wire) |
| **5** | Do **not** include location year-range listings unless a new consumer needs them |

**Not in scope:** Shop crawl graphs, sitemap XML emitters, governance thresholds, parent link builders (already zero-cost local).

---

## Methodology

- Live `GET /api/seo/sitemap-data` measurement + section serialization (`node`)
- Field usage static analysis of `buildListingYearRangeLinks.server.js`
- Row-shape inspection of `bmyRangeSitemapQuality.server.js`, `cbmyRangeSitemapQuality.server.js`
- DB-only latency: direct `getBmyRangeSitemapListings()` + `getCbmyRangeSitemapListings()` import
- Per-query simulation: in-memory replay of filter/sort/map logic
- Governance thresholds: `frontend/lib/seo/urlGovernance.js` `isSitemapEligible`

**No code changes made.**
