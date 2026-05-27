/**
 * Shop suspension/reinstatement service — Slice 6.
 *
 * HIGH-RISK FILE: writes to production tables shops and shop_accounts.
 *
 * Critical invariants:
 *   1. Every public_status mutation MUST be followed by invalidateShop(slug).
 *   2. Reinstatement uses COALESCE(original_public_status, 'public') — never
 *      unconditionally sets 'public' (prevents publishing a pending shop).
 *   3. shop_accounts joins via shops.accountId → shop_accounts.id.
 *      shops.shopId (UUID) is NOT the correct join column.
 *   4. case_id must reference an open case (API constraint from B5 patch).
 *   5. "Currently suspended" queries must include the lazy-expiry clause:
 *      AND (expires_at IS NULL OR expires_at > NOW())
 *
 * NEVER calls logAdminAction — controller-only (B2 constraint).
 * No module-scope DB/Redis calls (PM2 startup safety).
 *
 * invalidateShop is imported via dynamic import inside functions to avoid
 * module-scope side effects at startup. The import is cached by Node.js
 * after the first call so there is no repeated I/O overhead.
 */

import { pool } from "../../../../config/db.js";

// Cache the invalidateShop import to avoid repeated dynamic imports.
let _invalidateShop = null;
async function getInvalidateShop() {
  if (!_invalidateShop) {
    const mod = await import("../../../../domains/shopPublic/cache/caches.js");
    _invalidateShop = mod.invalidateShop;
  }
  return _invalidateShop;
}

// ---------------------------------------------------------------------------
// suspendShop
// ---------------------------------------------------------------------------

export async function suspendShop(caseId, shopId, params, actorId) {
  const {
    suspension_type = "temporary",
    category = null,
    reason = "",
    expires_at = null,
    suspend_login = true,
  } = params;

  // Step 1 — Guard: Verify shop exists; fetch metadata for audit + login lock
  const [shopRows] = await pool.query(
    `SELECT s.id, s.slug, s.public_status, s.accountId,
            sa.status AS accounts_status
     FROM shops s
     LEFT JOIN shop_accounts sa ON sa.id = s.accountId
     WHERE s.id = ?`,
    [shopId],
  );
  if (!shopRows.length) {
    throw { status: 404, message: "Shop not found" };
  }
  const shop = shopRows[0];

  // Early return: shop is already suspended (before any mutation)
  if (shop.public_status === "suspended") {
    return { ok: true, alreadySuspended: true };
  }

  // Step 2 — Validate case_id: must reference an open case (B5 API constraint)
  const [caseRows] = await pool.query(
    `SELECT id FROM admin_enforcement_cases WHERE id = ? AND status = 'open'`,
    [caseId],
  );
  if (!caseRows.length) {
    throw { status: 400, message: "case_id must reference an open enforcement case" };
  }

  // Step 3 — Atomic optimistic status update
  const [updateResult] = await pool.query(
    `UPDATE shops SET public_status = 'suspended'
     WHERE id = ? AND public_status != 'suspended'`,
    [shopId],
  );
  if (updateResult.affectedRows === 0) {
    // Race condition: another request suspended the shop between Step 1 and Step 3
    return {
      ok: true,
      alreadySuspended: true,
      message: "Shop is already suspended",
    };
  }

  // Step 4 — Optional: lock seller login (best-effort; failure does not block)
  if (suspend_login && shop.accountId) {
    await pool.query(
      `UPDATE shop_accounts SET status = 'suspended'
       WHERE id = ? AND status = 'active'`,
      [shop.accountId],
    ).catch((err) => {
      console.error("[suspension:suspendShop] login lock error:", err.message);
    });
  }

  // Step 5 — Write suspension record
  const [insertResult] = await pool.query(
    `INSERT INTO admin_shop_suspensions
       (shop_id, case_id, suspension_type, category, reason,
        original_public_status, expires_at, suspended_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      shopId,
      caseId,
      suspension_type,
      category,
      reason,
      shop.public_status,    // original_public_status = value captured in Step 1
      expires_at ?? null,
      actorId,
    ],
  );

  // Step 6 — Invalidate storefront cache (MANDATORY)
  const invalidateShop = await getInvalidateShop();
  try {
    invalidateShop(shop.slug);
  } catch (err) {
    console.error("[suspension:suspendShop] cache invalidation error:", err.message);
  }

  // Return data needed by the controller for the audit before-snapshot
  return {
    ok: true,
    suspended: true,
    alreadySuspended: false,
    suspensionId: insertResult.insertId,
    shopStatusBefore: shop.public_status,        // captured in Step 1
    accountsStatusBefore: shop.accounts_status,  // captured in Step 1
  };
}

// ---------------------------------------------------------------------------
// reinstateShop
// ---------------------------------------------------------------------------

export async function reinstateShop(shopId, liftReason, actorId) {
  // Step 1 — Guard: Verify active suspension record and fetch shop metadata.
  // The lazy-expiry clause (B2 design patch) excludes expired temporary suspensions.
  const [suspRows] = await pool.query(
    `SELECT ass.id, ass.original_public_status, s.slug, s.accountId
     FROM admin_shop_suspensions ass
     JOIN shops s ON s.id = ass.shop_id
     WHERE ass.shop_id = ?
       AND ass.lifted_at IS NULL
       AND (ass.expires_at IS NULL OR ass.expires_at > NOW())
     ORDER BY ass.suspended_at DESC
     LIMIT 1`,
    [shopId],
  );
  if (!suspRows.length) {
    return { ok: true, notSuspended: true };
  }
  const susp = suspRows[0];

  // Step 2 — Mark suspension as lifted (best-effort on race)
  const [liftResult] = await pool.query(
    `UPDATE admin_shop_suspensions
     SET lifted_at = NOW(3), lifted_by = ?, lift_reason = ?
     WHERE id = ? AND lifted_at IS NULL`,
    [actorId, liftReason ?? null, susp.id],
  );
  if (liftResult.affectedRows === 0) {
    // Race condition: another admin lifted the suspension concurrently.
    // Continue — the net result (shop reinstated) is the caller's intent.
    console.warn("[suspension:reinstateShop] suspension already lifted — race condition, continuing");
  }

  // Step 3 — Restore storefront visibility to original state.
  // COALESCE(original_public_status, 'public') prevents accidental publication
  // of shops that were in 'pending' state before the suspension (B1 design patch).
  await pool.query(
    `UPDATE shops
     SET public_status = COALESCE(?, 'public')
     WHERE id = ? AND public_status = 'suspended'`,
    [susp.original_public_status ?? null, shopId],
  );

  // Step 4 — Restore seller login (best-effort)
  if (susp.accountId) {
    await pool.query(
      `UPDATE shop_accounts SET status = 'active'
       WHERE id = ? AND status = 'suspended'`,
      [susp.accountId],
    ).catch((err) => {
      console.error("[suspension:reinstateShop] login restore error:", err.message);
    });
  }

  // Step 5 — Invalidate storefront cache (MANDATORY)
  const invalidateShop = await getInvalidateShop();
  try {
    invalidateShop(susp.slug);
  } catch (err) {
    console.error("[suspension:reinstateShop] cache invalidation error:", err.message);
  }

  const restoredStatus = susp.original_public_status ?? "public";

  return {
    ok: true,
    reinstated: true,
    liftedSuspensionId: susp.id,
    restoredStatus,
  };
}
