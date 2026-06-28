# Matcher Architecture

## Flow

```
Query
  ↓
SearchMatcher.resolveMatcherExecution()
  ↓ Normalize (Unicode, VN accents, OEM, case)
  ↓ Tokenize (single, phrase, compound)
  ↓ Expand (DB synonym graph)
  ↓ Candidate retrieval (product_search_index only)
  ↓ Scoring (JS rank on index rows)
  ↓ Return IndexSearchExecution (document ids + ORDER BY CASE)
  ↓
Grouping / Popup (unchanged)
```

## Feature flag

`SEARCH_MATCHER_INDEX=0` (default) — existing exact → FULLTEXT → LIKE cascade.

`SEARCH_MATCHER_INDEX=1` — matcher tried first; LIKE only when matcher returns null.

## Integration

`resolveIndexSearchExecution()` in `indexSearchExecution.js` calls matcher when flag is on.
