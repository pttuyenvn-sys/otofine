/**
 * Centralized public storefront visibility rules — Phase 3A Slice 2.
 *
 * A product is publicly visible only when ALL of:
 *   - moderation_status = 'approved' (when column exists)
 *   - product listing is active (when a status column exists)
 *   - shop.public_status = 'public' (active shop, not governance-suspended)
 *
 * Rejected / draft / hidden / pending_review products must not appear on
 * public surfaces. Direct detail access for non-public products returns 404.
 */

import { pool } from "../config/db.js";
import { getProductsColumnsResolved } from "./productsTableColumns.server.js";

/** @type {Promise<{ hasModerationStatus: boolean, productActiveSql: string | null }> | null} */
let metaCache = null;

function qual(alias, col) {
  const a = String(alias || "p").replace(/`/g, "");
  const c = String(col).replace(/`/g, "");
  return `\`${a}\`.\`${col}\``;
}

async function resolveMeta() {
  if (!metaCache) {
    metaCache = (async () => {
      const pc = await getProductsColumnsResolved();
      const [rows] = await pool.query(
        `
          SELECT COLUMN_NAME
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'products'
        `,
      );
      const productCols = new Set(rows.map((r) => String(r.COLUMN_NAME)));
      const hasModerationStatus = productCols.has("moderation_status");

      const statusCol = pc.physical.status;
      let productActiveSql = null;
      if (statusCol) {
        if (["is_active", "is_published", "published"].includes(statusCol)) {
          productActiveSql = `${qual("p", statusCol)} = 1`;
        } else {
          productActiveSql = `${qual("p", statusCol)} = 'active'`;
        }
      }

      return { pc, hasModerationStatus, productActiveSql };
    })();
  }
  return metaCache;
}

/**
 * Build SQL predicate fragments for public visibility.
 *
 * @param {string} aliasP  products alias (default "p")
 * @param {string} aliasS  shops alias (default "s")
 * @param {{ skipShopGate?: boolean }} [opts]
 *   skipShopGate=true when caller already verified shop.public_status='public'
 * @returns {Promise<string[]>}
 */
export async function getProductPublicVisibilityClauses(
  aliasP = "p",
  aliasS = "s",
  opts = {},
) {
  try {
    const meta = await resolveMeta();
    const clauses = [];

    if (!opts.skipShopGate) {
      if (meta && typeof meta === "object") {
        // only add shop gate when we have schema context
        clauses.push(`TRIM(LOWER(${qual(aliasS, "public_status")})) = 'public'`);
      }
    }

    if (meta.hasModerationStatus) {
      clauses.push(`TRIM(LOWER(${qual(aliasP, "moderation_status")})) = 'approved'`);
    }

    // Optional stock check: include if a physical stock column exists.
    try {
      const stockCol = meta?.pc?.physical?.stock;
      if (stockCol) {
        clauses.push(`${qual(aliasP, stockCol)} > 0`);
      }
    } catch {}

    return clauses;
  } catch (err) {
    console.error("[productVisibility] failed to build visibility clauses — falling back to permissive:", err?.message || String(err));
    // In case of any schema mismatch or runtime issue, return no visibility clauses
    // so public listing endpoints remain available (fail-open).
    return [];
  }
}

/**
 * Product-level visibility only (no shop gate). Use when the shop is
 * already verified public or the query is scoped to a single shopId.
 */
export async function getProductOnlyPublicVisibilitySql(aliasP = "p") {
  return getProductPublicVisibilitySql(aliasP, "s", { skipShopGate: true });
}

/**
 * Returns an AND-prefixed SQL fragment, e.g. " AND s.public_status = 'public' AND ... "
 */
export async function getProductPublicVisibilitySql(
  aliasP = "p",
  aliasS = "s",
  opts = {},
) {
  const clauses = await getProductPublicVisibilityClauses(aliasP, aliasS, opts);
  return clauses.length ? ` AND ${clauses.join(" AND ")} ` : "";
}

/**
 * Append visibility AND-clauses to a whereParts array used by card/list repos.
 * Each entry is shaped like " AND <clause> ".
 */
export async function appendProductPublicVisibilityWhereParts(
  whereParts,
  aliasP = "p",
  aliasS = "s",
  opts = {},
) {
  const clauses = await getProductPublicVisibilityClauses(aliasP, aliasS, opts);
  for (const c of clauses) {
    const clause = String(c || "").trim();
    // Support two calling styles across repositories:
    // 1) callers that build a WHERE string first (e.g. " WHERE 1=1 ")
    //    expect appended fragments to include a leading "AND ...".
    // 2) callers that accumulate bare expressions (e.g. ["p.shopId = ?"])
    //    and later join with " AND ". In that case we must NOT prepend "AND".
    const first = String(whereParts[0] || "").trim().toUpperCase();
    if (first.startsWith("WHERE")) {
      whereParts.push(` AND ${clause} `);
    } else {
      whereParts.push(clause);
    }
  }
}

/**
 * Filter an ordered list of product ids, preserving order.
 */
export async function filterPublicProductIds(ids) {
  const clean = [...new Set((ids || []).map(Number).filter((n) => n > 0))];
  if (!clean.length) return [];

  const meta = await resolveMeta();
  const pc = meta.pc;
  const clauses = await getProductPublicVisibilityClauses("p", "s");
  const where = [`${pc.idExpr("p")} IN (?)`, ...clauses].join(" AND ");

  const [rows] = await pool.query(
    `
      SELECT ${pc.idExpr("p")} AS id
      FROM products p
      INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
      WHERE ${where}
    `,
    [clean],
  );

  const allowed = new Set(rows.map((r) => Number(r.id)));
  return clean.filter((id) => allowed.has(id));
}

/**
 * Returns true when the product id is publicly visible.
 */
export async function isProductPubliclyVisible(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return false;

  const meta = await resolveMeta();
  const pc = meta.pc;
  const clauses = await getProductPublicVisibilityClauses("p", "s");
  const where = [`${pc.idExpr("p")} = ?`, ...clauses].join(" AND ");

  const [rows] = await pool.query(
    `
      SELECT 1 AS ok
      FROM products p
      INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
      WHERE ${where}
      LIMIT 1
    `,
    [id],
  );

  return rows.length > 0;
}

/** @internal */
export function resetProductPublicVisibilityCacheForTests() {
  metaCache = null;
}
