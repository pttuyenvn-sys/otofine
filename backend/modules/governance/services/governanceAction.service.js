import { pool } from "../../../config/db.js";
import { createNote } from "../../admin/core/enforcement/moderationNote.service.js";
import { withGovernanceIdempotency } from "./governanceIdempotency.service.js";

async function ensureShopExists(shopId) {
  const [[shopRow]] = await pool.query(
    `SELECT id, public_status FROM shops WHERE id = ? LIMIT 1`,
    [shopId],
  );
  if (!shopRow) return null;
  return shopRow;
}

/**
 * Execute a shop governance action with idempotency + actionId.
 * SAFE MODE: soft actions only.
 */
export async function executeShopGovernanceAction({
  shopId,
  action,
  note = "",
  adminId = null,
  idempotencyKey = null,
}) {
  const shop = await ensureShopExists(shopId);
  if (!shop) return { status: 404, body: { error: "shop not found" } };

  if (action === "add_note" && !String(note || "").trim()) {
    return { status: 400, body: { error: "note is required" } };
  }

  const response = await withGovernanceIdempotency({
    shopId,
    action,
    note,
    adminId,
    idempotencyKey,
    handler: async (actionId) => {
      if (action === "force_private") {
        const alreadyPrivate = String(shop.public_status || "").trim().toLowerCase() === "private";
        if (!alreadyPrivate) {
          await pool.query(`UPDATE shops SET public_status = 'private' WHERE id = ?`, [shopId]);
        }
        await createNote(
          {
            target_type: "shop",
            target_id: shopId,
            content: `[${actionId}] Force private: ${note || ""}`,
            visibility: "admin_only",
          },
          adminId,
        );
        return { ok: true, action: "force_private", alreadyPrivate, actionId };
      }

      if (action === "require_re_review") {
        const [existing] = await pool.query(
          `SELECT id, moderation_status FROM products WHERE shopId = ?`,
          [shopId],
        );
        const toUpdate = [];
        for (const r of existing || []) {
          if (String(r.moderation_status || "") !== "pending_review") {
            toUpdate.push(Number(r.id));
          }
        }

        if (toUpdate.length) {
          await pool.query(`UPDATE products SET moderation_status = 'pending_review' WHERE id IN (?)`, [toUpdate]);

          const statusById = new Map((existing || []).map((r) => [Number(r.id), String(r.moderation_status || "")]));
          const toInsert = toUpdate.map((pid) => [
            pid,
            adminId,
            statusById.get(pid) || null,
            "pending_review",
            null,
            `[${actionId}] bulk re-review: ${note || ""}`,
          ]);

          if (toInsert.length) {
            await pool.query(
              `INSERT INTO product_moderation_events (product_id, moderator_admin_id, old_status, new_status, reject_reason, notes) VALUES ?`,
              [toInsert],
            );
          }
        }

        await createNote(
          {
            target_type: "shop",
            target_id: shopId,
            content: `[${actionId}] Require re-review executed. ${note || ""}`,
            visibility: "admin_only",
          },
          adminId,
        );
        return { ok: true, action: "require_re_review", updated: toUpdate.length, actionId };
      }

      if (action === "suspend_uploads") {
        await createNote(
          {
            target_type: "shop",
            target_id: shopId,
            content: `[${actionId}] Uploads suspended: ${note || ""}`,
            visibility: "admin_only",
          },
          adminId,
        );
        return { ok: true, action: "suspend_uploads", actionId };
      }

      if (action === "add_note") {
        await createNote(
          {
            target_type: "shop",
            target_id: shopId,
            content: `[${actionId}] ${note}`,
            visibility: "admin_only",
          },
          adminId,
        );
        return { ok: true, action: "add_note", actionId };
      }

      throw new Error("unsupported action");
    },
  });

  return { status: 200, body: response };
}
