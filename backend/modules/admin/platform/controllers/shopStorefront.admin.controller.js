import {
  getAdminShopStorefront,
  mutateAdminShopStorefront,
} from "../../../../services/adminShopStorefront.service.js";
import { logAdminAction } from "../../index.js";

/**
 * GET /api/admin/platform/shops/:id/storefront
 * :id is shops.id (integer PK) — NOT shop_accounts.id.
 */
export async function getShopStorefront(req, res) {
  try {
    const shopId = Number(req.params?.id);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: "invalid shop id" });
    }

    const storefront = await getAdminShopStorefront(shopId);
    if (!storefront) return res.status(404).json({ error: "shop not found" });

    return res.json({ storefront });
  } catch (err) {
    console.error("[admin:shops:storefront] getShopStorefront error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/admin/platform/shops/:id/storefront
 * Body: { action, slug? }
 */
const STOREFRONT_AUDIT_ACTIONS = Object.freeze({
  publish_storefront: "shop.storefront.publish",
  suspend_storefront: "shop.storefront.suspend",
  restore_storefront: "shop.storefront.restore",
  unpublish_storefront: "shop.storefront.unpublish",
  submit_review: "shop.storefront.submit_review",
});

export async function postShopStorefront(req, res) {
  try {
    const shopId = Number(req.params?.id);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: "invalid shop id" });
    }

    const action = typeof req.body?.action === "string" ? req.body.action.trim() : "";
    const slug = typeof req.body?.slug === "string" ? req.body.slug.trim() : req.body?.slug;

    const result = await mutateAdminShopStorefront(shopId, { action, slug });

    if (
      result.status === 200 &&
      !result.body?.unchanged &&
      (action === "create_slug" || action === "rename_slug")
    ) {
      logAdminAction({
        adminId: req.user?.id ?? null,
        action: "shop.slug.change",
        targetType: "shop",
        targetId: shopId,
        before: { slug: result.body?.before?.slug ?? null },
        after: { slug: result.body?.storefront?.slug ?? null },
        req,
      }).catch(() => {});
    }

    const auditAction = STOREFRONT_AUDIT_ACTIONS[action];
    if (result.status === 200 && !result.body?.unchanged && auditAction) {
      logAdminAction({
        adminId: req.user?.id ?? null,
        action: auditAction,
        targetType: "shop",
        targetId: shopId,
        before: {
          public_status: result.body?.before?.public_status ?? null,
        },
        after: {
          public_status:
            result.body?.after?.public_status ??
            result.body?.storefront?.publicStatus ??
            null,
        },
        req,
      }).catch(() => {});
    }

    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("[admin:shops:storefront] postShopStorefront error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
