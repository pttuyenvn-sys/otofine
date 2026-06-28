# Schema — search_token_index

| Column | Type | Notes |
|--------|------|-------|
| id | BIGINT UNSIGNED | PK |
| token | VARCHAR(255) | Folded token |
| token_type | ENUM | WORD, PHRASE, OEM, BRAND, MODEL, CATEGORY, SYNONYM, LOCATION, YEAR |
| product_id | BIGINT UNSIGNED | FK logical to products |
| weight | SMALLINT UNSIGNED | Ranking hint |
| source | VARCHAR(64) | Origin field |
| position | SMALLINT UNSIGNED | Token position in source |
| document_version | SMALLINT UNSIGNED | Matches search index version |
| updated_at | TIMESTAMP(3) | Auto |

**Unique:** `(product_id, token, token_type)`

Migration: `backend/migrations/074_search_token_index.sql`
