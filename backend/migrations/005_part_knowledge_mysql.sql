-- Otofine Knowledge Engine: bảng part_knowledge (MySQL 8+).
-- Chạy bằng: node scripts/run-knowledge-migrations.js

CREATE TABLE IF NOT EXISTS part_knowledge (
  id BIGINT NOT NULL AUTO_INCREMENT,
  slug VARCHAR(191) NOT NULL,
  name_vi VARCHAR(512) NOT NULL,
  name_en VARCHAR(512) NULL,
  summary TEXT NULL,
  body LONGTEXT NULL,
  category_tag VARCHAR(128) NOT NULL DEFAULT '',
  sort_order INT NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_part_knowledge_slug (slug),
  KEY idx_part_knowledge_category (category_tag),
  KEY idx_part_knowledge_published (is_published)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
