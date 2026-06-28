# Comparison

| Path | Candidate source | LIKE role |
|------|------------------|-----------|
| Legacy | products + fitment JOINs | primary |
| Hybrid index | FULLTEXT on search_text | fallback |
| Matcher | normalized_tokens / synonym_tokens | last resort |

Rollback: `SEARCH_MATCHER_INDEX=0`
