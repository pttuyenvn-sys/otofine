-- Rollback 068 — drop hybrid search indexes (manual)

DROP INDEX ft_products_search_text ON products;
DROP INDEX idx_products_part_number ON products;
DROP INDEX ft_product_meta_keywords ON product_meta;
DROP INDEX idx_product_meta_slug ON product_meta;
