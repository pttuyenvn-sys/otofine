# Otofine — Database, Data Flow & Query Audit

> **Phase:** Structural Observation Only  
> **Date:** 2026-05-26  
> **Scope:** Read-only. No refactor suggestions. No fixes proposed. Reflects current production architecture as-is.  
> **Sources:** 54 migration files, 4 model files, 18 RFQ repositories, 20 RFQ services, 12 product/shop repository+service files, 6 job files, 3 SEO service files.

---

## Table of Contents

1. [Schema Overview](#1-schema-overview)
   - [Schema Gap: Core Tables Not in Migrations](#11-schema-gap-core-tables-not-in-migrations)
   - [Core Product Tables](#12-core-product-tables)
   - [Derived Product Tables](#13-derived-product-tables)
   - [Category System Tables](#14-category-system-tables)
   - [Part Knowledge Tables](#15-part-knowledge-tables)
   - [SEO Tables](#16-seo-tables)
   - [Shop Tables](#17-shop-tables)
   - [Auth Tables](#18-auth-tables)
   - [RFQ Subsystem Tables](#19-rfq-subsystem-tables)
   - [Analytics Tables](#110-analytics-tables)
2. [Product Data Lifecycle](#2-product-data-lifecycle)
3. [Shop Lifecycle](#3-shop-lifecycle)
4. [Query Hotspots](#4-query-hotspots)
   - [Storefront SSR Queries](#41-storefront-ssr-queries)
   - [Product Listing Queries](#42-product-listing-queries)
   - [RFQ Inbox Queries](#43-rfq-inbox-queries)
   - [Seller Dashboard Queries](#44-seller-dashboard-queries)
   - [Analytics Queries](#45-analytics-queries)
   - [SEO Queries](#46-seo-queries)
   - [Background Job Queries](#47-background-job-queries)
5. [Index Audit](#5-index-audit)
6. [Dangerous Coupling in Data Layer](#6-dangerous-coupling-in-data-layer)
7. [Existing Moderation & Billing Groundwork](#7-existing-moderation--billing-groundwork)

---

## 1. Schema Overview

**Database engine:** MySQL (primary), `mysql2` connection pool.  
**Secondary engine:** SQL Server (`mssql`) — enabled via `DB_ENGINE=mssql` or `DB_TYPE=mssql`. Used only for `part_knowledge` table on alternative deployments; not the production default.  
**Connection:** `config/db.js` → pool using `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT`.  
**Schema management:** 54 numbered+named SQL migration files. No ORM migration runner — executed via individual `scripts/run-*-migration.js` scripts.

**Total migration-defined tables:** ~35 MySQL tables  
**Core catalog tables (outside migrations):** `products`, full `shops` shape — defined in `initDB.js` and production DB backup

### 1.1 Schema Gap: Core Tables Not in Migrations

The following tables are referenced throughout the codebase but are **not created in any migration file**:

| Table | Where defined | Notes |
|---|---|---|
| `products` | `initDB.js` (partial), production DB | Migrations only ADD columns/indexes |
| `shops` (full shape) | `initDB.js` (minimal), production DB | `initDB.js` uses `userId` not `accountId`; migrations ADD storefront columns |
| `product_car_applications` | Production DB only | Referenced in indexes in `001` |
| `product_images` | Production DB only | Referenced in indexes in `001` |
| `shop_accounts` | Production DB only | Migrations only ALTER `status` enum |
| `address` | Production DB only | Migrations ADD `tinh_tp_norm`, `tinh_tp_slug` |
| `car_models` | Production DB only | Referenced extensively |
| `attributes`, `car_model_attributes`, `car_model_specs` | Production DB only | Referenced in `product.service.js` |

> To obtain the complete production schema for these tables, a live `INFORMATION_SCHEMA` query or production DB dump is required.

### 1.2 Core Product Tables

#### `products` — columns known from migrations + code

| Column | Source | Notes |
|---|---|---|
| `id` | initDB/code | BIGINT, PK |
| `shopId` | initDB + `001` ALTER | BIGINT NOT NULL |
| `partNumber` | code | VARCHAR |
| `partName` | code | VARCHAR(512) |
| `shortDescription` | code | TEXT |
| `description` | code | TEXT |
| `price` | code | DECIMAL |
| `stock` | code | INT |
| `origin` | code | VARCHAR |
| `weight`, `length`, `width`, `height` | code | DECIMAL |
| `slug` | migration `002` | VARCHAR(255) NULL |
| `part_knowledge_id` | migration `013` | BIGINT UNSIGNED NULL |

**Indexes on `products` (from migrations):**

| Index | Migration | Columns |
|---|---|---|
| `idx_products_slug_unique` | `002` | `(slug)` UNIQUE |
| `idx_products_shop_updated_id` | `001` | `(shopId, updatedAt, id)` |
| `idx_products_updatedAt_id` | `003` | `(updatedAt, id)` |
| `idx_products_part_knowledge_id` | `013` | `(part_knowledge_id)` |
| Indexes on `partName`, `brand`, `price`, `updatedAt` | `015` | Various |

**Tables used alongside `products`:**

| Table | Role |
|---|---|
| `product_car_applications` | Vehicle fitment (productId, carModelId, year_from, year_to) |
| `product_images` | Product images (productId, url, isPrimary) |
| `product_category_map` | Product→category mapping |
| `car_models` | Vehicle brand/model lookup |
| `shops` | Shop join for city/name |
| `address` | Province/city lookup via `shops.provinceId` |

### 1.3 Derived Product Tables

#### `product_list_view` — migrations `001`, `004`

Denormalized fast-read table for card queries. Updated via `upsertProductListViewRow` on every product write.

| Column | Type | Null | Notes |
|---|---|---|---|
| `productId` | BIGINT | NOT NULL | PK |
| `slug` | VARCHAR(255) | NOT NULL | |
| `partNumber` | VARCHAR(191) | NOT NULL | |
| `partName` | VARCHAR(512) | NOT NULL | |
| `price` | DECIMAL(14,2) | NULL | |
| `thumbnailUrl` | TEXT | NULL | |
| `shopName` | VARCHAR(255) | NOT NULL | |
| `city` | VARCHAR(255) | NULL | |
| `updatedAt` | DATETIME(3) | NOT NULL | |
| `brand_primary` | VARCHAR(191) | NULL | Added in `004` |
| `category_norm` | VARCHAR(512) | NULL | Added in `004` |

**Indexes:**
- `idx_plv_cursor (updatedAt, productId)` — cursor pagination
- `idx_plv_brand_category (brand_primary, category_norm(191))` — filter

**Upsert strategy:** Two SQL variants — `FULL_UPSERT` (with `brand_primary`, `category_norm`) with fallback to `LEGACY_UPSERT` on `ER_BAD_FIELD_ERROR`. Schema-adaptive at runtime.

#### `product_aliases` — code only

| Column | Used in |
|---|---|
| `product_id` | `productService.js` |
| alias fields | Keyword search optimization |

Built by `rebuildProductAliasesForProduct` on product sync.

#### `product_meta` — code only

Wide column set; built by `rebuildProductMetaForProduct` on product sync.

#### `product_fitment_score` — code only

Score per `(productId, carModelId, year)` range. Rebuilt by `rebuildProductFitmentScores`.

### 1.4 Category System Tables

#### `product_categories` — `create_product_categories_table.sql` + named migrations

| Column | Type |
|---|---|
| `id` | INT UNSIGNED PK AUTO_INCREMENT |
| `category_key` | VARCHAR(100) UNIQUE |
| `category_name` | VARCHAR(255) |
| `category_slug` | VARCHAR(255) UNIQUE |
| `canonical_name` | VARCHAR(255) NULL |
| `canonical_slug` | VARCHAR(255) NULL |
| `h1`, `seo_title`, `seo_desc` | SEO fields |
| `menu_order`, `product_count` | INT UNSIGNED |
| `is_active`, `is_menu`, `approved` | TINYINT(1) |
| `is_searchable`, `search_priority` | Search control |

**Indexes:** `idx_menu_order`, `idx_slug`, `idx_canonical_slug`, `idx_active`, `idx_menu`, `idx_search`

#### `product_category_map` — code only

Maps `product_id` → `category_id`. No migration — production DB only.

#### `category_dictionary` — `create_category_dictionary.sql`

Keyword → canonical category mapping. Fields: `match_keyword`, `canonical_name`, `canonical_slug`, `priority`, `is_active`.

**Indexes:** `idx_match_keyword_slug (match_keyword, canonical_slug)`, `idx_priority`

#### `category_dictionary_queue` — `create_category_dictionary_queue.sql`

Admin review queue for unrecognized category terms.  
Fields: `raw_name`, `normalized_name`, `hit_count`, `status ENUM(pending,reviewed,approved,rejected)`.

#### `category_seo_content` — migration `015`

SEO content per category profile type. 15 content columns (title, description, overview, buying_guide, maintenance_tips, faq_data, related_categories, OG fields).  
`profile_type ENUM(brake,filter,ignition,suspension,lighting,engine,transmission,exhaust,cooling,default)`.

#### `category_relationships` — migration `015`

Scored co-occurrence relationships between category pairs.

#### `category_faq` — migration `015`

FAQ entries per category. `question_type ENUM(generated,user,admin)`.  
**FK:** → `category_seo_content(category_name)` CASCADE.

#### `category_analytics` — migration `015`

Daily aggregate: `page_views`, `unique_visitors`, `avg_time_on_page`, `bounce_rate`, `conversion_rate`.  
**UNIQUE:** `(category_name, date)`.

> **Note:** Migration `015` also installs: a **VIEW** `category_stats_view` on `products`, a **TRIGGER** `tr_update_category_stats_after_product_update` AFTER UPDATE on `products`, and a **PROCEDURE** `sp_refresh_category_relationships()`.

### 1.5 Part Knowledge Tables

#### `part_knowledge` — effective schema after migration `011` rebuild

`011` creates `part_knowledge_new`, migrates data, drops and renames. **Authoritative post-rebuild schema** has 40+ columns including:

| Column group | Columns |
|---|---|
| Identity | `id` BIGINT UNSIGNED PK AUTO_INCREMENT, `slug` VARCHAR(191) UNIQUE |
| Names | `name_vi`, `name_en`, `canonical_name`, `aliases_json` JSON, `regional_aliases_json` JSON |
| Content | `summary` TEXT, `body` LONGTEXT |
| Classification | `category_tag`, `category_name`, `system_group`, `vehicle_area` |
| Scoring | `seo_priority`, `seo_tier`, `tier_class`, `ai_priority` INT, `search_score` INT, `diagnosis_weight` INT |
| Status | `is_active` TINYINT(1) DEFAULT 1 |
| Style | `style_persona_v2`, `brand_persona_v3`, `buyer_intents_v4` JSON |
| Knowledge text | `function_text`, `structure_text`, `operation_text`, `symptoms_text`, `common_causes_text`, `replace_interval_text`, `warnings_text`, `buying_guide_text`, `garage_notes_text`, `buyer_mistakes_text`, `vn_usage_notes_text`, `faq_text` |
| Structured data | `symptom_keywords_json`, `search_intents_json`, `cross_sell_json` |

**Indexes:**
- `uq_part_knowledge_slug (slug)` UNIQUE
- `idx_part_knowledge_system_group`, `_canonical_name`, `_category_name`, `_seo_priority`, `_seo_tier`, `_ai_priority`, `_search_score`
- `ft_part_knowledge_text (canonical_name, name_vi, name_en, summary, body)` FULLTEXT

### 1.6 SEO Tables

#### `seo_routes` — migration `014`

| Column | Type | Notes |
|---|---|---|
| `id` | BIGINT UNSIGNED PK | |
| `slug` | VARCHAR(191) | UNIQUE |
| `h1` | VARCHAR(255) | |
| `part_knowledge_id` | BIGINT UNSIGNED | FK (not declared) |
| `car_model_id` | BIGINT UNSIGNED NULL | |
| `page_type` | VARCHAR(50) DEFAULT `'part'` | |
| `canonical_url` | VARCHAR(255) NULL | |
| `priority_score` | INT DEFAULT 0 | |
| `is_active` | TINYINT(1) DEFAULT 1 | |

**Indexes:** `uq_seo_routes_slug`, `idx_seo_routes_part_knowledge`, `_car_model`, `_page_type`, `_active`

#### `seo_page_cache` — migration `014`

| Column | Type |
|---|---|
| `id` | BIGINT UNSIGNED PK |
| `route_id` | BIGINT UNSIGNED UNIQUE |
| `title`, `meta_description` | Text |
| `intro_html`, `article_html` | LONGTEXT |
| `faq_json` | JSON |
| `updated_at` | DATETIME ON UPDATE |

#### `vehicle_seo_content` — code only

Referenced in `vehicleSeo.service.js`. Not in migrations — production DB only.

### 1.7 Shop Tables

#### `shops` — columns known from `initDB.js` + migration `040` + `045`

| Column group | Migration | Columns |
|---|---|---|
| Base | `initDB.js` | `id`, `userId`/`accountId`, `name`, `avatar`, `cover`, `phone`, `email`, `zalo`, `website`, `provinceId`, `districtId`, `wardId`, `addressDetail`, `descriptionHtml`, `salePolicy`, `warrantyPolicy`, `createdAt`, `updatedAt` |
| Activity | `020` | `last_seen_at` DATETIME(3) |
| Storefront | `040` | `slug` VARCHAR(191) UNIQUE, `public_status` ENUM('draft','public','disabled','suspended'), `bio`, `intro_html`, `cover_image`, `facebook_url`, `zalo_phone`, `working_hours`, `lat`, `lng`, `map_embed_url`, `verified_at`, `published_at` |
| Founded | `045` | `founded_year` SMALLINT NULL |

**Indexes from migrations:** `idx_shops_last_seen`, `UNIQUE idx_shops_slug`, `INDEX idx_shops_slug_status (slug, public_status)`

**Note:** `model/shop.model.js` also references `zalo_phone`, `descriptionHtml`, `salePolicy`, `warrantyPolicy` — confirming these exist in production.

#### `shop_storefront_events` — migration `043`

| Column | Type |
|---|---|
| `id` | BIGINT UNSIGNED PK AUTO_INCREMENT |
| `shop_id` | INT NOT NULL |
| `event_type` | VARCHAR(32) NOT NULL |
| `occurred_at` | DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) |
| `metadata_json` | JSON NULL |

**FK:** `fk_sse_shop` → `shops(id)` CASCADE  
**Index:** `idx_sse_shop_type_at (shop_id, event_type, occurred_at)` — composite, well-suited for seller dashboard aggregates

### 1.8 Auth Tables

#### `shop_accounts` — production DB (only ALTER in `038`)

`status` ENUM extended to: `pending, active, blocked, suspended, deleted` DEFAULT `pending`.

#### `shop_refresh_tokens` — migration `038`

Fields: `account_id`, `token_hash` CHAR(64), `expires_at`, `revoked_at`, `user_agent`, `ip`.  
**FK:** → `shop_accounts(id)` CASCADE.

#### `shop_password_reset_tokens` — migration `038`

Fields: `account_id`, `token_hash` CHAR(64), `expires_at`, `used_at`.  
**FK:** → `shop_accounts(id)` CASCADE.

#### `password_reset_tokens` — migration `039` (canonical rename)

Same as above + `ip_address`. FK → `shop_accounts`.

#### `auth_logs` — migration `039`

Fields: `account_id` INT NULL, `event_type`, `ip_address`, `user_agent`, `metadata_json` JSON.  
**No FK** — account_id not constrained.

### 1.9 RFQ Subsystem Tables

#### Core flow tables

| Table | Created | Key columns |
|---|---|---|
| `customer_profiles` | `020` | `phone_e164` UNIQUE, `phone_hash` CHAR(64) UNIQUE, `status ENUM(active,blocked)`, `deleted_at` |
| `customer_vehicles` | `020` | `customer_profile_id` FK→`customer_profiles`, `brand_label`, `model_label`, `year`, `car_model_id` |
| `rfq_requests` | `020` + `021,023,028,034,044` | See below |
| `rfq_dispatches` | `020` + `021,034` | See below |
| `rfq_quotes` | `020` + `021,022` | `dispatch_id` UNIQUE, `line_type ENUM` |
| `rfq_notifications` | `020` | Channel/status/recipient/payload |
| `rfq_status_logs` | `020` | Audit trail |
| `rfq_customer_events` | `023` | `event_type`, FK→`rfq_requests` CASCADE |
| `rfq_escalation_jobs` | `022` | Zalo job queue with `locked_until`, `SKIP LOCKED` |
| `rfq_auto_wave_jobs` | `024` | Wave scheduling; **no `SKIP LOCKED`** — documented race risk |
| `rfq_push_subscriptions` | `025–027,036` | OneSignal subscriptions, viewer token, push preferences |
| `rfq_push_sent_log` | `036` | Dedup log; UNIQUE `(rfq_request_id, event_type, event_key)` |
| `rfq_conversations` | `029` | UNIQUE `dispatch_id`; FK→dispatches |
| `rfq_messages` | `029` + `031` | conversation_id, sender_type ENUM, attachments_json |
| `rfq_conversation_reads` | `030` | Read cursors; UNIQUE `(conversation_id, participant_type, participant_shop_id)` |
| `rfq_message_attachments` | `032` | FK→messages + conversations |
| `rfq_history_otp_challenges` | `035` | Buyer history portal OTP |
| `rfq_history_sessions` | `035` | Buyer history portal sessions |
| `rfq_reminder_sends` | `037` | Reminder attribution |
| `rfq_reminder_outcomes` | `037` | Outcome tracking |
| `rfq_assist_events` | `041` | AI assist UI analytics |

#### `rfq_requests` — full column inventory

**Base columns (`020`):** `id` BIGINT PK, `public_id` CHAR(20) UNIQUE, `viewer_token_hash` CHAR(64) UNIQUE, `status ENUM(pending_otp,open,dispatching,quoted,closed,expired,cancelled)`, `customer_profile_id` FK→`customer_profiles`, `guest_phone_e164`, `guest_phone_hash` CHAR(64), `otp_code_hash`, `otp_expires_at`, `otp_attempts`, `vehicle_json` JSON, `part_description` TEXT, `category_key`, `location_json` JSON, `images_json` JSON, `expires_at`, `verified_at`, `deleted_at`, `created_at`, `updated_at`.

**Added columns (later migrations):**

| Column | Migration | Type |
|---|---|---|
| `dedupe_fingerprint` | `021` | CHAR(64) NULL |
| `spam_flag` | `023` | TINYINT(1) DEFAULT 0 |
| `vehicle_brand_norm` | `028` | VARCHAR(128) **GENERATED STORED** from `vehicle_json` |
| `vehicle_model_norm` | `028` | VARCHAR(128) **GENERATED STORED** |
| `vehicle_year` | `028` | SMALLINT UNSIGNED **GENERATED STORED** |
| `first_shop_message_at` | `034` | DATETIME(3) NULL |

**Indexes:** `uq_rfq_public_id`, `uq_rfq_viewer_hash`, `idx_rfq_status_created`, `idx_rfq_customer`, `idx_rfq_dedupe_created`, `idx_rfq_spam`, `idx_rfq_vehicle_brand`, `idx_rfq_vehicle_model`, `idx_rfq_vehicle_year`, `idx_rfq_category_key`, `idx_rfq_guest_phone_e164`

#### `rfq_dispatches` — full column inventory

**Base (`020`):** `id` BIGINT PK, `rfq_request_id`, `shop_id` INT, `wave` INT, `status ENUM(pending,web_notified,viewed,accepted,quoted,skipped,expired,failed)`, `escalation_level`, `web_notified_at`, `web_viewed_at`, `zalo_notified_at`, `sms_notified_at`, `match_score`, `respond_by`, `created_at`, `updated_at`.

**Added:** `first_viewed_at`, `view_count` (`021`); `first_shop_message_at` (`034`).

**UNIQUE:** `uq_dispatch_rfq_shop (rfq_request_id, shop_id)`  
**FKs:** → `rfq_requests` (CASCADE), → `shops(id)` (RESTRICT)

### 1.10 Analytics Tables

| Table | Migration | Contents |
|---|---|---|
| `shop_storefront_events` | `043` | Per-event rows: `event_type`, `metadata_json`, `occurred_at` |
| `rfq_customer_events` | `023` | Per-event rows: funnel stage events |
| `rfq_reminder_outcomes` | `037` | Attribution: `opened`, `converted`, `dismissed`, `opt_out` |
| `rfq_assist_events` | `041` | AI assist: `impression`, `click`, `selected`, `deselected`, `dismissed` |
| `category_analytics` | `015` | Daily page view aggregates (no automated ingest wired) |

**Analytics event type contracts:**

| Domain | Allowlisted event types |
|---|---|
| Storefront | `storefront_view`, `product_click`, `phone_click`, `zalo_click`, `facebook_click`, `share_click`, `share_complete`, `share_copy`, `rfq_cta_click`, `storefront_impression`, `shop_card_click`, `directory_search`, `directory_filter` |
| RFQ buyer | `customer_token_open`, `customer_quotes_surface_view` |
| RFQ reminders | `opened`, `converted` (kinds: `reopen`, `quote_view`, `buyer_message`), `dismissed`, `opt_out` |

---

## 2. Product Data Lifecycle

### Creation Flow

```
POST /api/shop/products
  → shop.controller.js (auth middleware verifies shopId)
     → product.service.js: createProduct(shopId, data)
        │
        ├─ 1. BEGIN TRANSACTION
        │
        ├─ 2. INSERT INTO products (shopId, partNumber, partName, stock,
        │                          price, origin, shortDescription,
        │                          description, weight, length, width, height)
        │     → gets insertId
        │
        ├─ 3. Slug generation:
        │     buildSeoProductSlug(product) → slugifyVi(partName+brand+model)
        │     UPDATE products SET slug WHERE id
        │
        ├─ 4. Vehicle fitment (if cars provided):
        │     DELETE FROM product_car_applications WHERE productId
        │     INSERT INTO product_car_applications (productId, carModelId, year_from, year_to)
        │     INSERT IGNORE INTO car_model_attributes
        │     INSERT INTO car_model_specs … ON DUPLICATE KEY UPDATE
        │
        ├─ 5. Images: stored on R2; URLs saved in product_images
        │
        ├─ 6. COMMIT
        │
        ├─ 7. Sync product_list_view (UPSERT):
        │     syncProductListViewByProductId(productId)
        │       → reads product+shop+address JOIN
        │       → upsertProductListViewRow (FULL → LEGACY fallback)
        │
        ├─ 8. Sync Typesense:
        │     queueUpsertProductInTypesense(productId)
        │       → loadProductRowForTypesense (GROUP_CONCAT brands/models)
        │       → upsertDoc to otofine_products collection
        │
        └─ 9. Rebuild derived tables (productService.js):
              rebuildProductAliasesForProduct → product_aliases
              rebuildProductMetaForProduct    → product_meta
              rebuildProductFitmentScores     → product_fitment_score
```

### Validation

- Validated at `shop.controller.js` layer before service call
- `part_knowledge_id` optionally linked (set during sync or admin assignment)
- Slug uniqueness enforced by `UNIQUE idx_products_slug_unique` — duplicate slug silently replaced on DUPLICATE KEY UPDATE patterns

### Slug Generation

Frontend (`lib/seo/productSeoUrl.js`) and backend (`utils/productSlug.js`) independently implement `slugifyVi`. Both produce `{slug}-{id}` for canonical URL. The backend generates on product write; the frontend derives at render time. Divergence between the two implementations would create a permanent redirect loop at `app/[slug]/page.js`.

### SEO Derivation

```
product.part_knowledge_id (FK)
  → part_knowledge (slug, canonical_name, body, aliases_json, ...)
     → seoComposer.js: composePartArticle(part)
        → profile-aware HTML ~1100+ words
        → intro_html paragraph
     → seoSlugResolver.service.js: resolveSeoSlugWithRanking(slug)
        → scores active part_knowledge rows vs slug variants
        → matches to seo_routes table
        → ⚠️ loads ENTIRE active part_knowledge catalog on every resolve

seo_routes (slug, h1, part_knowledge_id, car_model_id)
  → seo_page_cache (intro_html, article_html, faq_json)
     → rebuilt by nightlyRebuild or admin trigger
```

### Storefront Visibility

Product is visible on storefront when:
1. `shops.public_status = 'public'`
2. `products.shopId = shops.id`
3. No explicit `stock` filter (stock nullable, `COALESCE(stock,0) > 0` optional)

Products are not independently published/unpublished — shop-level `public_status` is the gate.

### Product Sync to `product_list_view`

`upsertProductListViewRow` is called on:
- Product create
- Product update
- Shop field changes (`updateShopFieldsForShop` bulk-updates `shopName`, `city` for all products of a shop)
- Nightly rebuild (`nightlyRebuild.js` → O(n) full iteration)

Two upsert templates exist (`FULL_UPSERT` with `brand_primary`/`category_norm`, `LEGACY_UPSERT` without). Runtime fallback on `ER_BAD_FIELD_ERROR` — the view table schema determines which is active.

### RFQ Usage of Products

Products are not directly referenced in RFQ tables. RFQ uses `part_description` (free text), `category_key`, and `vehicle_json`. Products surface in RFQ dispatching via `pickShopIdsForMatching` which queries the `products` table to find candidate shops by `shopId`.

### Analytics Usage of Products

Products are referenced in `shop_storefront_events.metadata_json` as `$.productId` (JSON extraction). `getTopProductByClicks` in `shopMetrics.service.js` uses `JSON_EXTRACT(metadata_json, '$.productId')` — this cannot use a B-tree index.

---

## 3. Shop Lifecycle

### Creation Flow

```
POST /api/shop/register (auth domain)
  → shopAccount.repository.js: INSERT INTO shop_accounts (email/phone, passwordHash)
     → status = 'pending'

POST /api/shop/me (first setup)
  → shop.controller.js → Shop.create(accountId, name, phone, ...)
     → INSERT INTO shops (accountId, name, avatar, cover, phone, ...)
     → returns shopId

  → shopProfile.repository.js: findShopIdByAccountId(accountId)
     → bridges shop_accounts.id → shops.accountId
```

### Slug & Subdomain Generation

```
POST /api/shop/public-page/check-slug (seller center)
  → sellerPublicPage.controller.js → sellerPublicPage.service.js
     → sellerPublicPage.repository.js: findShopIdBySlug(slug)
     → if not taken: return available

PATCH /api/shop/public-page
  → updatePublicPageConfig(shopId, { slug, bio, intro_html, ... })
     → UPDATE shops SET slug, bio, ... WHERE id
     → if status becomes 'public':
       published_at = COALESCE(published_at, NOW())
                      (first-publish timestamp preserved)
```

Slug validation uses `SLUG_REGEX` — must match frontend's `SUBDOMAIN_SLUG_REGEX` in `shopHost.js`. Both are defined independently.

### Storefront Activation

```
shops.public_status transitions:
  draft → public   (seller sets via /api/shop/public-page)
  public → disabled (seller disables)
  any → suspended  (admin action via /api/admin/shops)
```

**Visibility gate:** Every storefront API call routes through `findPublicShopBySlug` which requires `public_status = 'public'`. No partial visibility — any non-`public` status makes the entire storefront inaccessible.

**SEO indexing gate** (additional):
- Backend: `seoEligible` computed in `shopPublic.service.js` (pure JS, no extra query)
- Frontend: `buildShopMetadata` sets `robots: noindex,nofollow` unless `NEXT_PUBLIC_SHOPSITE_INDEX_ENABLED=1` AND `shop.seoEligible=true`

### Zalo Dual-Column Pattern

`shops` has both `zalo` and `zalo_phone` columns. Write paths mirror both:
- `shop.controller.js` (legacy write): mirrors `zalo` → `zalo_phone`
- `sellerPublicPage.service.js`: mirrors `zalo_phone` → `zalo` on update

Read paths use `COALESCE(NULLIF(zalo,''), NULLIF(zalo_phone,''))`. Both columns must stay in sync.

### Analytics Dependencies

Shop activity triggers events in:
1. `shop_storefront_events` — every buyer page view, click, CTA
2. `rfq_dispatches` — RFQ receives, views, quotes
3. `shop_refresh_tokens`, `auth_logs` — seller login events

`shopMetrics.service.js` aggregates across all three sources in parallel on every `/api/shop/metrics/overview` request.

---

## 4. Query Hotspots

### 4.1 Storefront SSR Queries

Every storefront page render (`revalidate: 60`) executes this fetch chain:

**Shop page load** — `findPublicShopBySlug`:
```sql
SELECT s.*, a.tinh_tp
FROM shops s
LEFT JOIN address a ON a.id = s.provinceId
WHERE s.slug = ? AND s.public_status = 'public'
LIMIT 1
```
**Frequency:** Every unique shop SSR miss (every 60s per slug). Index: `(slug)` + `public_status` filter.

**Parallel page fetches** — all execute concurrently per SSR render of shop homepage/san-pham:

| Query | Table | Key columns |
|---|---|---|
| Product count | `products` | `WHERE shopId = ?` |
| Top brands | `product_car_applications` + `car_models` + `products` | `p.shopId`, GROUP BY `hang_xe` |
| Categories | `products` + `product_category_map` + `product_categories` | `p.shopId`, GROUP BY `pc.id` |
| Fitment options | `products` + `product_car_applications` + `car_models` | `p.shopId`, DISTINCT brand/model |
| Shop products list | Dynamic (see §4.2) | `p.shopId` + optional filters |

All five queries run in `Promise.all` — any slow query blocks the full SSR render.

### 4.2 Product Listing Queries

**Card path** (`product_list_view` — when no filters and view exists):
```sql
SELECT v.productId, v.slug, v.partNumber, v.partName, v.price,
       v.thumbnailUrl, v.shopName, v.city, v.updatedAt
FROM product_list_view v
[WHERE cursor]
ORDER BY v.updatedAt DESC, v.productId DESC
LIMIT ?
```
Index: `idx_plv_cursor (updatedAt, productId)` — **well covered**.

**Live card path** (with filters or view unavailable):
```sql
FROM products p
INNER JOIN shops s ON ...
LEFT JOIN address ap ON ap.id = s.provinceId
[+ optional EXISTS on product_car_applications + car_models]
WHERE
  [category: REGEXP on LOWER(TRIM(REGEXP_REPLACE(p.partName,...)))]
  [brand/model: EXISTS (SELECT ... WHERE LOWER(TRIM(cm.hang_xe)) = ?)]
  [location: LOWER(TRIM(ap.tinh_tp)) = ?]
  [keyword: LOWER(p.partName) LIKE ? OR LOWER(p.partNumber) LIKE ?
            OR LOWER(p.shortDescription) LIKE ?]
  [cursor: (p.updatedAt, p.id) < (?, ?)]
ORDER BY {schema-derived expr} DESC, p.id DESC
LIMIT ?
```
**Index risk:** All LOWER/TRIM/REGEXP expressions prevent B-tree use. Keyword LIKE `%...%` is a full scan.

**Shop product list** (`shopPublicProducts.repository.js`):
```sql
FROM products p
[LEFT JOIN part_knowledge pk ON pk.id = p.part_knowledge_id]
[LEFT JOIN product_category_map pcm ON pcm.product_id = p.id]
[LEFT JOIN product_categories pc ON pc.id = pcm.category_id]
[+ fitment JOINs]
WHERE p.shopId = ?
[+ optional LIKE / category / brand / model / year filters]
[GROUP BY p.id  -- when filters use 1-N joins]
ORDER BY {price|createdAt} {ASC|DESC}
LIMIT ? OFFSET ?
```
Plus per-row correlated subqueries for: thumbnail (`product_images`), category label (`product_category_map`), fitment label (`product_car_applications`).

**Product listing count** (`countProductList`):
```sql
SELECT COUNT(DISTINCT p.id)
FROM products p
INNER JOIN product_category_map pcm ON pcm.product_id = p.id
INNER JOIN product_categories pc ON ...
LEFT JOIN product_car_applications pa ON ...
LEFT JOIN car_models cm ON ...
JOIN shops s ON ...
JOIN address ap ON ...
WHERE [same filter as list]
```
**Index risk:** `COUNT(DISTINCT p.id)` over full join graph even when filters are sparse.

### 4.3 RFQ Inbox Queries

**`listInboxForShop`** — most complex query in the system:

```sql
SELECT d.*, r.*,
  [EXISTS subquery: rfq_quotes by dispatch_id]
  [EXISTS subquery: rfq_conversations by dispatch_id]
  [subquery: last message content+time]
  [subquery: unread message count]
  [subquery: buyer prior RFQ count to this shop]  ← correlated per row
  [subquery: buyer prior dispatch count]          ← correlated per row
FROM rfq_dispatches d
INNER JOIN rfq_requests r ON r.id = d.rfq_request_id
WHERE d.shop_id = ?
  AND r.deleted_at IS NULL
  AND COALESCE(r.spam_flag,0) = 0
  [+ dynamic filters: status, first_viewed_at, vehicle_norms, category]
ORDER BY [dynamic: activity|created|vehicle] [ASC|DESC]
LIMIT ? OFFSET ?
```

At `sort=activity`, 3+ correlated subqueries execute per dispatch row. A seller with 100 open RFQs triggers ~300+ subqueries per inbox load.

**`countInboxUnread`**:
```sql
SELECT COUNT(*) FROM rfq_dispatches d
INNER JOIN rfq_requests r ON ...
WHERE d.shop_id = ?
  AND d.first_viewed_at IS NULL
  AND r.deleted_at IS NULL
  AND COALESCE(r.spam_flag,0) = 0
```

### 4.4 Seller Dashboard Queries

`getShopMetricsOverview(shopId)` runs 10 queries in `Promise.all`:

| Metric | Query | Index requirement |
|---|---|---|
| `countProducts` | `SELECT COUNT(*) FROM products WHERE shopId = ?` | `products(shopId)` |
| `countRfqReceived` | `rfq_dispatches JOIN rfq_requests` + 30d window | `(shop_id, created_at)` on dispatches |
| `countRfqReceivedToday` | Same + `d.created_at >= CURDATE()` | Same |
| `countOutOfStockProducts` | `products WHERE shopId AND COALESCE(stock,0) <= 0` | `(shopId)` |
| `countShopEventsToday` | `shop_storefront_events WHERE shop_id AND occurred_at >= CURDATE() GROUP BY event_type` | `idx_sse_shop_type_at` ✓ |
| `countReturningBuyersToday` | `rfq_dispatches JOIN rfq_requests` + EXISTS prior phone match | `guest_phone_e164` on requests |
| `countHotRfqsToday` | `rfq_dispatches + rfq_requests + rfq_conversations + rfq_messages` + EXISTS buyer messages | Multi-table EXISTS |
| `getTopProductByClicks` | `shop_storefront_events` GROUP BY `JSON_EXTRACT(metadata_json,'$.productId')` | ⚠️ No index on JSON path |
| `resolveProductName` | `products WHERE id = ?` | PK ✓ |
| `countActiveConversations` | `rfq_conversations + rfq_dispatches + rfq_messages` + buyer messages in 7d window | `(conversation_id, sender_type, created_at)` |

All 10 queries fire simultaneously per dashboard load. No caching beyond `Cache-Control: private, max-age=30` at HTTP layer.

### 4.5 Analytics Queries

**`rfqAnalytics.service.js`** — admin analytics funnel (not cached):

| Function | Query count | Heaviest operation |
|---|---|---|
| `getRfqFunnelAnalytics` | 7× COUNT on `rfq_requests` | EXISTS on quotes + customer events; derived GROUP BY on dispatches/quotes |
| `getSellerPerformanceAnalytics` | 1 large GROUP BY | `d JOIN r JOIN shops` GROUP BY shop_id + SUM/AVG |
| `getSellerNotificationAckRate` | 1 COUNT | Filter on `web_notified_at >= window` |
| `getRfqUxAnalytics` | 4× COUNT DISTINCT | Returning profiles subquery; event type filtering |

Each analytics call repeats the base cohort filter: `r.deleted_at IS NULL AND COALESCE(r.spam_flag,0)=0 AND r.created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)`. No analytics summary table exists.

**`shopMetrics.service.js` — `getTopProductByClicks`:**
```sql
SELECT JSON_EXTRACT(metadata_json, '$.productId') AS pid, COUNT(*) AS c
FROM shop_storefront_events
WHERE shop_id = ?
  AND event_type = 'product_click'
  AND occurred_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
GROUP BY pid
ORDER BY c DESC, pid ASC
LIMIT 50
```
JSON extraction is performed after the `(shop_id, event_type, occurred_at)` filter — the composite index covers the filter, but grouping on extracted JSON value cannot use an index.

**`rfqReminderAttribution.repository.js`:**
```sql
WHERE JSON_CONTAINS(subscription_ids, JSON_QUOTE(?))
```
`JSON_CONTAINS` on a JSON array column cannot use a B-tree index. Full scan within the time window filter.

### 4.6 SEO Queries

**`seoSlugResolver.service.js`** — called on every SEO page request:
```sql
SELECT id, slug, name_vi, aliases_json, seo_priority
FROM part_knowledge
WHERE is_active = 1
```
Loads the **entire active `part_knowledge` catalog** into memory on every slug resolution call. No in-process caching observed at structure-audit level.

**`seoPage.service.js`** — product block for SEO pages:
```sql
FROM products p
LEFT JOIN product_car_applications pca ON pca.productId = p.id
LEFT JOIN car_models cm ON cm.id = pca.carModelId
WHERE [EXISTS brand/model/year filter]
LIMIT 24
```
Fallback slug matching:
```sql
WHERE LOWER(CONCAT_WS(' ', p.partName, p.shortDescription)) LIKE CONCAT('%', ?, '%')
```
Full table scan on products for fallback path.

**`seo.controller.js`** — sitemap data:
```sql
SELECT DISTINCT partName FROM products LIMIT 5000
```
Distinct scan on unindexed text column, capped at 5000.

### 4.7 Background Job Queries

**`nightlyRebuild.js`** — O(n) full iteration:
```sql
SELECT id FROM products ORDER BY id
SELECT id FROM car_models ORDER BY id
SELECT id FROM part_knowledge ORDER BY id
```
Then for each row: `syncProduct(id)` → `rebuildProductAliasesForProduct` + `rebuildProductMetaForProduct` + `rebuildProductFitmentScores` + `upsertProductListViewRow` + Typesense upsert. Sequential, not batched. Lock time on `products` table proportional to catalogue size.

**Buyer reminder cron** (`rfqBuyerReminder.repository.js`) — three candidate queries:

1. `listInactiveAfterCreationCandidates` — `rfq_requests JOIN rfq_push_subscriptions NOT EXISTS buyer messages`
2. `listUnseenQuoteCandidates` — GROUP BY `r.id` HAVING on `MAX(q.created_at)` vs events subquery
3. `listUnreadMessageCandidates` — multiple derived tables GROUP BY `rfq_request_id`

All three run as part of the same cron tick. No time-window limit observed at structure-audit level beyond the `rfq_push_sent_log` dedup check.

**Escalation job claim** (`rfqEscalationJob.repository.js`):
```sql
SELECT ... FROM rfq_escalation_jobs
WHERE status = 'queued' AND run_at <= NOW()
ORDER BY run_at ASC
LIMIT ?
FOR UPDATE SKIP LOCKED
```
`SKIP LOCKED` prevents worker contention. Index: `(status, run_at)` required.

**Auto-wave job claim** (`rfqAutoWaveJob.repository.js`):
```sql
UPDATE rfq_auto_wave_jobs
SET status = 'processing', locked_until = ...
WHERE status = 'queued' AND run_at <= NOW() AND locked_until < NOW()
LIMIT 1
```
**No `SKIP LOCKED`** — documented race condition between concurrent workers. Two workers can claim the same job if they read before either commits the UPDATE.

---

## 5. Index Audit

### Confirmed Indexes (from migrations)

| Table | Index | Columns | Type |
|---|---|---|---|
| `products` | `idx_products_slug_unique` | `(slug)` | UNIQUE |
| `products` | `idx_products_shop_updated_id` | `(shopId, updatedAt, id)` | |
| `products` | `idx_products_updatedAt_id` | `(updatedAt, id)` | |
| `products` | `idx_products_part_knowledge_id` | `(part_knowledge_id)` | |
| `products` | Various | `(partName, brand, price, updatedAt)` from `015` | |
| `product_list_view` | `idx_plv_cursor` | `(updatedAt, productId)` | |
| `product_list_view` | `idx_plv_brand_category` | `(brand_primary, category_norm(191))` | |
| `shops` | `idx_shops_last_seen` | `(last_seen_at)` | |
| `shops` | `idx_shops_slug_status` | `(slug, public_status)` | |
| `address` | `idx_address_tinh_tp_norm` | `(tinh_tp_norm)` | |
| `address` | `idx_address_tinh_tp_slug` | `(tinh_tp_slug)` | |
| `part_knowledge` | `uq_part_knowledge_slug` | `(slug)` | UNIQUE |
| `part_knowledge` | `ft_part_knowledge_text` | `(canonical_name, name_vi, name_en, summary, body)` | FULLTEXT |
| `part_knowledge` | 7× scalar indexes | system_group, canonical_name, category_name, seo_priority, seo_tier, ai_priority, search_score | |
| `seo_routes` | `uq_seo_routes_slug` | `(slug)` | UNIQUE |
| `seo_routes` | 4× scalar | part_knowledge_id, car_model_id, page_type, active | |
| `product_categories` | `idx_search` | `(is_searchable, approved, search_priority DESC)` | |
| `rfq_requests` | `uq_rfq_public_id`, `uq_rfq_viewer_hash` | `public_id`, `viewer_token_hash` | UNIQUE |
| `rfq_requests` | `idx_rfq_status_created` | `(status, created_at)` | |
| `rfq_requests` | `idx_rfq_vehicle_brand/model/year` | generated cols | |
| `rfq_requests` | `idx_rfq_guest_phone_e164` | `(guest_phone_e164)` | |
| `rfq_dispatches` | `uq_dispatch_rfq_shop` | `(rfq_request_id, shop_id)` | UNIQUE |
| `rfq_dispatches` | `idx_dispatch_shop_status` | `(shop_id, status)` | |
| `rfq_escalation_jobs` | `uq_esc_job_idem` | `(idempotency_key)` | UNIQUE |
| `rfq_escalation_jobs` | `idx_esc_run` | `(status, run_at)` | |
| `shop_storefront_events` | `idx_sse_shop_type_at` | `(shop_id, event_type, occurred_at)` | |
| `customer_profiles` | `uq_customer_profiles_phone_e164`, `uq_phone_hash` | phone_e164, phone_hash | UNIQUE |

### Likely Missing Indexes (from query shape analysis)

| Table | Missing index | Query that needs it | Severity |
|---|---|---|---|
| `product_car_applications` | `(productId)` | EXISTS fitment filter in listing/card/search | HIGH — all filtered product queries |
| `product_car_applications` | `(productId, year_from, year_to)` | Year range EXISTS | HIGH |
| `product_car_applications` | `(carModelId)` | Related products tier 3–5 | MEDIUM |
| `product_images` | `(productId, isPrimary DESC, id ASC)` | Thumbnail correlated subselect | HIGH — fires per card row |
| `product_category_map` | `(product_id)`, `(category_id)` | List JOIN + shop products | HIGH |
| `rfq_dispatches` | `(shop_id, created_at)` | Metrics 30d window queries | HIGH — fires 2× per dashboard load |
| `rfq_dispatches` | `(web_notified_at, shop_id)` | Seller performance analytics | MEDIUM |
| `rfq_requests` | `(guest_phone_hash, deleted_at, status)` | Buyer history lookup | HIGH — buyer history portal |
| `rfq_push_subscriptions` | `(rfq_request_id, pref_reminders)` | Buyer reminder cron candidate selection | HIGH — cron fires frequently |
| `rfq_messages` | `(conversation_id, sender_type, id)` | Unread count aggregates | HIGH |
| `rfq_messages` | `(conversation_id, sender_type, created_at)` | Active conversations metric | HIGH |
| `rfq_conversation_reads` | implicit coverage from UNIQUE | Most read-state queries | LOW — UNIQUE covers |
| `shops` | `(accountId)` | Auth → shop bridge | MEDIUM |
| `shops` | `(provinceId)` | City filter joins | MEDIUM |
| `rfq_auto_wave_jobs` | `(status, run_at)` | Job claim query (mirrors escalation pattern) | HIGH — no SKIP LOCKED, missing index makes race worse |

### Not Indexable by Design

| Pattern | Location | Reason |
|---|---|---|
| `LOWER(col) LIKE '%...%'` | productCard, productList, productSearch MySQL fallback | Leading wildcard; FULLTEXT alternative exists on `part_knowledge` |
| `REGEXP` on `partName` | productCard category filter | REGEXP not B-tree indexable |
| `LOWER(TRIM(cm.hang_xe)) = ?` | All vehicle facet EXISTS | Function on column |
| `LOWER(TRIM(ap.tinh_tp)) = ?` | Location filter (pre-norm columns) | Function on column; `tinh_tp_norm` index exists for normalized path |
| `JSON_EXTRACT(metadata_json, '$.productId')` | shopMetrics top-product query | JSON extraction not indexable |
| `JSON_CONTAINS(subscription_ids, ...)` | rfqReminderAttribution | JSON function |

---

## 6. Dangerous Coupling in Data Layer

### D1. `product_list_view` Write Coupling

Every product write (create/update/delete) must also write to `product_list_view` via `upsertProductListViewRow`. If the view upsert fails silently (catches `ER_NO_SUCH_TABLE`), the card listing serves stale data with no error surfaced to the caller. The view table existence is checked at runtime (`productListViewTableExists`), not at startup.

Additionally, shop field changes (name, city) trigger `updateShopFieldsForShop` which bulk-updates the view for all products of a shop via a multi-table JOIN UPDATE. A slow shop update can lock the view for an extended period.

### D2. Typesense Sync Is Fire-and-Forget

`queueUpsertProductInTypesense` is called on every product write but uses a non-blocking queue. If Typesense is unavailable, product search silently falls back to MySQL — but the Typesense collection drifts from the MySQL source of truth until the next nightly rebuild or manual re-sync. There is no alert or catch-up mechanism visible at structure-audit level.

### D3. Dual Product Service Inconsistency

`product.service.js` (988 lines) handles shop CRUD and uses a legacy `product_cars` table in `getAllProducts`.  
`productService.js` (149 lines) handles derived tables: `product_aliases`, `product_meta`, `product_fitment_score`.

These are two separate files with no shared interface. `product.service.js` calls `productService.js`'s functions as side effects of writes, but `productService.js` does NOT call `product.service.js`. Any caller of `productService.syncProduct` directly does not trigger the shop CRUD guards.

### D4. Category Matching Is Inconsistent Across Three Paths

| Path | Category filter method |
|---|---|
| `productCard.repository.js` | `REGEXP` on folded `partName` — no category table join |
| `productList.repository.js` | JOIN `product_category_map` + `product_categories.category_name` LIKE |
| `productSearch.service.js` (MySQL) | Exact normalized `partName` equality with `REGEXP_REPLACE` |

The same `category` query parameter reaches different SQL logic depending on which path handles the request. Results can differ for the same input.

### D5. `joinVehicleFitment` Parameter Ignored in List Repository

`productList.service.js` computes `joinVehicleFitment` from normalized query params and passes it to `buildProductListingJoinSql`. However, `buildProductListingJoinSql` always includes `product_car_applications` and `car_models` LEFT JOINs regardless of the flag. Category-only queries pay the full fitment join cost even when no vehicle filter is active.

### D6. `seoSlugResolver` Full Catalog Load

`resolveSeoSlugWithRanking` begins with:
```sql
SELECT id, slug, name_vi, aliases_json, seo_priority
FROM part_knowledge WHERE is_active = 1
```
This loads the full active `part_knowledge` catalog into memory on every call. Every SEO page request that goes through slug resolution reads the entire catalog. As the catalog grows, this becomes a memory and latency bottleneck per request.

### D7. `nightlyRebuild` O(n) Sequential Full Iteration

`nightlyRebuild.js` fetches all product IDs then calls `syncProduct(id)` sequentially. Each sync triggers:
- 1× products + shop + address query
- DELETE + INSERT on `product_aliases`
- INSERT … ON DUPLICATE KEY on `product_meta`
- DELETE + INSERT on `product_fitment_score`
- `upsertProductListViewRow` (FULL or LEGACY)
- Typesense upsert

For a catalogue of N products this is N × ~7 queries. No batching. This runs nightly at 03:00 Asia/Ho_Chi_Minh.

### D8. `rfqAutoWave` Race Condition

`rfqAutoWaveJob.repository.js` uses a non-atomic UPDATE claim pattern without `SKIP LOCKED`. Two concurrent workers reading before either commits can both claim the same job row. The `rfqEscalationJob` queue uses `SKIP LOCKED` correctly; auto-wave does not.

### D9. Analytics Coupling via `metadata_json`

`shop_storefront_events.metadata_json` stores `productId` as a JSON key. `shopMetrics.service.js` reads it back with `JSON_EXTRACT`. This creates an invisible contract between the frontend event emission code and the backend analytics queries. Changing the JSON key name in either location breaks analytics silently, with no compile-time or schema enforcement.

### D10. `auth_logs` Has No FK on `account_id`

`auth_logs.account_id` is INT NULL with no foreign key to `shop_accounts`. Deleted accounts leave orphan audit log rows. There is no cascade or cleanup path.

---

## 7. Existing Moderation & Billing Groundwork

### Moderation

The following fields and structures exist in the current production schema that relate to content moderation or account control:

**Account-level moderation:**

| Table | Column | Values | Notes |
|---|---|---|---|
| `shop_accounts` | `status` | `pending, active, blocked, suspended, deleted` | Expanded in migration `038` |
| `shops` | `public_status` | `draft, public, disabled, suspended` | `suspended` added in migration `040` |
| `shops` | `verified_at` | DATETIME NULL | Verified seller gate |

**RFQ spam moderation:**

| Table | Column | Notes |
|---|---|---|
| `rfq_requests` | `spam_flag` TINYINT(1) | Set via admin ops; filters all inbox/analytics queries |
| `rfq_requests` | `deleted_at` | Soft delete; all queries filter `IS NULL` |
| `rfq_requests` | `status = 'cancelled'` | Buyer or system cancellation |
| `rfq_customer_events` | `event_type` | Funnel + abuse signal tracking |
| `rfqAdminOps.service.js` | — | Provides: spam flag, force-close, replay, seller activity inspection |

**Admin routes:**

| Route | Controller | Capability |
|---|---|---|
| `GET /admin/shops` | `adminController.js` | Shop list |
| `PATCH /admin/shops/:id` | `adminController.js` | Shop status update (suspended etc.) |
| `GET /admin/part-knowledge` | `adminController.js` | Part knowledge management |
| `GET /rfq/admin/health` (frontend) | `rfq.admin.routes.js` | RFQ system health |
| `rfq.admin.controller.js` | — | RFQ admin ops (spam, close, replay) |

**No billing tables exist** in any migration or referenced in any service file at structure-audit level. No `subscriptions`, `invoices`, `plans`, `payments`, or equivalent tables are present.

**No content approval queue for products exists.** Products are visible as soon as the shop's `public_status = 'public'`, with no per-product moderation step.

**`category_dictionary_queue`** contains a `status ENUM(pending,reviewed,approved,rejected)` for category term review — this is the only content queue that involves a review workflow beyond account-level shop status.
