# Execution plans (index group SQL)

## bugi toyota

```sql
SELECT 'vehicle' AS grain, category_id, MAX(category_name) AS canonical_name, MAX(category_slug) AS canonical_slug, MAX(brand_name) AS brand, MAX(model_name) AS model, brand_slug, model_slug, COUNT(DISTINCT product_id) AS total_count FROM product_search_index psi WHERE psi.status = 'active' AND LOWER(TRIM(psi.brand_name)) = ? AND MATCH(psi.search_text) AGAINST (? IN BOOLEAN MODE) AND brand_slug IS NOT NULL AND TRIM(brand_slug) <> '' AND model_slug IS NOT NULL AND TRIM(model_slug) <> '' GROUP BY category_id, category_slug, brand_slug, model_slug HAVING total_count > 0
```

- Rows examined: 0
- Time: 0ms
- Filesort: no
- Temp table: no

```
-> Filter: (total_count > 0)  (cost=1.15 rows=1) (actual time=2.15..2.31 rows=23 loops=1)
    -> Group aggregate: max(psi.category_name), max(psi.category_slug), max(psi.brand_name), max(psi.model_name), count(distinct psi.product_id)  (cost=1.15 rows=1) (actual time=2.15..2.3 rows=23 loops=1)
        -> Sort row IDs: psi.category_id, psi.category_slug, psi.brand_slug, psi.model_slug  (cost=1.05 rows=1) (actual time=2.09..2.22 rows=41 loops=1)
            -> Filter: ((psi.`status` = 'active') and (lower(trim(psi.brand_name)) = 'toyota') and (match psi.search_text against ('+bugi*' in boolean mode)) and (psi.brand_slug is not null) and (trim(psi.brand_slug) <> '') and (psi.model_slug is not null) and (trim(psi.model_slug) <> ''))  (cost=1.05 rows=1) (actual time=0.971..1.84 rows=41 loops=1)
                -> Full-text index search on psi using ft_psi_search_text (search_text='+bugi*')  (cost=1.05 rows=1) (actual time=0.127..0.968 rows=97 loops=1)

```

## má phanh vios

```sql
SELECT 'vehicle' AS grain, category_id, MAX(category_name) AS canonical_name, MAX(category_slug) AS canonical_slug, MAX(brand_name) AS brand, MAX(model_name) AS model, brand_slug, model_slug, COUNT(DISTINCT product_id) AS total_count FROM product_search_index psi WHERE psi.status = 'active' AND LOWER(TRIM(psi.brand_name)) = ? AND LOWER(TRIM(psi.model_name)) = ? AND MATCH(psi.search_text) AGAINST (? IN BOOLEAN MODE) AND brand_slug IS NOT NULL AND TRIM(brand_slug) <> '' AND model_slug IS NOT NULL AND TRIM(model_slug) <> '' GROUP BY category_id, category_slug, brand_slug, model_slug HAVING total_count > 0
```

- Rows examined: 0
- Time: 0ms
- Filesort: no
- Temp table: no

```
-> Filter: (total_count > 0)  (cost=1.15 rows=1) (actual time=0.841..0.955 rows=16 loops=1)
    -> Group aggregate: max(psi.category_name), max(psi.category_slug), max(psi.brand_name), max(psi.model_name), count(distinct psi.product_id)  (cost=1.15 rows=1) (actual time=0.836..0.947 rows=16 loops=1)
        -> Sort row IDs: psi.category_id, psi.category_slug, psi.brand_slug, psi.model_slug  (cost=1.05 rows=1) (actual time=0.794..0.893 rows=22 loops=1)
            -> Filter: ((psi.`status` = 'active') and (lower(trim(psi.brand_name)) = 'toyota') and (lower(trim(psi.model_name)) = 'vios') and (match psi.search_text against ('+ma* +phanh* +vios*' in boolean mode)) and (psi.brand_slug is not null) and (trim(psi.brand_slug) <> '') and (psi.model_slug is not null) and (trim(psi.model_slug) <> ''))  (cost=1.05 rows=1) (actual time=0.0801..0.608 rows=22 loops=1)
                -> Full-text index search on psi using ft_psi_search_text (search_text='+ma* +phanh* +vios*')  (cost=1.05 rows=1) (actual time=0.0653..0.563 rows=26 loops=1)

```

