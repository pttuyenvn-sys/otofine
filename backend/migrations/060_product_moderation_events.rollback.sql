/* Rollback for migration 060 — drop table if exists */
SET @schema := DATABASE();

IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'product_moderation_events'
) THEN
  DROP TABLE IF EXISTS product_moderation_events;
END IF;

