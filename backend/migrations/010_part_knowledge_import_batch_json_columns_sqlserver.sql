-- Reusable batch JSON import columns for part_knowledge (SQL Server).
-- Idempotent safety net for environments that missed one of the earlier batch migrations.

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.part_knowledge') AND name = N'name_vi' AND is_nullable = 0
)
  ALTER TABLE dbo.part_knowledge ALTER COLUMN name_vi NVARCHAR(512) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'category_name') IS NULL
  ALTER TABLE dbo.part_knowledge ADD category_name NVARCHAR(255) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'system_group') IS NULL
  ALTER TABLE dbo.part_knowledge ADD system_group NVARCHAR(128) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'seo_priority') IS NULL
  ALTER TABLE dbo.part_knowledge ADD seo_priority INT NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'seo_tier') IS NULL
  ALTER TABLE dbo.part_knowledge ADD seo_tier NVARCHAR(8) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'function_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD function_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'structure_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD structure_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'operation_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD operation_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'symptoms_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD symptoms_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'replace_interval_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD replace_interval_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'warnings_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD warnings_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'buying_guide_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD buying_guide_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'faq_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD faq_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'style_persona_v2') IS NULL
  ALTER TABLE dbo.part_knowledge ADD style_persona_v2 NVARCHAR(64) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'brand_persona_v3') IS NULL
  ALTER TABLE dbo.part_knowledge ADD brand_persona_v3 NVARCHAR(64) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'buyer_intents_v4') IS NULL
  ALTER TABLE dbo.part_knowledge ADD buyer_intents_v4 NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'garage_notes_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD garage_notes_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'buyer_mistakes_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD buyer_mistakes_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'vn_usage_notes_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD vn_usage_notes_text NVARCHAR(MAX) NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE object_id = OBJECT_ID(N'dbo.part_knowledge')
    AND name = N'idx_part_knowledge_seo_priority'
)
  CREATE INDEX idx_part_knowledge_seo_priority ON dbo.part_knowledge (seo_priority);
