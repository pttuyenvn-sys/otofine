# SEARCH-INVERTED-INDEX-01

Inverted index layer on `product_search_index`. **Data structure only — no runtime wiring.**

## Flag

`SEARCH_INVERTED_INDEX=0` (default) — skip inverted index writes.

## Architecture

```
products → SearchIndexSync → product_search_index → SearchTokenIndexBuilder → search_token_index
```

See [schema.md](./schema.md), [builder.md](./builder.md), [benchmark.md](./benchmark.md).
