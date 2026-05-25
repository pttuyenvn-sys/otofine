import { pool } from "../../../config/db.js";

/**
 * Phase 7.1 — public shop directory queries.
 *
 * Read-only repository. NEVER writes. All queries are filtered by
 * `public_status = 'public'` so non-published shops cannot leak into
 * any discovery surface.
 *
 * The directory is intentionally separate from `shopPublic.repository`:
 *   - shopPublic.* serves "I already know the slug, give me the shop"
 *     and is keyed by slug (5,000-entry LRU per process).
 *   - shopDirectory.* serves "show me a list of shops matching X" and
 *     is keyed by (filters, page) at the controller/cache layer.
 *
 * The split means a query-heavy directory page CANNOT poison the
 * per-slug existence cache, and vice versa.
 */

/**
 * The set of columns we project for a single directory card. Kept
 * tight on purpose — anything not visible on a card stays out so the
 * response payload (which is cached) is small.
 */
const DIRECTORY_COLUMNS = `
  s.id,
  s.slug,
  s.name,
  s.bio,
  s.avatar,
  COALESCE(s.cover_image, s.cover) AS cover,
  s.phone,
  COALESCE(s.zalo_phone, s.zalo) AS zalo,
  s.facebook_url,
  s.provinceId,
  s.updatedAt,
  s.published_at,
  s.createdAt,
  s.verified_at,
  s.intro_html,
  s.descriptionHtml
`;

/**
 * Whitelisted sort modes. Anything else falls back to `rank` (the
 * deterministic ranking score; see services/shopRanking.js).
 *
 * - rank   : default; controller injects ORDER BY after computing score
 * - newest : recently published shops first
 * - name   : alphabetic, stable for "browse all"
 */
export const DIRECTORY_SORTS = Object.freeze(["rank", "newest", "name"]);

/**
 * Whitelisted "minimum product count" tiers. Used by the filter UI
 * so a single integer maps to a friendly label. Keep the bands wide
 * enough that a small shop doesn't fall in and out as a single new
 * SKU goes live.
 */
export const PRODUCT_TIERS = Object.freeze({
  any:  0,
  some: 1,    // at least 1 published product
  ten:  10,
  fifty: 50,
  hundred: 100,
});

/**
 * Internal — build the WHERE / params arrays once so both the count
 * query and the row query stay in lockstep.
 */
function buildFilterClause({ q, brand, provinceSlug, verified, minProducts }) {
  const where = [`s.public_status = 'public'`];
  const params = [];

  if (q && typeof q === "string") {
    const needle = `%${q.trim().slice(0, 60)}%`;
    where.push(`(s.name LIKE ? OR s.bio LIKE ?)`);
    params.push(needle, needle);
  }

  if (provinceSlug && typeof provinceSlug === "string") {
    where.push(`EXISTS (
      SELECT 1 FROM address a
      WHERE a.id = s.provinceId AND a.tinh_tp_slug = ?
    )`);
    params.push(provinceSlug.trim().toLowerCase());
  }

  if (verified === true) {
    where.push(`s.verified_at IS NOT NULL`);
  }

  if (brand && typeof brand === "string") {
    // Shop has at least one product with a car application matching brand.
    where.push(`EXISTS (
      SELECT 1
      FROM products p
      JOIN product_car_applications pca ON pca.productId = p.id
      JOIN car_models cm ON cm.id = pca.carModelId
      WHERE p.shopId = s.id AND cm.hang_xe = ?
    )`);
    params.push(brand.trim());
  }

  if (Number.isFinite(Number(minProducts)) && Number(minProducts) > 0) {
    // Sub-select keeps the main FROM clean and lets MySQL pick the
    // best index on `products(shopId)`. We avoid an outer HAVING so
    // the same predicate is reusable in both COUNT and LIMIT queries.
    where.push(`(SELECT COUNT(*) FROM products WHERE shopId = s.id) >= ?`);
    params.push(Number(minProducts));
  }

  return { where: where.join(" AND "), params };
}

/**
 * Internal — bulk-load product counts for an array of shop ids.
 *
 * Faster than a correlated subquery in the main projection because
 * a single grouped scan is cheaper than N row-by-row sub-queries.
 * Returns a Map<shopId, count>; absent ids default to 0.
 */
async function loadProductCounts(shopIds) {
  if (!shopIds.length) return new Map();
  const placeholders = shopIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT shopId, COUNT(*) AS n
       FROM products
      WHERE shopId IN (${placeholders})
      GROUP BY shopId`,
    shopIds,
  );
  const out = new Map();
  for (const r of rows) out.set(Number(r.shopId), Number(r.n) || 0);
  return out;
}

/**
 * Internal — bulk-load top vehicle brands (max 3 per shop) for an
 * array of shop ids.
 *
 * Returns Map<shopId, Array<{ brand, productCount }>>.
 */
async function loadTopBrands(shopIds, perShop = 3) {
  if (!shopIds.length) return new Map();
  const placeholders = shopIds.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT p.shopId, cm.hang_xe AS brand, COUNT(DISTINCT pca.productId) AS cnt
       FROM product_car_applications pca
       JOIN car_models cm ON cm.id = pca.carModelId
       JOIN products p     ON p.id  = pca.productId
      WHERE p.shopId IN (${placeholders})
        AND cm.hang_xe IS NOT NULL AND cm.hang_xe <> ''
      GROUP BY p.shopId, cm.hang_xe
      ORDER BY p.shopId ASC, cnt DESC, brand ASC`,
    shopIds,
  );
  const acc = new Map();
  for (const r of rows) {
    const id = Number(r.shopId);
    if (!acc.has(id)) acc.set(id, []);
    const list = acc.get(id);
    if (list.length < perShop) {
      list.push({ brand: r.brand, productCount: Number(r.cnt) || 0 });
    }
  }
  return acc;
}

/**
 * Internal — bulk-load province labels for an array of shop ids.
 */
async function loadProvinces(provinceIds) {
  const unique = Array.from(new Set(provinceIds.filter((id) => id != null)));
  if (!unique.length) return new Map();
  const placeholders = unique.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT id, tinh_tp AS name, tinh_tp_slug AS slug
       FROM address
      WHERE id IN (${placeholders})`,
    unique,
  );
  const out = new Map();
  for (const r of rows) out.set(Number(r.id), { name: r.name, slug: r.slug });
  return out;
}

/**
 * List public shops matching the given filters.
 *
 * Returns the COMPLETE set of matching rows (no DB-side LIMIT yet) so
 * the caller can apply the deterministic ranking score and then slice
 * the page. The match set is hard-capped at `HARD_CAP` to keep the
 * worst-case scan bounded — way more than the user's ever going to
 * page through and well within memory for a Vietnam-scale catalogue.
 *
 * Bulk-loads dependent data (product counts, top brands, province
 * labels) in three parallel grouped queries instead of N+1
 * sub-selects. For 200 shops total: ~4 round-trips regardless of N.
 */
const HARD_CAP = 200;

export async function listPublicShopsForDirectory(filters = {}) {
  const { where, params } = buildFilterClause(filters);

  const [shopRows] = await pool.query(
    `SELECT ${DIRECTORY_COLUMNS}
       FROM shops s
      WHERE ${where}
      ORDER BY s.id ASC
      LIMIT ${HARD_CAP}`,
    params,
  );

  const shopIds = shopRows.map((r) => Number(r.id));
  const [productCounts, topBrands, provinces] = await Promise.all([
    loadProductCounts(shopIds),
    loadTopBrands(shopIds, 3),
    loadProvinces(shopRows.map((r) => r.provinceId)),
  ]);

  return shopRows.map((row) => ({
    ...row,
    productCount: productCounts.get(Number(row.id)) || 0,
    topBrands: topBrands.get(Number(row.id)) || [],
    province: provinces.get(Number(row.provinceId))?.name || null,
    provinceSlug: provinces.get(Number(row.provinceId))?.slug || null,
  }));
}

/**
 * Count public shops matching the filter set, ignoring pagination.
 * Cheap enough to call alongside the row query because the WHERE
 * clause uses the same indexable predicates.
 */
export async function countPublicShopsForDirectory(filters = {}) {
  const { where, params } = buildFilterClause(filters);
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM shops s WHERE ${where}`,
    params,
  );
  return Number(rows[0]?.n) || 0;
}

/**
 * Province facets — distinct provinces with at least one public shop.
 * Used to populate the filter dropdown. Cheap (grouped + indexed).
 */
export async function listPublicShopProvinces() {
  const [rows] = await pool.query(
    `SELECT a.tinh_tp_slug AS slug, MAX(a.tinh_tp) AS name, COUNT(DISTINCT s.id) AS shopCount
       FROM shops s
       JOIN address a ON a.id = s.provinceId
      WHERE s.public_status = 'public'
        AND a.tinh_tp_slug IS NOT NULL
      GROUP BY a.tinh_tp_slug
      ORDER BY shopCount DESC, name ASC
      LIMIT 100`,
  );
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    shopCount: Number(r.shopCount) || 0,
  }));
}

/**
 * Brand facets — distinct vehicle brands covered by at least one
 * public shop's product catalogue. The same brand list is used by
 * apex marketplace search, so we keep the canonicalization identical
 * (raw `car_models.hang_xe` value, no normalization).
 */
export async function listPublicShopBrands() {
  const [rows] = await pool.query(
    `SELECT cm.hang_xe AS brand, COUNT(DISTINCT s.id) AS shopCount
       FROM shops s
       JOIN products p     ON p.shopId = s.id
       JOIN product_car_applications pca ON pca.productId = p.id
       JOIN car_models cm  ON cm.id = pca.carModelId
      WHERE s.public_status = 'public'
        AND cm.hang_xe IS NOT NULL AND cm.hang_xe <> ''
      GROUP BY cm.hang_xe
      ORDER BY shopCount DESC, brand ASC
      LIMIT 50`,
  );
  return rows.map((r) => ({ brand: r.brand, shopCount: Number(r.shopCount) || 0 }));
}

/**
 * Find shops "similar" to the given shop id.
 *
 * Similarity signal (intentionally simple and deterministic):
 *   1. share at least one top vehicle brand, OR
 *   2. share the same provinceId, OR
 *   3. fall back to any other public shop (so the section never
 *      renders empty when the catalogue is small).
 *
 * The function returns up to `limit` rows, sorted by:
 *   - matching brand overlap DESC
 *   - same province before different province
 *   - id ASC (deterministic tie-breaker)
 *
 * We exclude the source shop itself.
 *
 * Bulk-loads the same enrichment data as the directory query so the
 * caller renders identical ShopCard shapes.
 */
export async function listRelatedShops({ shopId, limit = 6 }) {
  if (!shopId) return [];

  const [seedRow] = await pool.query(
    `SELECT s.id, s.provinceId
       FROM shops s
      WHERE s.id = ? AND s.public_status = 'public'
      LIMIT 1`,
    [shopId],
  );
  if (!seedRow.length) return [];
  const seed = seedRow[0];

  // Source shop's brands (max 3) — overlap drives the primary ranking
  // signal. Cheap because we already index pca by productId.
  const [seedBrandsRows] = await pool.query(
    `SELECT cm.hang_xe AS brand
       FROM products p
       JOIN product_car_applications pca ON pca.productId = p.id
       JOIN car_models cm ON cm.id = pca.carModelId
      WHERE p.shopId = ?
        AND cm.hang_xe IS NOT NULL AND cm.hang_xe <> ''
      GROUP BY cm.hang_xe
      ORDER BY COUNT(*) DESC, brand ASC
      LIMIT 3`,
    [shopId],
  );
  const seedBrands = seedBrandsRows.map((r) => r.brand).filter(Boolean);

  // Candidate pool — any public shop that overlaps in brand or
  // province, plus all other public shops as a wide fallback.
  const candidateIds = new Set();

  if (seedBrands.length > 0) {
    const placeholders = seedBrands.map(() => "?").join(",");
    const [rows] = await pool.query(
      `SELECT DISTINCT p.shopId AS id
         FROM products p
         JOIN product_car_applications pca ON pca.productId = p.id
         JOIN car_models cm ON cm.id = pca.carModelId
         JOIN shops s ON s.id = p.shopId
        WHERE cm.hang_xe IN (${placeholders})
          AND p.shopId <> ?
          AND s.public_status = 'public'
        LIMIT 50`,
      [...seedBrands, shopId],
    );
    rows.forEach((r) => candidateIds.add(Number(r.id)));
  }

  if (seed.provinceId) {
    const [rows] = await pool.query(
      `SELECT id FROM shops
        WHERE provinceId = ? AND id <> ? AND public_status = 'public'
        LIMIT 50`,
      [seed.provinceId, shopId],
    );
    rows.forEach((r) => candidateIds.add(Number(r.id)));
  }

  // Wide fallback — any other public shop. Bounded by HARD_CAP-ish.
  if (candidateIds.size < limit) {
    const [rows] = await pool.query(
      `SELECT id FROM shops
        WHERE id <> ? AND public_status = 'public'
        ORDER BY id ASC
        LIMIT 50`,
      [shopId],
    );
    rows.forEach((r) => candidateIds.add(Number(r.id)));
  }

  if (candidateIds.size === 0) return [];

  const idList = Array.from(candidateIds);
  const placeholders = idList.map(() => "?").join(",");
  const [shopRows] = await pool.query(
    `SELECT ${DIRECTORY_COLUMNS}
       FROM shops s
      WHERE s.id IN (${placeholders}) AND s.public_status = 'public'`,
    idList,
  );

  const shopIds = shopRows.map((r) => Number(r.id));
  const [productCounts, topBrands, provinces] = await Promise.all([
    loadProductCounts(shopIds),
    loadTopBrands(shopIds, 3),
    loadProvinces(shopRows.map((r) => r.provinceId)),
  ]);

  const seedBrandSet = new Set(seedBrands);
  return shopRows
    .map((row) => {
      const topBrandList = topBrands.get(Number(row.id)) || [];
      const overlap = topBrandList.reduce(
        (n, b) => n + (seedBrandSet.has(b.brand) ? 1 : 0),
        0,
      );
      const sameProvince = row.provinceId && row.provinceId === seed.provinceId;
      return {
        ...row,
        productCount: productCounts.get(Number(row.id)) || 0,
        topBrands: topBrandList,
        province: provinces.get(Number(row.provinceId))?.name || null,
        provinceSlug: provinces.get(Number(row.provinceId))?.slug || null,
        _relevance: overlap * 10 + (sameProvince ? 3 : 0),
      };
    })
    .sort((a, b) => {
      if (b._relevance !== a._relevance) return b._relevance - a._relevance;
      return a.id - b.id;
    })
    .slice(0, limit)
    .map(({ _relevance, ...row }) => row);
}
