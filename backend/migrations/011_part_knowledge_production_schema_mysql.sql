-- Rebuild part_knowledge for Master Dataset + SEO + AI Garage.
-- Idempotent enough for reruns: keeps a stable backup table and rebuilds active table.

CREATE TABLE IF NOT EXISTS part_knowledge_backup_2026 AS
SELECT *
FROM part_knowledge;

DROP TABLE IF EXISTS part_knowledge_new;

CREATE TABLE part_knowledge_new (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(191) NOT NULL,
  name_vi VARCHAR(512) NULL,
  name_en VARCHAR(512) NULL,
  canonical_name VARCHAR(512) NULL,
  aliases_json JSON NULL,
  regional_aliases_json JSON NULL,
  summary TEXT NULL,
  body LONGTEXT NULL,

  category_tag VARCHAR(128) NULL,
  category_name VARCHAR(255) NULL,
  system_group VARCHAR(128) NULL,
  vehicle_area VARCHAR(128) NULL,

  seo_priority VARCHAR(10) NULL,
  seo_tier VARCHAR(10) NULL,
  tier_class VARCHAR(10) NULL,
  ai_priority INT NOT NULL DEFAULT 50,
  search_score INT NOT NULL DEFAULT 50,
  diagnosis_weight INT NOT NULL DEFAULT 50,
  is_active TINYINT(1) NOT NULL DEFAULT 1,

  style_persona_v2 VARCHAR(64) NULL,
  brand_persona_v3 VARCHAR(64) NULL,
  buyer_intents_v4 JSON NULL,

  function_text TEXT NULL,
  structure_text TEXT NULL,
  operation_text TEXT NULL,
  symptoms_text TEXT NULL,
  common_causes_text TEXT NULL,
  replace_interval_text TEXT NULL,
  warnings_text TEXT NULL,
  buying_guide_text TEXT NULL,
  garage_notes_text TEXT NULL,
  buyer_mistakes_text TEXT NULL,
  vn_usage_notes_text TEXT NULL,
  faq_text TEXT NULL,

  symptom_keywords_json JSON NULL,
  search_intents_json JSON NULL,
  cross_sell_json JSON NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_part_knowledge_slug (slug),
  KEY idx_part_knowledge_system_group (system_group),
  KEY idx_part_knowledge_canonical_name (canonical_name),
  KEY idx_part_knowledge_category_name (category_name),
  KEY idx_part_knowledge_seo_priority (seo_priority),
  KEY idx_part_knowledge_seo_tier (seo_tier),
  KEY idx_part_knowledge_ai_priority (ai_priority),
  KEY idx_part_knowledge_search_score (search_score),
  FULLTEXT KEY ft_part_knowledge_text (canonical_name, name_vi, name_en, summary, body)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO part_knowledge_new (
  id,
  slug,
  name_vi,
  name_en,
  canonical_name,
  aliases_json,
  summary,
  body,
  category_tag,
  category_name,
  system_group,
  vehicle_area,
  seo_priority,
  seo_tier,
  tier_class,
  ai_priority,
  search_score,
  diagnosis_weight,
  is_active,
  style_persona_v2,
  brand_persona_v3,
  buyer_intents_v4,
  function_text,
  structure_text,
  operation_text,
  symptoms_text,
  common_causes_text,
  replace_interval_text,
  warnings_text,
  buying_guide_text,
  garage_notes_text,
  buyer_mistakes_text,
  vn_usage_notes_text,
  faq_text,
  symptom_keywords_json,
  search_intents_json,
  cross_sell_json,
  created_at,
  updated_at
)
SELECT
  MIN(id) AS id,
  slug,
  MAX(name_vi) AS name_vi,
  MAX(name_en) AS name_en,
  COALESCE(MAX(name_vi), MAX(category_name)) AS canonical_name,
  NULL AS aliases_json,
  MAX(summary) AS summary,
  MAX(body) AS body,
  MAX(category_tag) AS category_tag,
  MAX(category_name) AS category_name,
  MAX(system_group) AS system_group,
  NULL AS vehicle_area,
  MAX(seo_priority) AS seo_priority,
  MAX(seo_tier) AS seo_tier,
  CASE
    WHEN MAX(seo_tier) IN ('A1', 'A2') THEN 'A'
    WHEN MAX(seo_tier) = 'B' THEN 'B'
    ELSE 'C'
  END AS tier_class,
  50 AS ai_priority,
  50 AS search_score,
  50 AS diagnosis_weight,
  CASE
    WHEN MAX(COALESCE(is_published, 1)) = 0 THEN 0
    ELSE 1
  END AS is_active,
  MAX(style_persona_v2) AS style_persona_v2,
  MAX(brand_persona_v3) AS brand_persona_v3,
  CASE
    WHEN JSON_VALID(MAX(buyer_intents_v4)) THEN MAX(buyer_intents_v4)
    ELSE NULL
  END AS buyer_intents_v4,
  MAX(function_text) AS function_text,
  MAX(structure_text) AS structure_text,
  MAX(operation_text) AS operation_text,
  MAX(symptoms_text) AS symptoms_text,
  NULL AS common_causes_text,
  MAX(replace_interval_text) AS replace_interval_text,
  MAX(warnings_text) AS warnings_text,
  MAX(buying_guide_text) AS buying_guide_text,
  MAX(garage_notes_text) AS garage_notes_text,
  MAX(buyer_mistakes_text) AS buyer_mistakes_text,
  MAX(vn_usage_notes_text) AS vn_usage_notes_text,
  MAX(faq_text) AS faq_text,
  NULL AS symptom_keywords_json,
  NULL AS search_intents_json,
  NULL AS cross_sell_json,
  COALESCE(MIN(created_at), CURRENT_TIMESTAMP) AS created_at,
  COALESCE(MAX(updated_at), CURRENT_TIMESTAMP) AS updated_at
FROM part_knowledge_backup_2026
WHERE slug IS NOT NULL AND TRIM(slug) <> ''
GROUP BY slug;

DROP TABLE IF EXISTS part_knowledge_old_2026;
RENAME TABLE part_knowledge TO part_knowledge_old_2026;
RENAME TABLE part_knowledge_new TO part_knowledge;
