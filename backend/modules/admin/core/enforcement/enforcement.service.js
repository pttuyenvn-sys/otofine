/**
 * Enforcement case service — Slice 6.
 *
 * Provides case CRUD and state transitions.
 * NEVER calls logAdminAction — controller-only (B2 constraint).
 * No module-scope DB/Redis calls (PM2 startup safety).
 *
 * Error convention: throw { status: N, message: '...' } for HTTP errors.
 * Return value: { ok: true, oldState, newState, ...entityFields }
 */

import { pool } from "../../../../config/db.js";

// ---------------------------------------------------------------------------
// List / read
// ---------------------------------------------------------------------------

export async function listCases({ status, target_type, target_id, page, limit }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (status) { conditions.push("status = ?"); params.push(status); }
  if (target_type) { conditions.push("target_type = ?"); params.push(target_type); }
  if (target_id) { conditions.push("target_id = ?"); params.push(Number(target_id)); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT id, target_type, target_id, case_type, severity, category, summary,
            status, opened_by, assigned_to, resolved_by, resolution,
            resolution_note, created_at, updated_at, resolved_at
     FROM admin_enforcement_cases
     ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows;
}

export async function getCase(caseId) {
  const [rows] = await pool.query(
    `SELECT id, target_type, target_id, case_type, severity, category, summary,
            status, opened_by, assigned_to, resolved_by, resolution,
            resolution_note, created_at, updated_at, resolved_at
     FROM admin_enforcement_cases WHERE id = ?`,
    [caseId],
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createCase(body, actorId) {
  const { target_type, target_id, case_type, severity, category, summary } = body;

  if (!target_type || !target_id || !case_type || !severity || !summary) {
    throw { status: 400, message: "target_type, target_id, case_type, severity, and summary are required" };
  }

  const VALID_CASE_TYPES = ["warning", "suspension", "review", "termination"];
  if (!VALID_CASE_TYPES.includes(case_type)) {
    throw { status: 400, message: `case_type must be one of: ${VALID_CASE_TYPES.join(", ")}` };
  }
  const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
  if (!VALID_SEVERITIES.includes(severity)) {
    throw { status: 400, message: `severity must be one of: ${VALID_SEVERITIES.join(", ")}` };
  }

  const [result] = await pool.query(
    `INSERT INTO admin_enforcement_cases
       (target_type, target_id, case_type, severity, category, summary, status, opened_by)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    [target_type, target_id, case_type, severity, category ?? null, summary, actorId],
  );

  const newState = { case_id: result.insertId, case_type, target_type, target_id, severity, category };
  return { ok: true, caseId: result.insertId, oldState: null, newState };
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

// Valid state machine transitions
const VALID_TRANSITIONS = new Map([
  ["open",           ["pending_review", "resolved", "closed"]],
  ["pending_review", ["resolved", "open"]],
  ["resolved",       ["appealed", "closed"]],
  ["appealed",       ["resolved", "closed"]],
  // "closed" has no outbound transitions — terminal state
]);

// Map (targetStatus) → audit verb
const TRANSITION_VERB = {
  pending_review: "assign",
  open:           "assign",   // returning to open = unassign
  resolved:       "resolve",
  closed:         "close",
  appealed:       "appeal",
};

export async function transitionCase(caseId, options, actorId) {
  const { status: targetStatus, resolution, resolvedNote, assignTo } = options;

  // Fetch current case state
  const [rows] = await pool.query(
    `SELECT id, status, assigned_to, resolved_by
     FROM admin_enforcement_cases WHERE id = ?`,
    [caseId],
  );
  if (!rows.length) throw { status: 404, message: "Case not found" };

  const current = rows[0];
  const currentStatus = current.status;

  if (currentStatus === "closed") {
    throw { status: 409, message: "Case is closed — no further transitions are allowed" };
  }

  if (!targetStatus && !assignTo) {
    throw { status: 400, message: "status or assignTo is required" };
  }

  const resolvedTargetStatus = targetStatus || (assignTo ? "pending_review" : null);

  if (!resolvedTargetStatus) throw { status: 400, message: "status is required" };

  // C1 — Reassignment short-circuit (file-spec review patch).
  // Design §7.4: any admin with moderation:write can re-assign any open or
  // pending_review case without changing its status.
  // A same-status "transition" when assignTo is provided is a pure reassignment,
  // not a state change — bypass the VALID_TRANSITIONS guard in this case only.
  const isReassignment =
    assignTo != null &&
    currentStatus === resolvedTargetStatus &&
    (currentStatus === "open" || currentStatus === "pending_review");

  if (!isReassignment) {
    const allowed = VALID_TRANSITIONS.get(currentStatus) ?? [];
    if (!allowed.includes(resolvedTargetStatus)) {
      throw {
        status: 409,
        message: `Transition from '${currentStatus}' to '${resolvedTargetStatus}' is not allowed`,
      };
    }
  }

  // Active-suspension guard for any → closed transition (B3 design patch)
  if (resolvedTargetStatus === "closed") {
    const [activeSuspension] = await pool.query(
      `SELECT id FROM admin_shop_suspensions
       WHERE case_id = ? AND lifted_at IS NULL
         AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [caseId],
    );
    if (activeSuspension.length > 0) {
      throw {
        status: 409,
        message: "Case has an active suspension — reinstate the shop before closing",
      };
    }
  }

  // C5 — Superadmin guard for appealed → closed (file-spec review patch).
  // Design §7.1: dismissing an appeal (appealed → closed) is restricted to superadmin.
  // Same hard service-layer guard pattern as terminateShop.
  // Fail-closed: if admin_user_roles has no entries, guard blocks everyone.
  if (currentStatus === "appealed" && resolvedTargetStatus === "closed") {
    const [superCheck] = await pool.query(
      `SELECT 1 FROM admin_user_roles aur
       JOIN admin_roles ar ON ar.id = aur.role_id
       WHERE ar.is_superadmin = 1 AND aur.admin_id = ?
       LIMIT 1`,
      [actorId],
    );
    if (!superCheck.length) {
      throw { status: 403, message: "Dismissing an appeal requires superadmin role" };
    }
  }

  // Build UPDATE fields
  const fields = ["status = ?", "updated_at = CURRENT_TIMESTAMP(3)"];
  const params = [resolvedTargetStatus];

  if (resolvedTargetStatus === "resolved" || resolvedTargetStatus === "closed") {
    if (resolvedTargetStatus === "resolved") {
      fields.push("resolved_by = ?", "resolved_at = NOW(3)");
      params.push(actorId);
    }
    if (resolution) { fields.push("resolution = ?"); params.push(resolution); }
    if (resolvedNote) { fields.push("resolution_note = ?"); params.push(resolvedNote); }
  }

  if (resolvedTargetStatus === "pending_review" && assignTo) {
    fields.push("assigned_to = ?");
    params.push(Number(assignTo));
  }

  if (resolvedTargetStatus === "open") {
    // Return to open = unassign
    fields.push("assigned_to = NULL");
  }

  params.push(caseId, currentStatus);

  const [updateResult] = await pool.query(
    `UPDATE admin_enforcement_cases
     SET ${fields.join(", ")}
     WHERE id = ? AND status = ?`,
    params,
  );

  if (updateResult.affectedRows === 0) {
    throw { status: 409, message: "Case state has changed — please refresh and retry" };
  }

  const oldState = {
    status: currentStatus,
    assigned_to: current.assigned_to,
    resolved_by: current.resolved_by,
  };
  const newState = { status: resolvedTargetStatus, resolution: resolution ?? null };
  const verb = TRANSITION_VERB[resolvedTargetStatus] ?? "update";

  return { ok: true, verb, oldState, newState };
}

// ---------------------------------------------------------------------------
// Termination (superadmin only — hard service-layer guard)
// ---------------------------------------------------------------------------

export async function terminateShop(caseId, shopId, actorId) {
  // Guard 1 — Verify is_superadmin
  // Fail-closed: if admin_user_roles has no entries, returns 0 rows for everyone.
  const [superAdminCheck] = await pool.query(
    `SELECT 1 FROM admin_user_roles aur
     JOIN admin_roles ar ON ar.id = aur.role_id
     WHERE ar.is_superadmin = 1 AND aur.admin_id = ?
     LIMIT 1`,
    [actorId],
  );
  if (!superAdminCheck.length) {
    throw { status: 403, message: "Termination requires superadmin role" };
  }

  // Guard 2 — Verify case exists and is a termination type in an actionable state
  const [caseRows] = await pool.query(
    `SELECT id, status FROM admin_enforcement_cases
     WHERE id = ? AND case_type = 'termination'`,
    [caseId],
  );
  if (!caseRows.length) {
    throw { status: 404, message: "Termination case not found" };
  }
  const caseRow = caseRows[0];
  if (!["open", "pending_review"].includes(caseRow.status)) {
    throw { status: 409, message: `Case is in status '${caseRow.status}' — cannot terminate` };
  }

  // Pre-Step — Fetch current shop state for audit before-snapshot (C8)
  // Required: §9.2 audit table specifies before: { public_status: current, accounts_status: current }
  const [shopRows] = await pool.query(
    `SELECT s.id, s.public_status, s.slug, s.accountId, sa.status AS accounts_status
     FROM shops s
     LEFT JOIN shop_accounts sa ON sa.id = s.accountId
     WHERE s.id = ?`,
    [shopId],
  );
  if (!shopRows.length) throw { status: 404, message: "Shop not found" };
  const shop = shopRows[0];

  // Step 1 — Suspend shop (public_status)
  await pool.query(
    `UPDATE shops SET public_status = 'suspended' WHERE id = ?`,
    [shopId],
  );

  // Step 2 — Permanently lock account (best-effort)
  if (shop.accountId) {
    await pool.query(
      `UPDATE shop_accounts SET status = 'deleted'
       WHERE id = ? AND status != 'deleted'`,
      [shop.accountId],
    ).catch((err) => {
      console.error("[enforcement:terminateShop] account lock error:", err.message);
    });
  }

  // Step 3 — Resolve case as terminated
  await pool.query(
    `UPDATE admin_enforcement_cases
     SET status = 'resolved', resolution = 'terminated',
         resolved_by = ?, resolved_at = NOW(3), updated_at = CURRENT_TIMESTAMP(3)
     WHERE id = ?`,
    [actorId, caseId],
  );

  // Step 4 — Invalidate storefront cache (MANDATORY)
  try {
    const { invalidateShop } = await import("../../../../domains/shopPublic/cache/caches.js");
    invalidateShop(shop.slug);
  } catch (err) {
    console.error("[enforcement:terminateShop] cache invalidation error:", err.message);
  }

  return {
    ok: true,
    shopStatusBefore: shop.public_status,
    accountsStatusBefore: shop.accounts_status,
  };
}
