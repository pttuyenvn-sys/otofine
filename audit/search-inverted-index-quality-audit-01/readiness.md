# Readiness — SEARCH-INVERTED-INDEX-QUALITY-AUDIT-01

Audit date: 2026-06-22  
Corpus: 7,385 active products in `product_search_index`; **50 products** (0.68%) have inverted tokens.

## Summary scores

| Scale | Score | Status | Est. rows | Est. storage (mid) |
|-------|-------|--------|-----------|-------------------|
| **100k products** | **52** | **CANARY** | 63.4M | ~18.9 GB |
| **500k products** | **38** | **NOT READY** | 317M | ~94.7 GB |
| **1M products** | **28** | **NOT READY** | 634M | ~189 GB |

## Scoring factors

| Factor | Impact | Detail |
|--------|--------|--------|
| Tokens/product | High | Mean **634** (P99 651). Target for inverted index: 50–150. |
| Synonym inflation | Critical | **52.4%** of rows are SYNONYM from `synonym_tokens` column replay. |
| Denormalized replay | Critical | **92.3%** of WORD tokens come from `search_tokens` replay, not live fields. |
| Hub tokens | Critical | Tokens like `091`, `11pt`, `zalo` appear on **100%** of indexed products — zero selectivity. |
| Cross-type duplication | Medium | 50 token strings appear as WORD+BRAND+MODEL+SYNONYM+YEAR simultaneously. |
| Sync cost | Medium | P50 **205 ms**, P95 **527 ms**, worst **566 ms** per product rebuild. |
| Storage | Medium–High | ~320 bytes/row realistic → **19 GB** at 100k, **189 GB** at 1M. |
| Coverage | Low (today) | 99.3% of products lack inverted tokens — design unproven at full scale. |
| Index health | Good | 0 duplicate rows, 0 orphan products, 0 invalid weights. |
| Runtime | N/A | Not wired — search cost is theoretical. |

## Verdict by scale

### 100k — CANARY

Usable for **canary testing only** after deduplication and synonym hygiene. Current token density and hub-token pollution would cause poor selectivity and large intersect/union operations. Per-product incremental sync (~200–500 ms) is acceptable for write path.

### 500k — NOT READY

Projected **95 GB** storage and **317M rows** without optimization. Hub tokens present on every document would make `intersect()` on 2+ terms return near-full corpus. Requires product-level dedup, stop hub-token indexing, and removal of column replay before scale.

### 1M — NOT READY

Projected **189 GB** / **634M rows**. Sequential full rebuild at 255 ms/product ≈ **73 hours**. Not viable without architectural changes (token budget cap, frequency filtering, separate synonym index).

## Preconditions before production runtime

1. Remove or gate `search_tokens` / `normalized_tokens` / `synonym_tokens` column replay.
2. Filter document-frequency hub tokens (DF > 50% corpus).
3. Product-level tokenization (dedup fitment rows before extract).
4. Cap PHRASE n-grams to title-only, max 20 per product.
5. Validate `search_synonyms` table (currently **missing** in DB).
6. Full corpus backfill + re-audit before runtime wiring.
