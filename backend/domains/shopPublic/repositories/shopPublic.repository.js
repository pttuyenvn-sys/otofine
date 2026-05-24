import { pool } from "../../../config/db.js";

/**
 * Read-only repository for the public shop site.
 *
 * IMPORTANT: this repository only ever SELECTs. It never touches the
 * existing seller-protected shop CRUD path. The `shops` table itself
 * is shared, but the queries below filter strictly by `slug` and
 * `public_status = 'public'` so a non-published shop can never leak.
 */

const PUBLIC_SHOP_COLUMNS = `
  s.id,
  s.slug,
  s.public_status,
  s.name,
  s.bio,
  s.avatar,
  COALESCE(s.cover_image, s.cover) AS cover,
  s.phone,
  s.email,
  COALESCE(s.zalo_phone, s.zalo) AS zalo,
  s.facebook_url,
  s.website,
  s.provinceId,
  s.districtId,
  s.wardId,
  s.addressDetail,
  s.working_hours,
  s.descriptionHtml,
  s.intro_html,
  s.salePolicy,
  s.warrantyPolicy,
  s.lat,
  s.lng,
  s.map_embed_url,
  s.verified_at,
  s.published_at,
  s.createdAt,
  s.updatedAt
`;

/** Resolve a slug to a publicly-visible shop row, or null. */
export async function findPublicShopBySlug(slug) {
  if (!slug) return null;
  const [rows] = await pool.query(
    `
      SELECT ${PUBLIC_SHOP_COLUMNS},
             a.tinh_tp AS provinceLabel
      FROM shops s
      LEFT JOIN address a ON a.id = s.provinceId
      WHERE s.slug = ? AND s.public_status = 'public'
      LIMIT 1
    `,
    [slug],
  );
  return rows[0] || null;
}

/** Count published products owned by the shop. */
export async function countPublicShopProducts(shopId) {
  if (!shopId) return 0;
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM products WHERE shopId = ?`,
    [shopId],
  );
  return Number(rows[0]?.n) || 0;
}

/**
 * Distinct categories that this shop has products in.
 * Joins via the existing `product_category_map` ↔ `product_categories`.
 */
export async function listShopCategories(shopId) {
  if (!shopId) return [];
  const [rows] = await pool.query(
    `
      SELECT
        pc.id,
        pc.category_name AS name,
        pc.canonical_name AS slug,
        COUNT(DISTINCT p.id) AS productCount
      FROM products p
      JOIN product_category_map pcm ON pcm.product_id = p.id
      JOIN product_categories pc    ON pc.id = pcm.category_id
      WHERE p.shopId = ?
      GROUP BY pc.id, pc.category_name, pc.canonical_name
      ORDER BY productCount DESC, pc.category_name ASC
      LIMIT 50
    `,
    [shopId],
  );
  return rows;
}
