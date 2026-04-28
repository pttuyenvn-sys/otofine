-- Batch 1 đầy đủ: tier SEO chữ, cấu tạo/vận hành/cảnh báo/mua hàng.
-- Chạy: npm run migrate:knowledge

ALTER TABLE part_knowledge
  ADD COLUMN seo_tier VARCHAR(8) NULL AFTER seo_priority,
  ADD COLUMN structure_text LONGTEXT NULL AFTER function_text,
  ADD COLUMN operation_text LONGTEXT NULL AFTER structure_text,
  ADD COLUMN warnings_text LONGTEXT NULL AFTER replace_interval_text,
  ADD COLUMN buying_guide_text LONGTEXT NULL AFTER warnings_text;
