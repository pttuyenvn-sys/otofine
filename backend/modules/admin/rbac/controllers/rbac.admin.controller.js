/**
 * RBAC management controller.
 *
 * All routes require: requireAuth → requireAdmin → requirePermission(key)
 *
 * Handlers:
 *   getRoles       GET    /api/admin/rbac/roles                          — rbac:read
 *   getPermissions GET    /api/admin/rbac/permissions                    — rbac:read
 *   getAdminRoles  GET    /api/admin/rbac/admins/:adminId/roles          — rbac:read
 *   assignRole     POST   /api/admin/rbac/admins/:adminId/roles          — rbac:manage
 *   revokeRole     DELETE /api/admin/rbac/admins/:adminId/roles/:roleId  — rbac:manage
 *
 * C2: Privilege escalation guard on assignRole:
 *   Only a superadmin may assign the superadmin role.
 *
 * C5: Last-superadmin lockout guard on revokeRole:
 *   Cannot revoke the last remaining superadmin assignment.
 *
 * Cache invalidation ordering (final-review C2):
 *   invalidateAdminRbacCache is called AFTER a successful DB write, as fire-and-forget.
 *   Never before — stale cache is preferable to a race condition that restores old data.
 */

import { pool } from "../../../../config/db.js";
import { getAdminRbac, invalidateAdminRbacCache } from "../../core/rbac/rbac.service.js";
import { logAdminAction } from "../../core/auditLog/auditLog.service.js";

/**
 * GET /api/admin/rbac/roles
 * Returns all defined roles.
 */
export async function getRoles(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT id, role_name, description, is_superadmin, created_at FROM admin_roles ORDER BY id ASC",
    );
    return res.json(rows);
  } catch (err) {
    console.error("[rbac:controller] getRoles error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/admin/rbac/permissions
 * Returns all registered permissions.
 */
export async function getPermissions(req, res) {
  try {
    const [rows] = await pool.query(
      "SELECT id, permission_key, description, created_at FROM admin_permissions ORDER BY permission_key ASC",
    );
    return res.json(rows);
  } catch (err) {
    console.error("[rbac:controller] getPermissions error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/admin/rbac/admins/:adminId/roles
 * Returns all roles assigned to the specified admin.
 */
export async function getAdminRoles(req, res) {
  const adminId = parseInt(req.params.adminId, 10);
  if (!adminId || isNaN(adminId)) {
    return res.status(400).json({ error: "Invalid adminId" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT r.id, r.role_name, r.description, r.is_superadmin,
              aur.granted_by, aur.granted_at
       FROM admin_user_roles aur
       JOIN admin_roles r ON r.id = aur.role_id
       WHERE aur.admin_id = ?
       ORDER BY r.id ASC`,
      [adminId],
    );
    return res.json(rows);
  } catch (err) {
    console.error("[rbac:controller] getAdminRoles error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/admin/rbac/admins/:adminId/roles
 * Body: { roleId: number }
 *
 * Assigns a role to an admin.
 * C2: If the target role has is_superadmin=1, the requester must also be a superadmin.
 * Invalidates the target admin's RBAC cache AFTER the successful INSERT.
 */
export async function assignRole(req, res) {
  const adminId = parseInt(req.params.adminId, 10);
  const roleId  = parseInt(req.body?.roleId,   10);

  if (!adminId || isNaN(adminId)) {
    return res.status(400).json({ error: "Invalid adminId" });
  }
  if (!roleId || isNaN(roleId)) {
    return res.status(400).json({ error: "roleId is required and must be a number" });
  }

  try {
    // Look up the target role to verify it exists and check is_superadmin
    const [roleRows] = await pool.query(
      "SELECT id, role_name, is_superadmin FROM admin_roles WHERE id = ?",
      [roleId],
    );
    if (roleRows.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }
    const targetRole = roleRows[0];

    // C2: Privilege escalation guard
    // Only a superadmin may assign the superadmin role.
    if (targetRole.is_superadmin) {
      const requesterRbac = await getAdminRbac(req.user.id);
      if (!requesterRbac.isSuperadmin) {
        return res.status(403).json({
          error: "Only superadmins may assign the superadmin role",
        });
      }
    }

    // DB write: INSERT IGNORE prevents duplicate-assignment errors
    // C1 file-review: capture result to distinguish new vs idempotent assignment
    const [insertResult] = await pool.query(
      "INSERT IGNORE INTO admin_user_roles (admin_id, role_id, granted_by) VALUES (?, ?, ?)",
      [adminId, roleId, req.user.id],
    );

    // Cache invalidation: only on actual insert (affectedRows=0 means already assigned — no-op)
    // C1: avoids unnecessary invalidation when assignment already existed
    // Ordering: after DB write, fire-and-forget (cache miss on next request is safe)
    if (insertResult.affectedRows > 0) {
      invalidateAdminRbacCache(adminId).catch(() => {});

      // Slice 4: audit log — called after cache invalidation, inside affectedRows guard.
      // Idempotent no-ops (affectedRows=0) are NOT logged (no misleading entries).
      await logAdminAction({
        adminId:    req.user.id,
        action:     "rbac.role.assign",
        targetType: "admin_user_roles",
        targetId:   adminId,
        before:     null,
        after: {
          admin_id:   adminId,
          role_id:    roleId,
          role_name:  targetRole.role_name,
          granted_by: req.user.id,
        },
        req,
      });
    }

    // 201 Created for new assignment, 200 OK for idempotent re-assignment
    const statusCode = insertResult.affectedRows > 0 ? 201 : 200;
    return res.status(statusCode).json({ ok: true, adminId, roleId });
  } catch (err) {
    console.error("[rbac:controller] assignRole error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /api/admin/rbac/admins/:adminId/roles/:roleId
 *
 * Revokes a role from an admin.
 * C5: If revoking a superadmin role assignment, verify at least one other
 *     superadmin assignment will remain. Prevents total superadmin lockout.
 * Invalidates the target admin's RBAC cache AFTER the successful DELETE.
 */
export async function revokeRole(req, res) {
  const adminId = parseInt(req.params.adminId, 10);
  const roleId  = parseInt(req.params.roleId,  10);

  if (!adminId || isNaN(adminId)) {
    return res.status(400).json({ error: "Invalid adminId" });
  }
  if (!roleId || isNaN(roleId)) {
    return res.status(400).json({ error: "Invalid roleId" });
  }

  try {
    // Look up the role to check is_superadmin and capture role_name for audit snapshot
    const [roleRows] = await pool.query(
      "SELECT id, role_name, is_superadmin FROM admin_roles WHERE id = ?",
      [roleId],
    );
    if (roleRows.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }
    const targetRole = roleRows[0];

    // C5: Last-superadmin lockout guard
    // Count superadmin assignments that would remain after this revocation.
    if (targetRole.is_superadmin) {
      const [countRows] = await pool.query(
        `SELECT COUNT(*) AS remaining
         FROM admin_user_roles aur
         JOIN admin_roles r ON r.id = aur.role_id
         WHERE r.is_superadmin = 1
           AND NOT (aur.admin_id = ? AND aur.role_id = ?)`,
        [adminId, roleId],
      );
      const remaining = Number(countRows[0].remaining);
      if (remaining === 0) {
        return res.status(403).json({
          error: "Cannot revoke last superadmin assignment",
        });
      }
    }

    // Slice 4: capture before-snapshot BEFORE the DELETE (C4 design patch).
    // Fetches granted_by and granted_at for the audit trail.
    // Failure is non-fatal: beforeSnapshot falls back to null.
    let beforeSnapshot = null;
    try {
      const [assignmentRows] = await pool.query(
        "SELECT granted_by, granted_at FROM admin_user_roles WHERE admin_id = ? AND role_id = ?",
        [adminId, roleId],
      );
      if (assignmentRows.length > 0) {
        beforeSnapshot = {
          admin_id:   adminId,
          role_id:    roleId,
          role_name:  targetRole.role_name,
          granted_by: assignmentRows[0].granted_by,
          granted_at: assignmentRows[0].granted_at,
        };
      }
    } catch (snapshotErr) {
      console.warn(
        "[rbac:controller] revokeRole before-snapshot query failed:",
        snapshotErr.message,
      );
      // beforeSnapshot remains null — audit proceeds with null before_json
    }

    // DB write
    const [result] = await pool.query(
      "DELETE FROM admin_user_roles WHERE admin_id = ? AND role_id = ?",
      [adminId, roleId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Assignment not found" });
    }

    // Cache invalidation: AFTER successful DB write, fire-and-forget
    invalidateAdminRbacCache(adminId).catch(() => {});

    // Slice 4: audit log — called after cache invalidation, after confirmed DELETE.
    await logAdminAction({
      adminId:    req.user.id,
      action:     "rbac.role.revoke",
      targetType: "admin_user_roles",
      targetId:   adminId,
      before:     beforeSnapshot,
      after:      null,
      req,
    });

    return res.json({ ok: true, adminId, roleId });
  } catch (err) {
    console.error("[rbac:controller] revokeRole error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
