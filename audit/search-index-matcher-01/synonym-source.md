# Synonym Sources

Loaded at runtime and sync from DB (no hardcoded map):

| Source | Fields |
|--------|--------|
| `category_dictionary` | match_keyword ↔ canonical_name |
| `car_models` | hang_xe, ten_xe |
| `product_categories` | category_name ↔ canonical_name |
| `search_synonyms` | term ↔ synonym (optional table) |

Cache TTL: 5 minutes (`searchMatcherSynonymSource.js`).
