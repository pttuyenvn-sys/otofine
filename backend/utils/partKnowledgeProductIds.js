/**
 * Resolve which catalog `products.id` values are linked to a `part_knowledge.id`
 * using whatever the live DB provides (column on `products` or a junction table).
 * Result is cached per process for INFORMATION_SCHEMA lookups.
 */

import { pool } from "../config/db.js";

/** @type {{ type: 'column', name: string } | { type: 'junction', table: string, partCol: string, prodCol: string } | { type: 'none' } | null} */
let cached = null;

/** Call after schema change (e.g. adding part_knowledge_id) or bulk UPDATE of link column. */
export function clearPartKnowledgeLinkCache() {
  cached = null;
}

async function detect() {
  if (cached) return cached;
  const [[db]] = await pool.query(`SELECT DATABASE() AS d`);
  const schema = db?.d;
  if (!schema) {
    cached = { type: "none" };
    return cached;
  }

  const [colRows] = await pool.query(
    `SELECT COLUMN_NAME AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'products'
       AND COLUMN_NAME IN ('part_knowledge_id', 'partKnowledgeId', 'knowledge_part_id')`,
    [schema],
  );
  if (colRows.length) {
    cached = { type: "column", name: colRows[0].c };
    return cached;
  }

  const tables = [
    "product_part_knowledge",
    "part_knowledge_products",
    "product_knowledge_link",
  ];
  for (const t of tables) {
    const [trows] = await pool.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [schema, t],
    );
    if (!trows.length) continue;
    const [pc] = await pool.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [schema, t],
    );
    const names = new Set(pc.map((r) => r.COLUMN_NAME));
    const partCol = names.has("part_knowledge_id")
      ? "part_knowledge_id"
      : names.has("partKnowledgeId")
        ? "partKnowledgeId"
        : null;
    const prodCol = names.has("product_id")
      ? "product_id"
      : names.has("productId")
        ? "productId"
        : null;
    if (partCol && prodCol) {
      cached = { type: "junction", table: t, partCol, prodCol };
      return cached;
    }
  }

  cached = { type: "none" };
  return cached;
}

/**
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} q
 * @param {number} partKnowledgeId
 * @returns {Promise<number[]>}
 */
export async function getProductIdsForPartKnowledge(q, partKnowledgeId) {
  const st = await detect();
  if (st.type === "none") return [];
  if (st.type === "column") {
    const [rows] = await q.query(
      `SELECT id FROM products WHERE \`${st.name}\` = ?`,
      [partKnowledgeId],
    );
    return rows.map((r) => Number(r.id));
  }
  const [rows] = await q.query(
    `SELECT \`${st.prodCol}\` AS pid FROM \`${st.table}\` WHERE \`${st.partCol}\` = ?`,
    [partKnowledgeId],
  );
  return rows.map((r) => Number(r.pid)).filter((id) => Number.isFinite(id));
}
