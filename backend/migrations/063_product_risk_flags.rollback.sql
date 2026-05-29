/* Rollback for migration 063 — drop table if exists */
SET @schema := DATABASE();

IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'product_risk_flags'
) THEN
  DROP TABLE IF EXISTS product_risk_flags;
END IF;

