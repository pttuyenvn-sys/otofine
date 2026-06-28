# SEARCH-INVERTED-INDEX-QUALITY-AUDIT-01

**Mode:** Read-only diagnosis  
**Date:** 2026-06-22  
**No code, SQL, index, or config changes made.**

## Executive summary

The `search_token_index` design is **structurally sound** (unique constraints work, per-product sync works, no orphan rows) but **token content is highly inefficient**. The index currently stores ~**634 tokens/product**, of which an estimated **55–70% is redundant** due to replaying precomputed `search_tokens` / `synonym_tokens` columns that contain **global hub tokens appearing on every product**.

| Scale | Readiness | Score |
|-------|-----------|-------|
| 100k | **CANARY** | 52/100 |
| 500k | **NOT READY** | 38/100 |
| 1M | **NOT READY** | 28/100 |

**Recommendation:** Do not wire inverted index into search runtime until token explosion causes are addressed. Storage and selectivity are manageable at 100k only after deduplication; 500k–1M requires architectural changes.

---

## Corpus snapshot

| Metric | Value |
|--------|-------|
| Active products (`product_search_index`) | 7,385 |
| Products with inverted tokens | 50 (0.68%) |
| Total inverted token rows | 31,691 |
| Avg fitment rows/product (full corpus) | 1.16 (max 5) |

---

## Token distribution

| Statistic | Value |
|-----------|-------|
| Total tokens | 31,691 |
| Avg tokens/product | 633.82 |
| Median / P50 | 633 |
| P90 | 648 |
| P95 | 649 |
| P99 | 651 |
| Min / Max | 611 / 651 |
| Std deviation | 9.92 |

The extremely low variance (σ ≈ 10 on mean 634) indicates **systematic global token injection** — every product receives nearly the same token bundle regardless of title or fitment.

See [`token-distribution.json`](./search-inverted-index-quality-audit-01/token-distribution.json).

---

## Token breakdown by type

| Type | Count | % of total |
|------|-------|------------|
| **SYNONYM** | 16,614 | **52.42%** |
| **WORD** | 13,908 | 43.89% |
| PHRASE | 790 | 2.49% |
| CATEGORY | 100 | 0.32% |
| MODEL | 67 | 0.21% |
| YEAR | 62 | 0.20% |
| OEM | 50 | 0.16% |
| LOCATION | 50 | 0.16% |
| BRAND | 50 | 0.16% |
| UNKNOWN | 0 | 0.00% |

### WORD sources

| Source | Count | % of WORD |
|--------|-------|-----------|
| `search_tokens` (column replay) | 12,840 | **92.3%** |
| `search_keywords` | 579 | 4.2% |
| `title` | 335 | 2.4% |
| `location` | 150 | 1.1% |
| `vehicle` | 4 | 0.03% |

### SYNONYM sources

| Source | Count |
|--------|-------|
| `synonym_tokens` (column replay) | 16,614 (100%) |
| `seo_alias` | 0 |

See [`token-breakdown.json`](./search-inverted-index-quality-audit-01/token-breakdown.json).

---

## Top offenders (token count)

All 50 indexed products cluster at **611–651 tokens**. Top examples:

| product_id | title | tokens | SYNONYM | WORD | PHRASE | fitments |
|------------|-------|--------|---------|------|--------|----------|
| 161 | Bi tê Kia Rio 2011-2013 | 651 | 332 | 281 | 27 | 4 |
| 133 | Bát bắt cản trước… Kia Carnival | 650 | 339 | 284 | 21 | 1 |
| 159 | Bi tăng curoa tổng Kia Sedona… | 649 | 335 | 282 | 23 | 2 |
| 130 | Bát bắt cản trước trên… Carnival | 648 | 338 | 283 | 21 | 1 |

**Key finding:** Products with 1 fitment row have nearly the same token count as products with 4 fitment rows. Fitment multiplication is **not** the primary explosion driver — **global column replay** is.

See [`top-offenders.json`](./search-inverted-index-quality-audit-01/top-offenders.json) (top 100).

---

## Duplicate analysis

| Check | Result |
|-------|--------|
| Exact row duplicates `(product_id, token, token_type)` | **0** ✓ |
| Per-type exact duplicates | **0** ✓ |
| Same token across multiple types (cross-type) | **50 groups** in sample |
| Same WORD from multiple sources | **0** (dedup works within type) |

### Cross-type examples (same string, multiple types)

| token | types | products affected |
|-------|-------|-------------------|
| `kia` | WORD, BRAND, SYNONYM | per product |
| `51730m6000` | WORD, OEM, SYNONYM | per product |
| `2018` | WORD, SYNONYM, YEAR | per product |
| `cerato` | WORD, MODEL, SYNONYM | per product |

The unique constraint prevents row duplication but **allows semantic duplication** across types — tripling storage and posting-list width for common terms.

See [`duplicate-analysis.json`](./search-inverted-index-quality-audit-01/duplicate-analysis.json).

---

## Synonym analysis

| Check | Finding |
|-------|---------|
| `search_synonyms` table | **Does not exist** in database |
| `category_dictionary` active aliases | Empty / none matched |
| SYNONYM rows | 100% from `synonym_tokens` column replay |
| Circular synonyms | Graph uses bidirectional linking at sync; chains not stored in inverted index |
| Hub synonym tokens | `091`, `11pt`, `12pt`, `zalo`, `143`, `1850` — present on **all 50 products** |

### Longest chain

Not observable in `search_token_index`. Synonym expansion happens upstream in `buildIndexTokenFields` → `expandTokensWithSynonyms`. The resulting blob is identical across products, explaining uniform token counts.

### Unused synonyms

Cannot assess — `search_synonyms` table missing. Category dictionary returned no active aliases in sample.

See [`synonym-analysis.json`](./search-inverted-index-quality-audit-01/synonym-analysis.json).

---

## Phrase analysis

| Metric | Value |
|--------|-------|
| Total PHRASE tokens | 790 (2.49%) |
| Avg phrase word count | 2.85 |
| Max phrase word count | 4 |
| Avg phrase length (chars) | 12.6 |
| Max phrase length (chars) | 23 |
| Products with >100 phrases | **1** (product 161, 108 phrases, 4 fitments) |

### Combinatorial explosion

PHRASE tokens come from `tokenizeMatcherQuery` n-grams (n=2..4) on `title`, `vehicle_label`, and `seo_alias`. With avg fitment 1.16, phrase explosion is **minor compared to synonym replay**. Product 161 is the only phrase outlier due to 4 fitment rows × title n-grams.

See [`phrase-analysis.json`](./search-inverted-index-quality-audit-01/phrase-analysis.json).

---

## Token efficiency

| Category | Estimate | % |
|----------|----------|---|
| Total tokens | 31,691 | 100% |
| **Redundant** (column replay + cross-type overlap) | ~17,500–22,000 | **55–70%** |
| **Noise / never-match** (hub tokens: `091`, `11pt`, font sizes) | ~300–500 unique tokens × 50 products | ~5–8% |
| **Useful** (OEM, structured brand/model/category, title words) | ~1,700–2,500 | **5–8%** |
| **Marginal** (search_keywords, location, phrases) | ~1,500 | ~5% |

### Why tokens are generated (source catalog)

| source | token_type | weight | why |
|--------|------------|--------|-----|
| `title` | WORD, PHRASE | 80 | `addTextTokens()` n-gram extraction |
| `part_number` | OEM | 100 | Raw + normalized part number |
| `category` | CATEGORY | 60 | category_name + category_slug |
| `brand` | BRAND | 40 | brand_name, brand_slug, primary_brand_name |
| `model` | MODEL | 40 | model_name, model_slug, primary_model_name |
| `location` | LOCATION, WORD | 10 / 30 | location_name |
| `year` | YEAR | 10 | year_from/to, primary_year_from/to |
| `vehicle` | WORD, PHRASE | 30 / 80 | vehicle_label n-grams |
| `search_keywords` | WORD | 30 | Meta keywords tokenized |
| **`search_tokens`** | **WORD** | **30** | **Replay of precomputed padded column — primary bloat source** |
| **`normalized_tokens`** | **WORD** | **30** | **Replay of folded column (subset of above, deduped by type)** |
| **`synonym_tokens`** | **SYNONYM** | **20** | **Replay of synonym-expanded column — 52% of all rows** |
| `seo_alias` | SYNONYM, WORD | 20 / 30 | category_dictionary match_keyword (none in sample) |

---

## Storage forecast

Observed table size (50 products): **0.08 MB** (InnoDB minimum page allocation — not representative).

| Scale | Est. rows | Est. storage (mid) | Est. storage (high) |
|-------|-----------|--------------------|---------------------|
| Current (50 products) | 31,691 | ~10 MB | ~15 MB |
| Full corpus (7,385) | 4.68M | **~1.4 GB** | ~2.1 GB |
| **100k** | 63.4M | **~18.9 GB** | ~28 GB |
| **500k** | 317M | **~94.7 GB** | ~142 GB |
| **1M** | 634M | **~189 GB** | ~284 GB |

See [`storage-forecast.json`](./search-inverted-index-quality-audit-01/storage-forecast.json).

---

## Sync cost

Measured via rolled-back `rebuildInvertedIndexForProduct` (no persistent changes):

| Metric | ms |
|--------|-----|
| P50 | 205 |
| P90 | 384 |
| P95 | 527 |
| P99 | 566 |
| Worst | 566 |
| Mean | 256 |

### Largest contributors to sync time

1. DELETE + bulk INSERT ~630 rows/product
2. Loading synonym graph from DB (cached 5 min)
3. Loading SEO aliases query
4. Reading all `product_search_index` fitment rows

**Full corpus sequential rebuild at mean 256 ms:** 7,385 products ≈ **31 min**; 100k ≈ **7.1 hours**; 1M ≈ **71 hours**.

See [`sync-cost.json`](./search-inverted-index-quality-audit-01/sync-cost.json).

---

## Search cost (theoretical — not wired)

| Metric | Value |
|--------|-------|
| Avg postings list size | ~1.0 (50 products, most tokens universal) |
| Max postings list | **50** (100% of corpus) |
| Min postings list | 1 |

### Least selective tokens (posting list = 50/50)

`091`, `1134`, `1136`, `11pt`, `12pt`, `1163`, `1164`, `zalo`, `143`, `1850` — appear as both WORD and SYNONYM on every product. These are likely **font-size / CSS / shop template artifacts** embedded in `search_tokens`/`synonym_tokens` columns.

**Token selectivity:** Effectively **zero** for hub tokens. A query intersecting two hub tokens returns the entire corpus. Real discriminative tokens (OEM part numbers) have posting list size 1–5.

See [`search-cost.json`](./search-inverted-index-quality-audit-01/search-cost.json) (if generated).

---

## Index health

| Check | Status |
|-------|--------|
| Broken product references | **0** orphan token products ✓ |
| Missing products (no tokens) | **7,335** / 7,385 (expected — partial sync) |
| Duplicate rows | **0** ✓ |
| Invalid weights | **0** ✓ |
| Unknown token types | **0** ✓ |

---

## Top 20 optimization opportunities (diagnosis only)

| # | Cause | Est. reduction if removed |
|---|-------|---------------------------|
| 1 | Replay `synonym_tokens` column → SYNONYM rows | **−52%** rows |
| 2 | Replay `search_tokens` column → WORD rows | **−41%** rows |
| 3 | Hub tokens (DF=100%) from global synonym blob | **−5–8%** rows; major selectivity gain |
| 4 | Cross-type duplication (WORD+SYNONYM+BRAND for same string) | **−10%** effective posting width |
| 5 | Product-level dedup before fitment iteration | **−5–15%** for multi-fitment SKUs |
| 6 | PHRASE n-grams on vehicle_label | **−1%** rows |
| 7 | PHRASE n-grams on title (cap at 20) | **−1%** rows |
| 8 | SEO alias expansion (currently 0 in sample) | prevent future bloat |
| 9 | Location as LOCATION + WORD double emit | **−0.5%** |
| 10 | Year quad emit (4 year fields × fitment) | **−0.2%** |
| 11 | OEM triple emit (raw, normalized, norm column) | **−0.1%** |
| 12 | Category name + slug both indexed | **−0.1%** |
| 13 | Brand/model slug + name + primary_* | **−0.3%** |
| 14 | search_keywords tokenization on long meta | **−2%** |
| 15 | No stopword filter (`kia` on every Kia product) | selectivity improvement |
| 16 | No document-frequency cap | critical for intersect |
| 17 | Symmetric synonym graph inflation | upstream fix needed |
| 18 | Missing `search_synonyms` table governance | risk when added |
| 19 | No token budget per product | allows unbounded growth |
| 20 | Index row iteration vs product-level extract | architectural |

**Combined potential:** Reduce from ~634 to **~80–150 tokens/product** (−75–87%) without losing meaningful recall, by removing column replay and hub tokens only.

See [`optimization-opportunities.json`](./search-inverted-index-quality-audit-01/optimization-opportunities.json).

---

## Readiness

See [`readiness.md`](./search-inverted-index-quality-audit-01/readiness.md).

---

## Deliverables

| File | Description |
|------|-------------|
| [`token-distribution.json`](./search-inverted-index-quality-audit-01/token-distribution.json) | Distribution statistics |
| [`top-offenders.json`](./search-inverted-index-quality-audit-01/top-offenders.json) | Top 100 products by token count |
| [`token-breakdown.json`](./search-inverted-index-quality-audit-01/token-breakdown.json) | Type and source breakdown |
| [`duplicate-analysis.json`](./search-inverted-index-quality-audit-01/duplicate-analysis.json) | Duplicate and cross-type analysis |
| [`synonym-analysis.json`](./search-inverted-index-quality-audit-01/synonym-analysis.json) | Synonym source and hub token analysis |
| [`phrase-analysis.json`](./search-inverted-index-quality-audit-01/phrase-analysis.json) | Phrase combinatorics |
| [`storage-forecast.json`](./search-inverted-index-quality-audit-01/storage-forecast.json) | Storage projections |
| [`sync-cost.json`](./search-inverted-index-quality-audit-01/sync-cost.json) | Per-product rebuild latency |
| [`readiness.md`](./search-inverted-index-quality-audit-01/readiness.md) | Scale readiness scores |

---

## Conclusion

The inverted index **infrastructure** (schema, unique constraints, per-product sync hook, repository API) is ready for iterative improvement. The **token content strategy** is not suitable for production search at scale without major deduplication:

1. **Stop replaying** precomputed token columns into the inverted index — extract from primary fields only.
2. **Filter hub tokens** with document frequency > threshold.
3. **Collapse cross-type duplicates** — pick one canonical type per token string.
4. **Backfill full corpus** and re-run this audit before runtime wiring.

No code, SQL, index, or configuration was modified during this audit.
