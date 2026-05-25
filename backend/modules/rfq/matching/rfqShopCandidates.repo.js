import { pool } from "../../../config/db.js";

/**
 * Phase 8.1 — RFQ supplier matching: candidate pool repository.
 *
 * Job: given a `MatchInput`, return the BOUNDED set of public shop
 * ids that could plausibly answer this RFQ. We deliberately keep
 * this layer SQL-only — no JS scoring, no DTO projection. That
 * happens in the scorer.
 *
 * Candidate strategy (additive; signals union):
 *
 *   1. Brand candidates  — shops that have ≥ 1 product whose
 *                          `car_models.hang_xe` matches the RFQ's
 *                          vehicle brand. Strongest signal; high
 *                          precision.
 *   2. Part candidates   — shops that have ≥ 1 product whose
 *                          `part_knowledge.system_group` overlaps
 *                          the RFQ's resolved system groups. Lower
 *                          precision but recovers RFQs where the
 *                          vehicle brand isn't well-represented.
 *   3. Geo candidates    — shops in the RFQ's province. Used as a
 *                          tiebreaker, never as a sole signal.
 *   4. Wide fallback     — any public shop with ≥ 1 product. Only
 *                          taken when the precision-targeted pools
 *                          can't fill `wantSize`. Prevents zero-
 *                          results on sparse-inventory categories.
 *
 * All four queries are public-status-gated (no `pending` /
 * `suspended` shops ever surface), capped at `CANDIDATE_CAP` total
 * rows fetched, and run in parallel.
 */

const CANDIDATE_CAP = 80; // hard ceiling; scorer will trim to top-N

export async function loadCandidateShopIds(input, opts = {}) {
  const wantSize = Math.min(CANDIDATE_CAP, Math.max(8, Number(opts.candidatePool) || 40));

  const [brandIds, partIds, geoIds] = await Promise.all([
    findShopsByBrand(input.vehicle.brand, wantSize),
    findShopsBySystemGroups(input.part.systemGroups, wantSize),
    findShopsByProvinceId(input.location.provinceId, wantSize),
  ]);

  const union = new Set([...brandIds, ...partIds, ...geoIds]);

  if (union.size < wantSize) {
    const fallback = await findShopsWideFallback(wantSize - union.size, union);
    for (const id of fallback) union.add(id);
  }

  return {
    ids: Array.from(union).slice(0, CANDIDATE_CAP),
    counts: {
      byBrand: brandIds.length,
      byPart: partIds.length,
      byGeo: geoIds.length,
      total: union.size,
    },
  };
}

async function findShopsByBrand(brandRaw, limit) {
  const brand = String(brandRaw || "").trim();
  if (!brand) return [];
  const [rows] = await pool.query(
    `SELECT DISTINCT s.id
       FROM shops s
       JOIN products p ON p.shopId = s.id
       JOIN product_car_applications pca ON pca.productId = p.id
       JOIN car_models cm ON cm.id = pca.carModelId
      WHERE s.public_status = 'public'
        AND cm.hang_xe = ?
      LIMIT ?`,
    [brand, limit],
  );
  return rows.map((r) => Number(r.id));
}

async function findShopsBySystemGroups(systemGroups, limit) {
  if (!systemGroups?.length) return [];
  const placeholders = systemGroups.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT DISTINCT p.shopId AS id
       FROM products p
       JOIN shops s ON s.id = p.shopId
       JOIN part_knowledge pk ON pk.id = p.part_knowledge_id
      WHERE s.public_status = 'public'
        AND pk.system_group IN (${placeholders})
      LIMIT ?`,
    [...systemGroups, limit],
  );
  return rows.map((r) => Number(r.id));
}

async function findShopsByProvinceId(provinceId, limit) {
  const id = Number(provinceId);
  if (!Number.isFinite(id) || id <= 0) return [];
  const [rows] = await pool.query(
    `SELECT id FROM shops
      WHERE public_status = 'public' AND provinceId = ?
      LIMIT ?`,
    [id, limit],
  );
  return rows.map((r) => Number(r.id));
}

async function findShopsWideFallback(want, exclude) {
  if (want <= 0) return [];
  if (exclude.size === 0) {
    const [rows] = await pool.query(
      `SELECT DISTINCT p.shopId AS id
         FROM products p
         JOIN shops s ON s.id = p.shopId
        WHERE s.public_status = 'public'
        ORDER BY p.shopId ASC
        LIMIT ?`,
      [want],
    );
    return rows.map((r) => Number(r.id));
  }
  const excludeArr = Array.from(exclude);
  const placeholders = excludeArr.map(() => "?").join(",");
  const [rows] = await pool.query(
    `SELECT DISTINCT p.shopId AS id
       FROM products p
       JOIN shops s ON s.id = p.shopId
      WHERE s.public_status = 'public'
        AND p.shopId NOT IN (${placeholders})
      ORDER BY p.shopId ASC
      LIMIT ?`,
    [...excludeArr, want],
  );
  return rows.map((r) => Number(r.id));
}
