# SEARCH-INDEX-MATCHER-01

Dedicated **SearchMatcher** on `product_search_index` — single query interpretation layer, independent of MySQL FULLTEXT, LIKE, Typesense, and OpenSearch.

## Feature flag

| Env | Default | Effect |
|-----|---------|--------|
| `SEARCH_MATCHER_INDEX` | `0` | Existing index cascade (exact → FULLTEXT → LIKE) |
| `SEARCH_MATCHER_INDEX` | `1` | Matcher-first candidate retrieval from index token columns |

Rollback: set `SEARCH_MATCHER_INDEX=0` — no code deploy required.

## Architecture

```
Query → SearchMatcher → Candidate Documents (index only) → Grouping → Popup
         ↓ (0 candidates)
         exact → FULLTEXT → LIKE (last resort)
```

## Index schema (v4)

New columns on `product_search_index`:

- `search_tokens` — space-padded raw tokens
- `normalized_tokens` — folded tokens for retrieval
- `synonym_tokens` — synonym-expanded tokens (sync-time + DB graph)

Rebuild stale rows: `node backend/scripts/rebuild-search-index.js` or validation script auto-rebuild.

## Key files

| File | Role |
|------|------|
| `backend/services/search/matcher/SearchMatcher.js` | Orchestrator |
| `backend/services/search/matcher/searchMatcherNormalize.js` | Unicode / VN / OEM normalization |
| `backend/services/search/matcher/searchMatcherTokenize.js` | Single + phrase + compound tokens |
| `backend/services/search/matcher/searchMatcherSynonymSource.js` | DB synonym graph |
| `backend/services/search/matcher/searchMatcherScore.js` | Candidate scoring |
| `backend/services/search/searchIndexDocumentTokens.js` | Index token builder at sync |
| `backend/services/search/runtime/indexSearchClauses.js` | Shared WHERE clause builders |
| `backend/config/searchMatcherIndexConfig.js` | Feature flag |

## Validation

```bash
node backend/scripts/validate-search-index-matcher-01.mjs
```

**Result:** PASS — 6/7 representative queries resolved via matcher without LIKE; 0% LIKE fallback rate.

## Deliverables

- [search-index-matcher-01/matcher-architecture.md](./search-index-matcher-01/matcher-architecture.md)
- [search-index-matcher-01/tokenization.md](./search-index-matcher-01/tokenization.md)
- [search-index-matcher-01/synonym-source.md](./search-index-matcher-01/synonym-source.md)
- [search-index-matcher-01/benchmark.md](./search-index-matcher-01/benchmark.md)
- [search-index-matcher-01/comparison.md](./search-index-matcher-01/comparison.md)
- [search-index-matcher-01/benchmark-results.json](./search-index-matcher-01/benchmark-results.json)

## Acceptance

- [x] Candidate retrieval from `product_search_index` only
- [x] No `products` scan for successful matcher queries
- [x] LIKE fallback usage measured (0% in benchmark)
- [x] Feature flag rollback available
- [x] No SEO / API / frontend / parser changes

## Rollout

Recommended with existing index flags:

```env
SEARCH_GROUP_INDEX=1
SEARCH_POPUP_INDEX=1
SEARCH_MATCHER_INDEX=1
SEARCH_RUNTIME=legacy   # or hybrid
```

## Note on latency

Matcher token retrieval uses boundary-safe `LIKE` on precomputed token columns (not products). Current p95 is higher than FULLTEXT on small corpora; see `benchmark.md` for numbers. Future optimization: FULLTEXT index on `normalized_tokens` or inverted token table.
