/**
 * Moderation note service — Slice 6.
 *
 * Provides moderation note CRUD.
 * Soft-delete only: records are never physically removed.
 * NEVER calls logAdminAction — controller-only (B2 constraint).
 * No module-scope DB/Redis calls (PM2 startup safety).
 *
 * Visibility restriction (C1 design patch):
 *   Only 'admin_only' is accepted for createNote() in Slice 6.
 *   Requests with visibility='internal' are rejected with HTTP 400.
 *   The 'internal' ENUM value is reserved for a future permission tier (Phase 3+).
 */

import { pool } from "../../../../config/db.js";

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listNotes({ caseId, target_type, target_id }) {
  const conditions = ["deleted_at IS NULL"];
  const params = [];

  if (caseId)      { conditions.push("case_id = ?");      params.push(Number(caseId)); }
  if (target_type) { conditions.push("target_type = ?");  params.push(target_type); }
  if (target_id)   { conditions.push("target_id = ?");    params.push(Number(target_id)); }

  const [rows] = await pool.query(
    `SELECT id, target_type, target_id, case_id, content, visibility,
            pinned, author_id, created_at, updated_at
     FROM admin_moderation_notes
     WHERE ${conditions.join(" AND ")}
     ORDER BY pinned DESC, created_at DESC`,
    params,
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createNote(body, actorId) {
  const {
    target_type,
    target_id,
    caseId = null,
    content,
    visibility = "admin_only",
    pinned = false,
  } = body;

  if (!target_type || !target_id || !content?.trim()) {
    throw { status: 400, message: "target_type, target_id, and content are required" };
  }

  // Slice 6 visibility restriction (C1 design patch)
  if (visibility === "internal") {
    throw {
      status: 400,
      message: "Granular note visibility is not yet supported; use 'admin_only'",
    };
  }
  if (visibility !== "admin_only") {
    throw { status: 400, message: "visibility must be 'admin_only'" };
  }

  const [result] = await pool.query(
    `INSERT INTO admin_moderation_notes
       (target_type, target_id, case_id, content, visibility, pinned, author_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      target_type,
      target_id,
      caseId ?? null,
      content.trim(),
      visibility,
      pinned ? 1 : 0,
      actorId,
    ],
  );

  return { ok: true, noteId: result.insertId };
}

// ---------------------------------------------------------------------------
// Pin / unpin
// ---------------------------------------------------------------------------

export async function setPinned(noteId, pinned, actorId) {
  const [rows] = await pool.query(
    `SELECT id, pinned FROM admin_moderation_notes
     WHERE id = ? AND deleted_at IS NULL`,
    [noteId],
  );
  if (!rows.length) throw { status: 404, message: "Note not found" };
  const oldPinned = !!rows[0].pinned;

  await pool.query(
    `UPDATE admin_moderation_notes SET pinned = ? WHERE id = ?`,
    [pinned ? 1 : 0, noteId],
  );

  return { ok: true, oldPinned };
}

// ---------------------------------------------------------------------------
// Soft-delete
// ---------------------------------------------------------------------------

export async function deleteNote(noteId, actorId) {
  // C2 — fetch author_id for authorship check (file-spec review patch).
  // Design §6.3: notes by other admins cannot be deleted by non-superadmin users;
  // this is enforced at the service layer.
  // Superadmin override is Phase 3+ scope — Slice 6 restricts deletion to the
  // note author only.
  const [rows] = await pool.query(
    `SELECT id, content, author_id FROM admin_moderation_notes
     WHERE id = ? AND deleted_at IS NULL`,
    [noteId],
  );
  if (!rows.length) throw { status: 404, message: "Note not found or already deleted" };

  if (rows[0].author_id !== actorId) {
    throw { status: 403, message: "Only the note author can delete this note" };
  }

  const now = new Date().toISOString();
  await pool.query(
    `UPDATE admin_moderation_notes SET deleted_at = NOW(3) WHERE id = ?`,
    [noteId],
  );

  return {
    ok: true,
    contentLength: rows[0].content?.length ?? 0,
    deletedAt: now,
  };
}
