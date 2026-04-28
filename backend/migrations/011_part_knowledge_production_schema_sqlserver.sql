-- SQL Server 2022 PRODUCTION MIGRATION 10/10
-- Rebuild part_knowledge for Master Dataset + SEO + AI Garage
-- Safe version with backup + canonical naming + indexes + fulltext
-- This file intentionally avoids GO because the Node migration runner sends one batch.

SET XACT_ABORT ON;

BEGIN TRY
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.part_knowledge_backup_2026', 'U') IS NULL
BEGIN
  SELECT *
  INTO dbo.part_knowledge_backup_2026
  FROM dbo.part_knowledge;
END;

IF OBJECT_ID('dbo.part_knowledge_new', 'U') IS NOT NULL
  DROP TABLE dbo.part_knowledge_new;

CREATE TABLE dbo.part_knowledge_new
(
  id BIGINT IDENTITY(1,1) NOT NULL,
  slug NVARCHAR(191) NOT NULL,
  canonical_name NVARCHAR(512) NULL,
  name_vi NVARCHAR(512) NULL,
  name_en NVARCHAR(512) NULL,

  aliases_json NVARCHAR(MAX) NULL,
  regional_aliases_json NVARCHAR(MAX) NULL,

  summary NVARCHAR(MAX) NULL,
  body NVARCHAR(MAX) NULL,

  category_tag NVARCHAR(128) NULL,
  category_name NVARCHAR(255) NULL,
  system_group NVARCHAR(128) NULL,
  vehicle_area NVARCHAR(128) NULL,

  seo_priority NVARCHAR(10) NULL,
  seo_tier NVARCHAR(10) NULL,
  tier_class NVARCHAR(10) NULL,

  ai_priority INT NOT NULL DEFAULT 50,
  search_score INT NOT NULL DEFAULT 50,
  diagnosis_weight INT NOT NULL DEFAULT 50,

  is_active BIT NOT NULL DEFAULT 1,

  style_persona_v2 NVARCHAR(64) NULL,
  brand_persona_v3 NVARCHAR(64) NULL,
  buyer_intents_v4 NVARCHAR(MAX) NULL,

  function_text NVARCHAR(MAX) NULL,
  structure_text NVARCHAR(MAX) NULL,
  operation_text NVARCHAR(MAX) NULL,
  symptoms_text NVARCHAR(MAX) NULL,
  common_causes_text NVARCHAR(MAX) NULL,
  replace_interval_text NVARCHAR(MAX) NULL,
  warnings_text NVARCHAR(MAX) NULL,
  buying_guide_text NVARCHAR(MAX) NULL,
  garage_notes_text NVARCHAR(MAX) NULL,
  buyer_mistakes_text NVARCHAR(MAX) NULL,
  vn_usage_notes_text NVARCHAR(MAX) NULL,
  faq_text NVARCHAR(MAX) NULL,

  symptom_keywords_json NVARCHAR(MAX) NULL,
  search_intents_json NVARCHAR(MAX) NULL,
  cross_sell_json NVARCHAR(MAX) NULL,

  created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME(),

  CONSTRAINT pk_part_knowledge PRIMARY KEY CLUSTERED (id)
);

SET IDENTITY_INSERT dbo.part_knowledge_new ON;

INSERT INTO dbo.part_knowledge_new (
  id,
  slug,
  canonical_name,
  name_vi,
  name_en,
  summary,
  body,
  category_tag,
  category_name,
  system_group,
  seo_priority,
  seo_tier,
  tier_class,
  is_active,
  style_persona_v2,
  brand_persona_v3,
  buyer_intents_v4,
  function_text,
  structure_text,
  operation_text,
  symptoms_text,
  replace_interval_text,
  warnings_text,
  buying_guide_text,
  garage_notes_text,
  buyer_mistakes_text,
  vn_usage_notes_text,
  faq_text,
  created_at,
  updated_at
)
SELECT
  MIN(id) AS id,
  slug,

  COALESCE(
    MAX(NULLIF(name_vi, '')),
    MAX(NULLIF(category_name, '')),
    MAX(NULLIF(name_en, '')),
    slug
  ) AS canonical_name,

  MAX(name_vi) AS name_vi,
  MAX(name_en) AS name_en,

  MAX(summary) AS summary,
  MAX(body) AS body,

  MAX(category_tag) AS category_tag,
  MAX(category_name) AS category_name,
  MAX(system_group) AS system_group,

  CAST(MAX(CAST(seo_priority AS NVARCHAR(10))) AS NVARCHAR(10)) AS seo_priority,
  MAX(seo_tier) AS seo_tier,

  CASE
    WHEN MAX(seo_tier) IN ('A1', 'A2') THEN 'A'
    WHEN MAX(seo_tier) = 'B' THEN 'B'
    ELSE 'C'
  END AS tier_class,

  CASE
    WHEN MAX(CAST(ISNULL(is_published, 1) AS INT)) = 0 THEN 0
    ELSE 1
  END AS is_active,

  MAX(style_persona_v2) AS style_persona_v2,
  MAX(brand_persona_v3) AS brand_persona_v3,
  MAX(buyer_intents_v4) AS buyer_intents_v4,

  MAX(function_text) AS function_text,
  MAX(structure_text) AS structure_text,
  MAX(operation_text) AS operation_text,
  MAX(symptoms_text) AS symptoms_text,
  MAX(replace_interval_text) AS replace_interval_text,
  MAX(warnings_text) AS warnings_text,
  MAX(buying_guide_text) AS buying_guide_text,
  MAX(garage_notes_text) AS garage_notes_text,
  MAX(buyer_mistakes_text) AS buyer_mistakes_text,
  MAX(vn_usage_notes_text) AS vn_usage_notes_text,
  MAX(faq_text) AS faq_text,

  ISNULL(MIN(created_at), SYSDATETIME()) AS created_at,
  ISNULL(MAX(updated_at), SYSDATETIME()) AS updated_at
FROM dbo.part_knowledge_backup_2026
WHERE slug IS NOT NULL AND LTRIM(RTRIM(slug)) <> ''
GROUP BY slug;

SET IDENTITY_INSERT dbo.part_knowledge_new OFF;

CREATE UNIQUE INDEX uq_part_knowledge_slug ON dbo.part_knowledge_new(slug);
CREATE INDEX idx_part_knowledge_canonical_name ON dbo.part_knowledge_new(canonical_name);
CREATE INDEX idx_part_knowledge_system_group ON dbo.part_knowledge_new(system_group);
CREATE INDEX idx_part_knowledge_category_name ON dbo.part_knowledge_new(category_name);
CREATE INDEX idx_part_knowledge_seo_priority ON dbo.part_knowledge_new(seo_priority);
CREATE INDEX idx_part_knowledge_seo_tier ON dbo.part_knowledge_new(seo_tier);
CREATE INDEX idx_part_knowledge_ai_priority ON dbo.part_knowledge_new(ai_priority);
CREATE INDEX idx_part_knowledge_search_score ON dbo.part_knowledge_new(search_score);

IF OBJECT_ID('dbo.part_knowledge_old_2026', 'U') IS NOT NULL
  DROP TABLE dbo.part_knowledge_old_2026;

EXEC sp_rename 'dbo.part_knowledge', 'part_knowledge_old_2026';
EXEC sp_rename 'dbo.part_knowledge_new', 'part_knowledge';

IF NOT EXISTS (
  SELECT 1
  FROM sys.fulltext_catalogs
  WHERE name = 'ftcat_part_knowledge'
)
BEGIN
  CREATE FULLTEXT CATALOG ftcat_part_knowledge AS DEFAULT;
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.fulltext_indexes
  WHERE object_id = OBJECT_ID('dbo.part_knowledge')
)
BEGIN
  CREATE FULLTEXT INDEX ON dbo.part_knowledge
  (
    canonical_name LANGUAGE 1066,
    name_vi LANGUAGE 1066,
    name_en LANGUAGE 1033,
    summary LANGUAGE 1066,
    body LANGUAGE 1066
  )
  KEY INDEX pk_part_knowledge
  WITH CHANGE_TRACKING AUTO;
END;

COMMIT TRANSACTION;

PRINT 'SUCCESS: part_knowledge migrated.';
PRINT 'Next step: import DataPartName.xlsx';

END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0
    ROLLBACK TRANSACTION;

  PRINT 'FAILED';
  PRINT ERROR_MESSAGE();

  THROW;
END CATCH;
