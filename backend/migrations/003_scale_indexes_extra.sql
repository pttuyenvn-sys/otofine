-- Index bổ sung (chạy thủ công; bỏ qua nếu đã tồn tại — xem thông báo Duplicate).

-- Đồng bộ incremental Typesense / job theo thời gian cập nhật
CREATE INDEX idx_products_updatedAt_id ON products (updatedAt, id);

-- Shop theo user / listing
CREATE INDEX idx_shops_userId ON shops (userId);
