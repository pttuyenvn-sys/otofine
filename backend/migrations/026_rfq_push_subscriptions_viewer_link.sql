-- Store viewer plaintext token per push subscription row (deep-link /rfq/t/[token]; not reversible from viewer_token_hash)
-- npm run migrate:rfq:push-viewer-token

SET NAMES utf8mb4;

SET @sch := DATABASE();

SET @exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = @sch AND TABLE_NAME = 'rfq_push_subscriptions' AND COLUMN_NAME = 'viewer_link_token'
);
SET @sql := IF(
  @exists = 0,
  "ALTER TABLE rfq_push_subscriptions ADD COLUMN viewer_link_token VARCHAR(512) NULL AFTER onesignal_subscription_id",
  'SELECT "rfq_push_subscriptions.viewer_link_token exists" AS msg'
);
PREPARE s FROM @sql;
EXECUTE s;
DEALLOCATE PREPARE s;
