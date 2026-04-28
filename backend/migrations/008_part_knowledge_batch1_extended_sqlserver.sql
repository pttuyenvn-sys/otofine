-- Batch 1 extended columns (SQL Server).

IF COL_LENGTH(N'dbo.part_knowledge', N'seo_tier') IS NULL
  ALTER TABLE dbo.part_knowledge ADD seo_tier NVARCHAR(8) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'structure_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD structure_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'operation_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD operation_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'warnings_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD warnings_text NVARCHAR(MAX) NULL;

IF COL_LENGTH(N'dbo.part_knowledge', N'buying_guide_text') IS NULL
  ALTER TABLE dbo.part_knowledge ADD buying_guide_text NVARCHAR(MAX) NULL;
