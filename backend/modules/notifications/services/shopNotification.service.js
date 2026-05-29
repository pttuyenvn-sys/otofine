import { pool } from "../../../../config/db.js";

/**
 * Shop notification service — lightweight helpers to insert notifications.
 */

export async function createShopNotification({
  shopId,
  type,
  title,
  body,
  relatedEntityType = null,
  relatedEntityId = null,
}) {
  if (!shopId || !type || !title || !body) return null;
  const [res] = await pool.query(
    `INSERT INTO shop_notifications (shop_id, type, title, body, related_entity_type, related_entity_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [shopId, type, title, body, relatedEntityType, relatedEntityId],
  );
  return res.insertId;
}

export async function notifyProductApproved({ shopId, productId, productName }) {
  const title = "Product approved";
  const body = `Your product "${productName || `#${productId}`}" has been approved and is now visible on the marketplace.`;
  return createShopNotification({
    shopId,
    type: "product_approved",
    title,
    body,
    relatedEntityType: "product",
    relatedEntityId: productId,
  });
}

export async function notifyProductRejected({ shopId, productId, productName, reason, notes }) {
  const title = "Product rejected";
  const body = `Your product "${productName || `#${productId}`}" was rejected${reason ? `: ${reason}` : ""}.${notes ? ` Notes: ${notes}` : ""}`;
  return createShopNotification({
    shopId,
    type: "product_rejected",
    title,
    body,
    relatedEntityType: "product",
    relatedEntityId: productId,
  });
}

export async function notifyProductHidden({ shopId, productId, productName, notes }) {
  const title = "Product hidden";
  const body = `Your product "${productName || `#${productId}`}" has been hidden from public listings.${notes ? ` Notes: ${notes}` : ""}`;
  return createShopNotification({
    shopId,
    type: "product_hidden",
    title,
    body,
    relatedEntityType: "product",
    relatedEntityId: productId,
  });
}

