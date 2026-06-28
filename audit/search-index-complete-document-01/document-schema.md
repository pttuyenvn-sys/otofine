# product_search_index — Complete Search Document Schema

Version: **2** (`SEARCH_INDEX_VERSION=2`)

## Document grain

One row per **product × vehicle fitment** (unchanged). Popup fields are denormalized per row.

## Identity & search

| Column | Type | Purpose |
|--------|------|---------|
| `product_id` | BIGINT | Product FK |
| `part_number` | VARCHAR(128) | OEM / part code |
| `part_number_norm` | VARCHAR(128) | Normalized exact match |
| `product_name` | VARCHAR(512) | Raw part name |
| `title` | VARCHAR(512) | Popup display title (identity h1) |
| `search_keywords` | TEXT | Derived/meta keywords |
| `search_text` | TEXT | FULLTEXT blob (product text only) |
| `search_priority` | SMALLINT | Category priority |
| `search_score` | INT | Ranking hint (= search_priority today) |
| `popularity_score` | BIGINT | Freshness tie-break (updatedAt unix ms) |
| `status` | ENUM | active / inactive |
| `document_hash` | CHAR(64) | Change detection |
| `search_version` | SMALLINT | Schema version (2) |

## SEO URLs (unchanged algorithm)

| Column | Type | Purpose |
|--------|------|---------|
| `canonical_path` | VARCHAR(512) | e.g. `/bugi-denso-toyota-vios-2018-04465-12345` |
| `canonical_url` | VARCHAR(768) | Absolute URL from `buildProductIdentity` |

## Popup render fields

| Column | Type | Purpose |
|--------|------|---------|
| `thumbnail_url` | VARCHAR(512) | Primary image (R2-normalized) |
| `vehicle_label` | VARCHAR(255) | e.g. `Toyota Vios 2018-2022` |
| `price` | DECIMAL(15,2) | Numeric price |
| `stock_status` | VARCHAR(32) | `in_stock` / `out_of_stock` |
| `shop_name` | VARCHAR(255) | Shop display name |
| `location_name` | VARCHAR(255) | Province (`province_name` alias) |

## Vehicle

| Column | Type | Purpose |
|--------|------|---------|
| `brand_name` | VARCHAR(128) | Brand (`brand` alias) |
| `brand_slug` | VARCHAR(128) | Slugified brand |
| `model_id` | BIGINT | car_models.id (0 = none) |
| `model_name` | VARCHAR(128) | Model (`model` alias) |
| `model_slug` | VARCHAR(128) | Slugified model |
| `year_from` | SMALLINT | Fitment year start (0 = unknown) |
| `year_to` | SMALLINT | Fitment year end |

## Category

| Column | Type | Purpose |
|--------|------|---------|
| `category_id` | BIGINT | Category FK |
| `category_name` | VARCHAR(255) | Canonical category name |
| `category_slug` | VARCHAR(255) | Category slug |
| `canonical_slug` | VARCHAR(255) | **Backward compat** — same as category_slug |

## Not stored (by design)

- Full `products` mirror (description HTML, moderation, shop phone, etc.)
- Live stock count (only `stock_status`)
- `cardHighlights` / `subtitleLine1` (derived at API layer from stored fields when runtime switches)

## Migration

Applied idempotently via `ensureSearchIndexSchema.js` (migration 072).
