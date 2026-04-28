-- Otofine Knowledge Engine: bảng part_knowledge (SQL Server).
-- Chạy bằng: DB_ENGINE=mssql node scripts/run-knowledge-migrations.js

IF OBJECT_ID(N'dbo.part_knowledge', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.part_knowledge (
    id BIGINT IDENTITY(1, 1) NOT NULL PRIMARY KEY,
    slug NVARCHAR(191) NOT NULL,
    name_vi NVARCHAR(512) NOT NULL,
    name_en NVARCHAR(512) NULL,
    summary NVARCHAR(MAX) NULL,
    body NVARCHAR(MAX) NULL,
    category_tag NVARCHAR(128) NOT NULL CONSTRAINT DF_part_knowledge_category DEFAULT N'',
    sort_order INT NOT NULL CONSTRAINT DF_part_knowledge_sort DEFAULT 0,
    is_published BIT NOT NULL CONSTRAINT DF_part_knowledge_pub DEFAULT 1,
    created_at DATETIME2 NOT NULL CONSTRAINT DF_part_knowledge_created DEFAULT SYSDATETIME(),
    updated_at DATETIME2 NOT NULL CONSTRAINT DF_part_knowledge_updated DEFAULT SYSDATETIME()
  );
  CREATE UNIQUE INDEX uk_part_knowledge_slug ON dbo.part_knowledge (slug);
  CREATE INDEX idx_part_knowledge_category ON dbo.part_knowledge (category_tag);
  CREATE INDEX idx_part_knowledge_published ON dbo.part_knowledge (is_published);
END;
