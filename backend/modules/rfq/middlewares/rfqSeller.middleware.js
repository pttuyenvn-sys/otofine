import { requireAuth, requireShop } from "../../../middlewares/auth.js";

/**
 * RFQ seller pipeline — resolves **business shop id** into req.shop.id.
 * Uses existing auth core unchanged; JWT remains credential-layer only.
 */
export function rfqRequireSeller(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.user || req.user.role !== "shop") {
      return res.status(403).json({ message: "Chỉ tài khoản shop" });
    }
    requireShop(req, res, next);
  });
}

/**
 * Explicit resolver name for audits — after rfqRequireSeller, use req.shop.id only.
 */
export function resolveBusinessShop(req) {
  return req.shop?.id ?? null;
}
