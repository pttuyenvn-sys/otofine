# Runtime Architecture

```
Query → Normalize → Tokenize → Synonym expand (depth 1)
     → SQL candidate retrieval (search_token_index)
     → Ranking (product_search_index)
     → Grouping (product_search_index)
     → Popup (product_search_index via SearchIndexDocumentReader)
```

Flag: `SEARCH_RUNTIME=inverted` (default `legacy`)
Requires: `SEARCH_INVERTED_INDEX=1` for populated search_token_index
