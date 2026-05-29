/* Rollback for migration 061 — drop table if exists */
SET @schema := DATABASE();

IF EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = @schema AND TABLE_NAME = 'shop_notifications'
) THEN
  DROP TABLE IF EXISTS shop_notifications;
END IF;

