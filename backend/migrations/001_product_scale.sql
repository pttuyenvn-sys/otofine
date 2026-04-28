-- Otofine: tối ưu scale catalog (chỉ thêm bảng + index, không đổi cột bảng cũ).
-- Chạy thủ công trên MySQL 8+ (hoặc dùng script backfill sau khi CREATE TABLE).
-- Nếu báo lỗi “Duplicate key name” khi CREATE INDEX, index đó đã tồn tại — bỏ qua dòng tương ứng.

-- ---------------------------------------------------------------------------
-- 1) Bảng denormalized cho API card-list (JOIN nhẹ, không GROUP BY)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_list_view (
  productId BIGINT NOT NULL,
  slug VARCHAR(255) NOT NULL,
  partNumber VARCHAR(191) NOT NULL,
  partName VARCHAR(512) NOT NULL,
  price DECIMAL(14, 2) NULL,
  thumbnailUrl TEXT NULL,
  shopName VARCHAR(255) NOT NULL,
  city VARCHAR(255) NULL,
  updatedAt DATETIME(3) NOT NULL,
  PRIMARY KEY (productId),
  KEY idx_plv_cursor (updatedAt, productId)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- (Tuỳ chọn) Thêm FOREIGN KEY thủ công nếu kiểu cột khớp 100% với products.id:
-- ALTER TABLE product_list_view ADD CONSTRAINT fk_plv_product FOREIGN KEY (productId) REFERENCES products (id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 2) Index bổ trợ (CREATE IF NOT EXISTS chỉ có từ MySQL 8.0.29+ — nếu lỗi duplicate, bỏ qua dòng đó)
-- ---------------------------------------------------------------------------
CREATE INDEX idx_products_shop_updated_id ON products (shopId, updatedAt, id);

CREATE INDEX idx_pca_productId ON product_car_applications (productId);

CREATE INDEX idx_pca_carModelId ON product_car_applications (carModelId);

CREATE INDEX idx_pi_product_primary ON product_images (productId, isPrimary, id);
