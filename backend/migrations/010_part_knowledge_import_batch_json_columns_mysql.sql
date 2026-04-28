-- Reusable batch JSON import columns for part_knowledge (MySQL).
-- Idempotent safety net for environments that missed one of the earlier batch migrations.

SET @sql = IF(
  EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'part_knowledge'
      AND COLUMN_NAME = 'name_vi'
      AND IS_NULLABLE = 'NO'
  ),
  'ALTER TABLE part_knowledge MODIFY COLUMN name_vi VARCHAR(512) NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'category_name') = 0, 'ALTER TABLE part_knowledge ADD COLUMN category_name VARCHAR(255) NULL AFTER category_tag', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'system_group') = 0, 'ALTER TABLE part_knowledge ADD COLUMN system_group VARCHAR(128) NULL AFTER category_name', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'seo_priority') = 0, 'ALTER TABLE part_knowledge ADD COLUMN seo_priority INT NULL AFTER system_group', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'seo_tier') = 0, 'ALTER TABLE part_knowledge ADD COLUMN seo_tier VARCHAR(8) NULL AFTER seo_priority', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'function_text') = 0, 'ALTER TABLE part_knowledge ADD COLUMN function_text LONGTEXT NULL AFTER seo_tier', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'structure_text') = 0, 'ALTER TABLE part_knowledge ADD COLUMN structure_text LONGTEXT NULL AFTER function_text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'operation_text') = 0, 'ALTER TABLE part_knowledge ADD COLUMN operation_text LONGTEXT NULL AFTER structure_text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'symptoms_text') = 0, 'ALTER TABLE part_knowledge ADD COLUMN symptoms_text LONGTEXT NULL AFTER operation_text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'replace_interval_text') = 0, 'ALTER TABLE part_knowledge ADD COLUMN replace_interval_text LONGTEXT NULL AFTER symptoms_text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'warnings_text') = 0, 'ALTER TABLE part_knowledge ADD COLUMN warnings_text LONGTEXT NULL AFTER replace_interval_text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'buying_guide_text') = 0, 'ALTER TABLE part_knowledge ADD COLUMN buying_guide_text LONGTEXT NULL AFTER warnings_text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'faq_text') = 0, 'ALTER TABLE part_knowledge ADD COLUMN faq_text LONGTEXT NULL AFTER buying_guide_text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'style_persona_v2') = 0, 'ALTER TABLE part_knowledge ADD COLUMN style_persona_v2 VARCHAR(64) NULL AFTER faq_text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'brand_persona_v3') = 0, 'ALTER TABLE part_knowledge ADD COLUMN brand_persona_v3 VARCHAR(64) NULL AFTER style_persona_v2', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'buyer_intents_v4') = 0, 'ALTER TABLE part_knowledge ADD COLUMN buyer_intents_v4 JSON NULL AFTER brand_persona_v3', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'garage_notes_text') = 0, 'ALTER TABLE part_knowledge ADD COLUMN garage_notes_text LONGTEXT NULL AFTER buyer_intents_v4', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'buyer_mistakes_text') = 0, 'ALTER TABLE part_knowledge ADD COLUMN buyer_mistakes_text LONGTEXT NULL AFTER garage_notes_text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND COLUMN_NAME = 'vn_usage_notes_text') = 0, 'ALTER TABLE part_knowledge ADD COLUMN vn_usage_notes_text LONGTEXT NULL AFTER buyer_mistakes_text', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @sql = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'part_knowledge' AND INDEX_NAME = 'idx_part_knowledge_seo_priority') = 0, 'CREATE INDEX idx_part_knowledge_seo_priority ON part_knowledge (seo_priority)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
