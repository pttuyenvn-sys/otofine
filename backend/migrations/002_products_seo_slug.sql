-- Thêm cột slug SEO cho products (nullable, unique khi đã gán giá trị).
-- Không drop/rename cột cũ.

ALTER TABLE products
  ADD COLUMN slug VARCHAR(255) NULL COMMENT 'SEO slug, dạng ten-san-pham-{id}';

-- MySQL: nhiều NULL được phép trên UNIQUE — phù hợp giai đoạn rollout.
CREATE UNIQUE INDEX idx_products_slug_unique ON products (slug);
