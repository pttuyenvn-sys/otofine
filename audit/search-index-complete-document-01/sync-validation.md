# Sync Validation — SEARCH-INDEX-COMPLETE-DOCUMENT-01

Generated: 2026-06-27

## Summary

| Check | Result |
|-------|--------|
| Schema migration | PASS (072 columns applied) |
| Full stale rebuild | 7,385 products → 8,602 documents |
| Stale version rows | **0** |
| Random sample parity (n=150) | **100%** |
| Validation script | **PASS** |

## Popup field fill rate (171 index rows sampled)

| Field | Fill % | Missing |
|-------|--------|---------|
| title | 100% | 0 |
| canonical_url | 100% | 0 |
| thumbnail_url | 95.3% | 8 (products without images) |
| vehicle_label | 100% | 0 |
| price | 100% | 0 |
| shop_name | 100% | 0 |
| location_name | 99.4% | 1 (shop without province) |
| part_number | 100% | 0 |
| stock_status | 100% | 0 |

## Sync latency (force resync per product)

| Metric | ms |
|--------|-----|
| avg | 13.04 |
| p50 | 12.56 |
| p95 | 19.8 |

## Rebuild performance

| Metric | Value |
|--------|-------|
| Products processed | 7,385 |
| Documents written | 8,602 |
| Rebuild duration | 109.6s |
| Schema apply (first run) | 137.2s |

## Parity method

For each sample product:

1. `SearchIndexSyncService.syncProduct(id, { force: true })`
2. `compareProductIndex(pool, id)` — expected docs from live products source vs `product_search_index`

No field mismatches in sample.

## Stale field detection

Rows with `search_version < 2` after rebuild: **0**.

Hash-gated upsert skips unchanged documents on normal product updates.
