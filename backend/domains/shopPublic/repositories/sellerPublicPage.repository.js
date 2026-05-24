import { pool } from "../../../config/db.js";

/**
 * Owner-side (read+write) repository for the shop public page.
 *
 * Separate from the public read-only repository so that the public-API
 * shape never changes when we tweak the seller-facing one.
 */

const OWNER_SHOP_COLUMNS = `
  id, accountId, slug, public_status, name, bio,
  avatar, cover_image, cover,
  phone, email, zalo_phone, zalo, facebook_url, website,
  provinceId, districtId, wardId, addressDetail, working_hours,
  descriptionHtml, intro_html, salePolicy, warrantyPolicy,
  lat, lng, map_embed_url, verified_at, published_at,
  createdAt, updatedAt
`;

export async function findOwnedShop(shopId) {
  if (!shopId) return null;
  const [rows] = await pool.query(
    `SELECT ${OWNER_SHOP_COLUMNS} FROM shops WHERE id = ? LIMIT 1`,
    [shopId],
  );
  return rows[0] || null;
}

/**
 * Realtime slug availability — returns the OWNING shop id if the slug
 * already exists, else null. The caller compares to the current shop id
 * to decide whether it's a conflict.
 *
 * SAFE: only reads `slug`, never any other field.
 */
export async function findShopIdBySlug(slug) {
  if (!slug) return null;
  const [rows] = await pool.query(
    `SELECT id FROM shops WHERE slug = ? LIMIT 1`,
    [slug.toLowerCase()],
  );
  return rows[0]?.id ?? null;
}

/**
 * Update the public-page subset of fields. Only the listed columns are
 * ever written from this code path — `name`, `accountId`, `phone`, etc.
 * stay under the existing seller settings flow.
 *
 * `data` MUST be sanitized + validated by the service layer first.
 *
 * SEMANTIC CONTRACT for `data`:
 *   - key MISSING entirely  → column untouched (PATCH semantics)
 *   - key === null          → column explicitly cleared to NULL
 *   - key === <value>       → column overwritten to <value>
 *
 * The dynamic SET builder below preserves that distinction; an earlier
 * static-SQL version silently coerced undefined → null and wiped fields
 * the seller never touched.
 */
const PATCHABLE_COLUMNS = [
  "slug",
  "public_status",
  "bio",
  "intro_html",
  "cover_image",
  "avatar",
  "facebook_url",
  "zalo_phone",
  "working_hours",
  "map_embed_url",
  "addressDetail",
];

export async function updatePublicPageConfig(shopId, data) {
  const sets = [];
  const params = [];
  for (const col of PATCHABLE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(data, col)) {
      sets.push(`${col} = ?`);
      params.push(data[col] ?? null);
    }
  }
  // First-publish bookkeeping: stamp published_at the moment we flip
  // public_status to 'public' for the first time. Subsequent flips keep
  // the original published_at.
  if (
    Object.prototype.hasOwnProperty.call(data, "public_status")
    && data.public_status === "public"
  ) {
    sets.push("published_at = COALESCE(published_at, NOW())");
  }
  sets.push("updatedAt = CURRENT_TIMESTAMP");
  params.push(shopId);
  const sql = `UPDATE shops SET ${sets.join(", ")} WHERE id = ?`;
  const [res] = await pool.query(sql, params);
  return res;
}

/** Persist only the avatar URL (used by upload endpoint). */
export async function updateShopAvatar(shopId, url) {
  const [res] = await pool.query(
    `UPDATE shops SET avatar = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    [url, shopId],
  );
  return res;
}

/** Persist only the cover URL (used by upload endpoint). */
export async function updateShopCover(shopId, url) {
  const [res] = await pool.query(
    `UPDATE shops SET cover_image = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    [url, shopId],
  );
  return res;
}
