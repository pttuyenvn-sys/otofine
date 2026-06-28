# SEARCH-INVERTED-INDEX-BUILDER-OPTIMIZATION-01

Optimized `SearchTokenIndexBuilder` — canonical business fields only, no precomputed token blob replay.

## Results (100-product sample)

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Avg tokens/product | 634.45 | **50.15** | 50–80 ✓ |
| P95 | 650 | **63** | <120 ✓ |
| P99 | 656 | **64** | <180 ✓ |
| Max | 658 | **68** | <300 ✓ |
| Reduction | — | **−92.1%** | — |

## Sync performance

| Metric | Before (est.) | After |
|--------|---------------|-------|
| Builder P50 | — | 1.8 ms |
| Sync P50 | ~205 ms | **47 ms** |
| Sync P95 | ~527 ms | **85 ms** |

## Changes

1. **No blob replay** — removed `search_tokens`, `normalized_tokens`, `synonym_tokens` ingestion
2. **Canonical fields only** — title, OEM, category, brand, model, year, province, search_keywords, SEO/dictionary synonyms
3. **Adjacent 3-gram phrases** — no permutations
4. **Cross-type dedup** — one type per token string (OEM > BRAND > MODEL > … > WORD)
5. **Stop words + garbage filter** — CSS, phone numbers, numeric fragments, font names
6. **Depth-1 synonyms** — dictionary only, no graph expansion loops
7. **`inverted_token_hash`** — skip DB rebuild when token set unchanged

## Rollback

```env
SEARCH_INVERTED_INDEX_LEGACY_BUILDER=1   # restore pre-optimization builder
SEARCH_INVERTED_INDEX=0                # disable inverted index entirely
```

## Files

| File | Role |
|------|------|
| `SearchTokenIndexBuilder.js` | Optimized builder |
| `SearchTokenIndexBuilder.legacy.js` | Rollback builder |
| `searchTokenGarbageFilter.js` | Garbage classification |
| `searchTokenPhrase.js` | Word + adjacent phrase tokenization |
| `searchTokenSynonymSource.js` | Depth-1 dictionary synonyms |
| `searchTokenSetHash.js` | Token set hash for skip-rebuild |
| `config/searchTokenStopWords.js` | Configurable stop words |

## Validation

```bash
node backend/scripts/validate-search-inverted-index-builder-optimization-01.mjs
```

**PASS** — all token count targets met; 0 duplicate rows; 0 cross-type duplicates in sample.

## Deliverables

- [before-after.json](./search-inverted-index-builder-optimization-01/before-after.json)
- [token-reduction.json](./search-inverted-index-builder-optimization-01/token-reduction.json)
- [garbage-report.json](./search-inverted-index-builder-optimization-01/garbage-report.json)
- [duplicate-report.json](./search-inverted-index-builder-optimization-01/duplicate-report.json)
- [phrase-report.json](./search-inverted-index-builder-optimization-01/phrase-report.json)
- [benchmark.md](./search-inverted-index-builder-optimization-01/benchmark.md)
- [validation.md](./search-inverted-index-builder-optimization-01/validation.md)

No search runtime, frontend, parser, SEO, or API changes.
