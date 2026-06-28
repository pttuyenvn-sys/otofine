# Legacy vs index grouping

When `SEARCH_GROUP_INDEX=1`:

- Grouping reads **only** `product_search_index`
- GROUP BY stable keys: `category_id`, `category_slug`, `brand_slug`, `model_slug`
- Count: `COUNT(DISTINCT product_id)` on index (no products JOIN)
- Ranking, parser, popup assembly unchanged

Rollback: `SEARCH_GROUP_INDEX=0`
