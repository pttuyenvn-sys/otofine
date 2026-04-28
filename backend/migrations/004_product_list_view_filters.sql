-- Denormalize filter cho product_list_view + index lọc (chạy sau 001).
-- Bỏ qua dòng nếu báo Duplicate column / Duplicate key name.

ALTER TABLE product_list_view
  ADD COLUMN brand_primary VARCHAR(191) NULL COMMENT 'Hãng xe đại diện (MIN hang_xe)' AFTER partName,
  ADD COLUMN category_norm VARCHAR(512) NULL COMMENT 'Key category từ partName' AFTER brand_primary;

CREATE INDEX idx_plv_brand_category ON product_list_view (brand_primary, category_norm(191));

-- Sort theo cursor: migration 001 đã tạo KEY idx_plv_cursor (updatedAt, productId) — không tạo index trùng cột.
