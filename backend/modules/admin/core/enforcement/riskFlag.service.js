/**
 * Risk flag service — Slice 6.
 *
 * Provides risk flag CRUD and lifecycle transitions.
 * NEVER calls logAdminAction — controller-only (B2 constraint).
 * No module-scope DB/Redis calls (PM2 startup safety).
 *
 * Flag lifecycle:
 *   open → confirmed
 *   open → dismissed
 *   confirmed → resolved
 *
 * NOTE (C6): admin_risk_flags has NO visibility column.
 * The visibility='internal' rejection is for admin_moderation_notes only.
 * Do NOT add a visibility check to createFlag().
 */

import { pool } from "../../../../config/db.js";

// Valid transitions: Map<currentStatus, allowedNextStatuses[]>
const FLAG_TRANSITIONS = new Map([
  ["open",      ["confirmed", "dismissed"]],
  ["confirmed", ["resolved"]],
  // "dismissed" and "resolved" are terminal
]);

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listFlags({ status, target_type, target_id, page, limit }) {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (status)      { conditions.push("status = ?");      params.push(status); }
  if (target_type) { conditions.push("target_type = ?"); params.push(target_type); }
  if (target_id)   { conditions.push("target_id = ?");   params.push(Number(target_id)); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.query(
    `SELECT id, target_type, target_id, flag_type, severity, auto_detected,
            signal_json, status, flagged_by, reviewed_by, detected_at,
            reviewed_at, case_id
     FROM admin_risk_flags
     ${where}
     ORDER BY detected_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createFlag(body, actorId) {
  const { target_type, target_id, flag_type, severity = "medium", case_id } = body;

  if (!target_type || !target_id || !flag_type) {
    throw { status: 400, message: "target_type, target_id, and flag_type are required" };
  }
  const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
  if (!VALID_SEVERITIES.includes(severity)) {
    throw { status: 400, message: `severity must be one of: ${VALID_SEVERITIES.join(", ")}` };
  }
  if (!flag_type.trim()) {
    throw { status: 400, message: "flag_type must not be empty" };
  }

  const [result] = await pool.query(
    `INSERT INTO admin_risk_flags
       (target_type, target_id, flag_type, severity, auto_detected,
        signal_json, status, flagged_by, case_id)
     VALUES (?, ?, ?, ?, 0, NULL, 'open', ?, ?)`,
    [target_type, target_id, flag_type.trim(), severity, actorId, case_id ?? null],
  );

  const newState = {
    flag_id: result.insertId,
    flag_type: flag_type.trim(),
    severity,
    target_type,
    target_id,
  };
  return { ok: true, flagId: result.insertId, newState };
}

// ---------------------------------------------------------------------------
// Review (transition)
// ---------------------------------------------------------------------------

export async function reviewFlag(flagId, disposition, actorId) {
  const VALID_DISPOSITIONS = ["confirmed", "dismissed", "resolved"];
  if (!VALID_DISPOSITIONS.includes(disposition)) {
    throw {
      status: 400,
      message: `disposition must be one of: ${VALID_DISPOSITIONS.join(", ")}`,
    };
  }

  const [rows] = await pool.query(
    `SELECT id, status FROM admin_risk_flags WHERE id = ?`,
    [flagId],
  );
  if (!rows.length) throw { status: 404, message: "Risk flag not found" };
  const flag = rows[0];

  const allowed = FLAG_TRANSITIONS.get(flag.status) ?? [];
  if (!allowed.includes(disposition)) {
    throw {
      status: 409,
      message: `Transition from '${flag.status}' to '${disposition}' is not allowed`,
    };
  }

  const [updateResult] = await pool.query(
    `UPDATE admin_risk_flags
     SET status = ?, reviewed_by = ?, reviewed_at = NOW(3)
     WHERE id = ? AND status = ?`,
    [disposition, actorId, flagId, flag.status],
  );
  if (updateResult.affectedRows === 0) {
    throw { status: 409, message: "Flag state has changed — please refresh and retry" };
  }

  return {
    ok: true,
    oldState: { status: flag.status },
    newState: { status: disposition, reviewed_by: actorId },
  };
}
