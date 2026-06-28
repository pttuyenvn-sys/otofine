# Field Mapping — products source → product_search_index

## Popup API field → index column

| Popup / API need | Index column | Source at sync |
|------------------|--------------|----------------|
| `displayTitle` | `title` | `buildProductIdentity().h1` |
| `image` | `thumbnail_url` | `product_images` primary URL + R2 base |
| Vehicle meta line | `vehicle_label` | brand + model + year segment |
| `priceText` | `price` | `products.price` (formatted at runtime) |
| Shop in meta | `shop_name` | `shops.name` |
| Province in meta | `location_name` | `address.tinh_tp` (alias `province_name`) |
| Product URL | `canonical_url` | `buildProductIdentity().canonicalUrl` |
| SEO path | `canonical_path` | `buildProductIdentity().canonicalPath` |
| `partNumber` | `part_number` | `products.partNumber` |
| Stock sort | `stock_status` | `stock > 0` → `in_stock` |
| Ranking | `popularity_score` | `products.updatedAt` unix ms |
| Ranking | `search_priority` / `search_score` | `product_categories.search_priority` |

## Spec name → column name

| Spec field | Column | Notes |
|------------|--------|-------|
| `product_id` | `product_id` | ✓ |
| `title` | `title` | ✓ new |
| `canonical_slug` | `canonical_path` slug segment | Product URL slug is embedded in path; category slug in `category_slug` |
| `canonical_url` | `canonical_url` | ✓ new |
| `thumbnail_url` | `thumbnail_url` | ✓ new |
| `brand` | `brand_name` | existing column |
| `brand_slug` | `brand_slug` | ✓ new |
| `model` | `model_name` | existing column |
| `model_slug` | `model_slug` | ✓ new |
| `vehicle_label` | `vehicle_label` | ✓ new |
| `category_id` | `category_id` | ✓ |
| `category_name` | `category_name` | ✓ |
| `category_slug` | `category_slug` | ✓ new (mirrors `canonical_slug`) |
| `province_name` | `location_name` | existing column |
| `shop_name` | `shop_name` | ✓ new |
| `price` | `price` | ✓ new |
| `stock_status` | `stock_status` | ✓ new |
| `part_number` | `part_number` | ✓ |
| `part_number_norm` | `part_number_norm` | ✓ |
| `search_text` | `search_text` | ✓ |
| `search_keywords` | `search_keywords` | ✓ |
| `search_score` | `search_score` | ✓ new |
| `search_priority` | `search_priority` | ✓ |
| `popularity_score` | `popularity_score` | ✓ new |
| `document_hash` | `document_hash` | ✓ (extended inputs) |
| `search_version` | `search_version` | bumped to **2** |

## Hash inputs (sync skip gate)

All searchable + popup fields above participate in `document_hash` via `searchIndexDocumentHash.js`.

## Automatic sync triggers (unchanged)

- Product create/update → `syncProduct`
- Fitment change → `syncVehicle`
- Category map change → `syncCategory`
- Visibility/moderation → `syncVisibility` / `syncApproval`
- Stale `search_version < 2` → picked up by `rebuildAll({ staleVersionOnly: true })`
