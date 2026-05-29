/* Rollback for migration 062 — drop table if exists */
SET @schema := DATABASE();

IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'shop_risk_scores'
) THEN
  DROP TABLE IF EXISTS shop_risk_scores;
END IF;

