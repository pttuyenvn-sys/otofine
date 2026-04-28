-- Batch 1 part_knowledge columns (SQL Server). Idempotent ADD.

IF COL_LENGTH(N'dbo.part_knowledge', N'category_name') IS NULL
  ALTER TABLE dbo.part_knowledge ADD category_name NVARCHAR(255) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'system_group') IS NULL
  ALTER TABLE dbo.part_knowledge ADD system_group NVARCHAR(128) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'seo_priority') IS NULL
  ALTER TABLE dbo.part_knowledge ADD seo_priority INT NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'function_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD function_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'symptoms_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD symptoms_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'replace_interval_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD replace_interval_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'faq_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD faq_text NVARCHAR(MAX) NULL;

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'dbo.part_knowledge') AND name = N'name_vi' AND is_nullable = 0
)
  ALTER TABLE dbo.part_knowledge ALTER COLUMN name_vi NVARCHAR(512) NULL;

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.part_knowledge') AND name = N'idx_part_knowledge_seo_priority'
)
  CREATE INDEX idx_part_knowledge_seo_priority ON dbo.part_knowledge (seo_priority);
