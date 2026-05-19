-- Buyer push deep-link path for OneSignal notification URL (/rfq/t/…)
-- npm run migrate:rfq:push-viewer-path

SET NAMES utf8mb4;

SET @sch := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @sch
    AND TABLE_NAME = 'rfq_push_subscriptions'
    AND COLUMN_NAME = 'viewer_path'
);
SET @sql := IF(
  @exists = 0,
  'ALTER TABLE rfq_push_subscriptions ADD COLUMN viewer_path VARCHAR(500) NULL',
  'SELECT "rfq_push_subscriptions.viewer_path exists" AS msg'
);
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;
