-- Batch 1 part_knowledge: cột dataset + name_vi nullable (import chỉ có english_name).
-- Chạy: npm run migrate:knowledge (sau khi thêm file vào run-knowledge-migrations.js)

ALTER TABLE part_knowledge
  MODIFY COLUMN name_vi VARCHAR(512) NULL;

ALTER TABLE part_knowledge
  ADD COLUMN category_name VARCHAR(255) NULL AFTER category_tag,
  ADD COLUMN system_group VARCHAR(128) NULL AFTER category_name,
  ADD COLUMN seo_priority INT NULL AFTER system_group,
  ADD COLUMN function_text LONGTEXT NULL AFTER seo_priority,
  ADD COLUMN symptoms_text LONGTEXT NULL AFTER function_text,
  ADD COLUMN replace_interval_text LONGTEXT NULL AFTER symptoms_text,
  ADD COLUMN faq_text LONGTEXT NULL AFTER replace_interval_text,
  ADD KEY idx_part_knowledge_seo_priority (seo_priority);
