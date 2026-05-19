-- Inbox filter columns (STORED) — avoids JSON_EXTRACT full scans on shop inbox queries.
-- npm run migrate:rfq:vehicle-filter-cols

SET NAMES utf8mb4;

SET @sch := DATABASE();

SET @col := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'rfq_requests' AND COLUMN_NAME = 'vehicle_brand_norm'
);
SET @sql := IF(
  @col = 0,
  "ALTER TABLE rfq_requests
    ADD COLUMN vehicle_brand_norm VARCHAR(128) GENERATED ALWAYS AS (
      NULLIF(LOWER(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(vehicle_json, '$.brand')), ''))), '')
    ) STORED,
    ADD COLUMN vehicle_model_norm VARCHAR(128) GENERATED ALWAYS AS (
      NULLIF(LOWER(TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(vehicle_json, '$.model')), ''))), '')
    ) STORED,
    ADD COLUMN vehicle_year SMALLINT UNSIGNED GENERATED ALWAYS AS (
      CAST(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(vehicle_json, '$.year')), '') AS UNSIGNED)
    ) STORED",
  'SELECT "rfq_requests vehicle filter cols exist" AS msg'
);
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;

SET @idx := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'rfq_requests' AND INDEX_NAME = 'idx_rfq_vehicle_brand'
);
SET @sql2 := IF(
  @idx = 0,
  "ALTER TABLE rfq_requests
    ADD KEY idx_rfq_vehicle_brand (vehicle_brand_norm),
    ADD KEY idx_rfq_vehicle_model (vehicle_model_norm),
    ADD KEY idx_rfq_vehicle_year (vehicle_year),
    ADD KEY idx_rfq_category_key (category_key)",
  'SELECT "rfq_requests vehicle filter indexes exist" AS msg'
);
PREPARE s2 FROM @sql2;
EXECUTE s2;
DEALLOCATE PREPARE s2;
