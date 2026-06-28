# Tokenization

## Query tokens

From folded query string:

- **single**: `bugi`, `toyota`
- **phrases**: `bugi toyota` (n-grams n=2..4)
- **compound**: union of single + phrases

## Index tokens (sync time)

Built in `searchIndexDocumentTokens.js` from:

- search_text, product_name, search_keywords, part_number
- category_name, brand_name, model_name, vehicle_label

Stored space-padded in:

- `search_tokens`
- `normalized_tokens` (foldVi)
- `synonym_tokens` (graph expansion at sync)
