import { pool } from "../config/db.js";

let _invalidateShop = null;
async function getInvalidateShop() {
  if (!_invalidateShop) {
    const mod = await import("../domains/shopPublic/cache/caches.js");
    _invalidateShop = mod.invalidateShop;
  }
  return _invalidateShop;
}

/**
 * Governance-safe shop delete (legacy admin route: shop_accounts.id).
 *
 * - Soft-deletes the seller account (existing behaviour)
 * - Suspends the public storefront (shops.public_status = 'suspended')
 * - Preserves slug, products, and RFQ history
 * - Invalidates storefront cache
 */
export async function deleteAdminShop(accountId) {
  const [[acc]] = await pool.query(
    `
      SELECT
        sa.id,
        sa.status,
        s.id AS governanceShopId,
        s.slug,
        s.public_status AS publicStatus
      FROM shop_accounts sa
      LEFT JOIN shops s ON s.accountId = sa.id
      WHERE sa.id = ?
      LIMIT 1
    `,
    [accountId],
  );

  if (!acc) {
    return { status: 404, body: { message: "Shop không tồn tại" } };
  }

  if (acc.status === "active") {
    return {
      status: 400,
      body: { message: "Phải khóa shop trước khi xóa" },
    };
  }

  if (acc.status === "deleted") {
    return { status: 200, body: { ok: true, unchanged: true } };
  }

  await pool.query(`UPDATE shop_accounts SET status = 'deleted' WHERE id = ?`, [accountId]);

  if (acc.governanceShopId) {
    await pool.query(`UPDATE shops SET public_status = 'suspended' WHERE id = ?`, [
      acc.governanceShopId,
    ]);
  }

  if (acc.slug) {
    try {
      const invalidateShop = await getInvalidateShop();
      invalidateShop(acc.slug);
    } catch (err) {
      console.error("[adminShopDelete] cache invalidation error:", err.message);
    }
  }

  return {
    status: 200,
    body: {
      ok: true,
      governanceShopId: acc.governanceShopId ?? null,
      slug: acc.slug ?? null,
      publicStatus: "suspended",
    },
  };
}
