import { pool } from "../../../../config/db.js";
import { getProductsColumnsResolved } from "../../../../utils/productsTableColumns.server.js";
import {
  aggregateRiskBuckets,
  computeProductRiskScore,
  scoreToPriorityLevel,
} from "../../../../modules/governance/services/riskEvaluation.service.js";
import { getProductModerationDetail } from "../../../../modules/governance/services/productModerationDetail.service.js";
import { createGovernanceActionId } from "../../../../modules/governance/services/governanceActionId.server.js";
import { logModerationAction } from "../../../../modules/governance/services/governanceLogger.server.js";

/**
 * GET /api/admin/platform/products/moderation/shops
 * Lightweight shop list for moderation filters.
 * Query: search (optional), limit (default 50, max 100)
 * Response: { rows: [{ id, name }] }
 */
export async function listModerationShops(req, res) {
  try {
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 50;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const cols = await getProductsColumnsResolved();
    const where = [];
    const params = [];

    if (search) {
      where.push("(sh.name LIKE ? OR CAST(sh.id AS CHAR) LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await pool.query(
      `
        SELECT DISTINCT sh.id, sh.name
        FROM shops sh
        INNER JOIN products p ON ${cols.shopJoinOn("p", "sh")}
        ${whereSql}
        ORDER BY sh.name ASC
        LIMIT ?
      `,
      [...params, limit],
    );

    return res.json({ rows: rows || [] });
  } catch (err) {
    console.error("[admin:products:moderation] listModerationShops error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

const MODERATION_LIST_SELECT = (cols) => `
  p.id,
  ${cols.nameSqlSelect("p")},
  ${cols.partNumberSqlSelect("p")},
  ${cols.shopIdSqlSelect("p")},
  ${cols.priceSqlSelect("p")},
  ${cols.stockSqlSelect("p")},
  p.moderation_status AS moderationStatus,
  ${cols.orderExprQualified("p")} AS createdAt,
  sh.name AS shopName,
  (
    SELECT COUNT(*) FROM product_images pi2
    WHERE pi2.productId = p.id
  ) AS imageCount,
  (
    SELECT pi3.url
    FROM product_images pi3
    WHERE pi3.productId = p.id
    ORDER BY pi3.isPrimary DESC, pi3.id ASC
    LIMIT 1
  ) AS thumbnailUrl,
  (
    SELECT GROUP_CONCAT(pi4.url ORDER BY pi4.isPrimary DESC, pi4.id ASC SEPARATOR '||')
    FROM product_images pi4
    WHERE pi4.productId = p.id
  ) AS images_blob,
  (
    SELECT GROUP_CONCAT(rf.flag_code, '::', rf.severity SEPARATOR '||')
    FROM product_risk_flags rf
    WHERE rf.product_id = p.id
  ) AS flags_blob,
  (
    SELECT COUNT(*) FROM product_moderation_events e2
    WHERE e2.product_id = p.id AND e2.new_status = 'rejected'
  ) AS productRejectCount
`;

function mapModerationRow(r) {
  const imgs = r.images_blob ? String(r.images_blob).split("||").filter(Boolean) : [];
  const flags = r.flags_blob
    ? String(r.flags_blob)
        .split("||")
        .filter(Boolean)
        .map((s) => {
          const [code, severity] = String(s).split("::");
          return { code, severity: severity || "low" };
        })
    : [];

  const prevRejections = Number(r.productRejectCount || 0);
  const score = computeProductRiskScore({ flags, priorRejections: prevRejections });
  const priorityLevel = scoreToPriorityLevel(score);

  const { images_blob, flags_blob, ...rest } = r;
  return {
    ...rest,
    images: imgs,
    imageCount: Number(r.imageCount || imgs.length || 0),
    riskFlags: flags,
    riskScore: score,
    priorityLevel,
  };
}

function buildModerationListWhere(req, cols) {
  const pageRaw = Number(req.query.page);
  const limitRaw = Number(req.query.limit);
  const page = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.floor(limitRaw))) : 20;
  const offset = (page - 1) * limit;

  const pendingOnly = String(req.query.pendingOnly || "") === "1";
  const statusRaw = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";
  const allowedStatus = new Set(["pending_review", "approved", "rejected", "draft"]);
  const missingImage = String(req.query.missingImage || "") === "1";
  const missingPrice = String(req.query.missingPrice || "") === "1";

  const shopIdRaw = Number(req.query.shopId);
  const shopId = Number.isFinite(shopIdRaw) && shopIdRaw > 0 ? shopIdRaw : null;

  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

  const where = [];
  const params = [];

  if (statusRaw === "all") {
    where.push("TRIM(LOWER(p.moderation_status)) NOT IN ('hidden', 'deleted')");
  } else if (statusRaw && allowedStatus.has(statusRaw)) {
    where.push("TRIM(LOWER(p.moderation_status)) = ?");
    params.push(statusRaw);
  } else if (pendingOnly) {
    where.push("TRIM(LOWER(p.moderation_status)) = ?");
    params.push("pending_review");
  }

  if (missingPrice) {
    where.push(`(COALESCE(${cols.priceExpr("p")}, 0) <= 0)`);
  }

  if (missingImage) {
    where.push(`(
      SELECT COUNT(*) FROM product_images pi
      WHERE pi.productId = p.id
    ) = 0`);
  }

  if (shopId) {
    where.push(`${cols.shopIdExpr("p")} = ?`);
    params.push(shopId);
  }

  if (search) {
    where.push(`(${cols.partNameExpr("p")} LIKE ? OR ${cols.partNumberExpr("p")} LIKE ?)`);
    const like = `%${search}%`;
    params.push(like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  return { page, limit, offset, whereSql, params };
}

/**
 * GET /api/admin/platform/products/moderation
 * Query:
 *   - page (optional, default 1)
 *   - limit (optional, default 20, max 100)
 *   - pendingOnly=1
 *   - status (pending_review|approved|rejected|draft|all)
 *   - missingImage=1
 *   - missingPrice=1
 *   - shopId (optional)
 *   - search (optional, title or SKU/part number)
 *
 * Response: { rows, pagination: { page, limit, total, totalPages } }
 */
export async function listModerationQueue(req, res) {
  try {
    const cols = await getProductsColumnsResolved();
    const { page, limit, offset, whereSql, params } = buildModerationListWhere(req, cols);

    const [[countRow]] = await pool.query(
      `
        SELECT COUNT(*) AS total
        FROM products p
        LEFT JOIN shops sh ON ${cols.shopJoinOn("p", "sh")}
        ${whereSql}
      `,
      params,
    );

    const [rows] = await pool.query(
      `
        SELECT
          ${MODERATION_LIST_SELECT(cols)}
        FROM products p
        LEFT JOIN shops sh ON ${cols.shopJoinOn("p", "sh")}
        ${whereSql}
        ORDER BY p.id DESC
        LIMIT ? OFFSET ?
      `,
      [...params, limit, offset],
    );

    const out = (rows || []).map(mapModerationRow);
    const total = Number(countRow?.total ?? 0);
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

    return res.json({
      rows: out,
      pagination: { page, limit, total, totalPages },
    });
  } catch (err) {
    console.error("[admin:products:moderation] listModerationQueue error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/admin/platform/products/moderation/bulk
 * Body:
 *   { ids: number[], action: 'approve'|'reject', reason?: string }
 *
 * Slice 1: Updates moderation_status only. Does not change public storefront behavior yet.
 */
export async function bulkModerateProducts(req, res) {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : [];
    const action = typeof req.body?.action === "string" ? req.body.action.trim() : "";
    // Accept both new (reasonCode/note) and legacy (rejectReason/notes) fields.
    const rejectReasonRaw = typeof req.body?.reasonCode === "string" ? req.body.reasonCode.trim() : (typeof req.body?.rejectReason === "string" ? req.body.rejectReason.trim() : null);
    const notes = typeof req.body?.note === "string" ? req.body.note.trim() : (typeof req.body?.notes === "string" ? req.body.notes.trim() : null);

    const allowedReasons = new Set([
      "counterfeit",
      "duplicate",
      "prohibited",
      "wrong_category",
      "poor_images",
      "insufficient_info",
      "misleading",
      "spam",
      "other",
    ]);
    const rejectReason = rejectReasonRaw;

    if (!ids.length) {
      return res.status(400).json({ error: "ids is required" });
    }
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "action must be approve|reject" });
    }

    const nextStatus = action === "approve" ? "approved" : "rejected";

    if (action === "reject") {
      if (!rejectReason) {
        return res.status(400).json({ error: "reasonCode is required when action=reject" });
      }
      if (!allowedReasons.has(rejectReason)) {
        return res.status(400).json({ error: "invalid reasonCode" });
      }
    }

    // Read current statuses
    const [existingRows] = await pool.query(
      `SELECT id, moderation_status FROM products WHERE id IN (?)`,
      [ids],
    );

    const existingById = new Map();
    for (const r of existingRows) existingById.set(Number(r.id), String(r.moderation_status || ""));

    // Update statuses
    const [result] = await pool.query(
      `
        UPDATE products
        SET moderation_status = ?
        WHERE id IN (?)
      `,
      [nextStatus, ids],
    );

    // Insert moderation events for rows where status changed
    const nowAdminId = req.user?.id ?? null;
    const toInsert = [];
    const notifications = [];
    for (const id of ids) {
      const oldStatus = existingById.get(Number(id)) ?? "";
      if (oldStatus === nextStatus) continue; // no-op, don't log
      toInsert.push([id, nowAdminId, oldStatus, nextStatus, rejectReason, notes]);
      // prepare notifications after update — we'll resolve shopId/productName below
    }

    if (toInsert.length) {
      await pool.query(
        `INSERT INTO product_moderation_events (product_id, moderator_admin_id, old_status, new_status, reject_reason, notes) VALUES ?`,
        [toInsert],
      );

      // load product/shop info to create notifications
      const changedIds = toInsert.map((r) => Number(r[0]));
      const [prodRows] = await pool.query(
        `SELECT id, shopId, partName FROM products WHERE id IN (?)`,
        [changedIds],
      );
      const prodById = new Map(prodRows.map((r) => [Number(r.id), r]));

      // create notifications for each changed product
      try {
        const { notifyProductApproved, notifyProductRejected, notifyProductHidden } = await import("../../../../modules/notifications/services/shopNotification.service.js");
        for (const [id, , oldStatus, newStatus, rr, nt] of toInsert) {
          const p = prodById.get(Number(id));
          if (!p) continue;
          const shopId = p.shopId;
          const productName = p.partName;
          if (newStatus === "approved") {
            // eslint-disable-next-line no-await-in-loop
            await notifyProductApproved({ shopId, productId: id, productName });
          } else if (newStatus === "rejected") {
            // eslint-disable-next-line no-await-in-loop
            await notifyProductRejected({ shopId, productId: id, productName, reason: rr, notes: nt });
          } else if (newStatus === "hidden") {
            // eslint-disable-next-line no-await-in-loop
            await notifyProductHidden({ shopId, productId: id, productName, notes: nt });
          }
        }
      } catch (e) {
        console.error("Failed to create shop notifications:", e);
        // Do not fail moderation update due to notification errors.
      }

      // Recalculate shop risk scores for affected shops (best-effort).
      try {
        const { calculateShopRisk } = await import("../../../../modules/governance/services/shopRiskEngine.service.js");
        const shopIds = Array.from(new Set(prodRows.map((r) => Number(r.shopId)).filter((n) => Number.isFinite(n) && n > 0)));
        for (const sid of shopIds) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await calculateShopRisk(sid);
          } catch (er) {
            console.error("calculateShopRisk failed for shop", sid, er);
          }
        }
      } catch (er2) {
        console.error("Failed to trigger shop risk recalculation:", er2);
      }
      // Evaluate product-level risk flags (best-effort)
      try {
        const { evaluateAndStoreProductRisk } = await import("../../../../modules/governance/services/riskEvaluation.service.js");
        for (const pid of changedIds) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await evaluateAndStoreProductRisk(pid);
          } catch (e) {
            console.error("evaluateAndStoreProductRisk failed for product", pid, e);
          }
        }
      } catch (e2) {
        console.error("Failed to trigger product risk flag evaluation:", e2);
      }
    }

    const actionId = createGovernanceActionId();
    logModerationAction({
      actionId,
      source: "bulkModerateProducts",
      action,
      nextStatus,
      productIds: ids,
      eventsInserted: toInsert.length,
      moderatorAdminId: req.user?.id ?? null,
    });

    return res.json({ ok: true, actionId, updated: result.affectedRows || 0, moderationStatus: nextStatus, eventsInserted: toInsert.length });
  } catch (err) {
    console.error("[admin:products:moderation] bulkModerateProducts error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/admin/platform/products/:id/moderation-detail
 * Rich moderation review payload for detail page.
 */
export async function getProductModerationDetailHandler(req, res) {
  try {
    const id = Number(req.params?.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "invalid product id" });
    }

    const detail = await getProductModerationDetail(id);
    if (!detail) return res.status(404).json({ error: "product not found" });

    return res.json(detail);
  } catch (err) {
    console.error("[admin:products:moderation] getProductModerationDetail error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/admin/platform/products/:id/moderation-events
 *
 * Auth: requireAuth + requireAdmin + requireAdminSession + requirePermission("moderation:read")
 *
 * Response:
 * { rows: [ { id, productId, moderatorAdminId, moderatorEmail, oldStatus, newStatus, rejectReason, notes, createdAt } ] }
 */
export async function getProductModerationEvents(req, res) {
  try {
    const id = Number(req.params?.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "invalid product id" });
    }

    const [rows] = await pool.query(
      `
        SELECT
          e.id,
          e.product_id AS productId,
          e.moderator_admin_id AS moderatorAdminId,
          a.email AS moderatorEmail,
          e.old_status AS oldStatus,
          e.new_status AS newStatus,
          e.reject_reason AS rejectReason,
          e.notes AS notes,
          e.created_at AS createdAt
        FROM product_moderation_events e
        LEFT JOIN admin a ON a.id = e.moderator_admin_id
        WHERE e.product_id = ?
        ORDER BY e.created_at DESC
      `,
      [id],
    );

    return res.json({ rows: rows || [] });
  } catch (err) {
    console.error("[admin:products:moderation] getProductModerationEvents error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/admin/platform/products/moderation/reset-status
 * Body: { productIds: number[], status: 'pending_review'|'approved'|'rejected'|'draft' }
 *
 * Adds moderation events for products whose status changed and updates products table.
 * Requires moderation:write permission at route level (route will enforce).
 */
export async function resetModerationStatus(req, res) {
  try {
    const ids = Array.isArray(req.body?.productIds) ? req.body.productIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : [];
    const status = typeof req.body?.status === "string" ? String(req.body.status).trim() : "";
    const allowed = new Set(["pending_review", "approved", "rejected", "draft"]);
    if (!ids.length) return res.status(400).json({ error: "productIds is required" });
    if (!allowed.has(status)) return res.status(400).json({ error: "invalid status" });

    // Read current statuses
    const [existingRows] = await pool.query(`SELECT id, moderation_status FROM products WHERE id IN (?)`, [ids]);
    const existingById = new Map();
    for (const r of existingRows) existingById.set(Number(r.id), String(r.moderation_status || ""));

    // Update statuses
    const [result] = await pool.query(
      `UPDATE products SET moderation_status = ? WHERE id IN (?)`,
      [status, ids],
    );

    // Insert moderation events for rows where status changed
    const nowAdminId = req.user?.id ?? null;
    const toInsert = [];
    for (const id of ids) {
      const oldStatus = existingById.get(Number(id)) ?? "";
      if (oldStatus === status) continue;
      toInsert.push([id, nowAdminId, oldStatus, status, null, null]);
    }

    if (toInsert.length) {
      await pool.query(
        `INSERT INTO product_moderation_events (product_id, moderator_admin_id, old_status, new_status, reject_reason, notes) VALUES ?`,
        [toInsert],
      );
    }

    return res.json({ ok: true, updated: result.affectedRows || 0, eventsInserted: toInsert.length, status });
  } catch (err) {
    console.error("[admin:products:moderation] resetModerationStatus error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/admin/platform/products/moderation/stats
 * Returns aggregate counts for statuses and risk buckets (calculated from flags).
 *
 * Response: { pending, approved, rejected, draft, critical, high, medium, low }
 */
export async function getModerationStats(req, res) {
  try {
    const [statusRows] = await pool.query(
      `
      SELECT
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'pending_review' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'approved' THEN 1 ELSE 0 END) AS approved,
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'rejected' THEN 1 ELSE 0 END) AS rejected,
        SUM(CASE WHEN TRIM(LOWER(p.moderation_status)) = 'draft' THEN 1 ELSE 0 END) AS draft
      FROM products p
    `,
      [],
    );

    const risk = await aggregateRiskBuckets();
    const out = {
      ...(statusRows?.[0] || { pending: 0, approved: 0, rejected: 0, draft: 0 }),
      ...risk,
    };
    return res.json(out);
  } catch (err) {
    console.error("[admin:products:moderation] getModerationStats error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

