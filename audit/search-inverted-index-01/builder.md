# SearchTokenIndexBuilder

Built from `product_search_index` rows per product.

## Sources

title, category, brand, model, vehicle, part_number, search_keywords,
search_tokens, normalized_tokens, synonym_tokens, seo_alias (category_dictionary)

## Sync

`SearchIndexSyncService.syncProduct()` calls `rebuildInvertedIndexForProduct()` after index upsert.
Deletes tokens on product removal. **Per-product only — never full rebuild.**

## Flag

`SEARCH_INVERTED_INDEX=1` enables sync. Default `0` skips writes (rollback = disable flag).
