import { pool } from "../config/db.js";
import { getProductIdsForPartKnowledge } from "../utils/partKnowledgeProductIds.js";
import { logError, logInfo, logWarn } from "../utils/syncLogger.js";
import { normalizeText } from "../utils/normalizeText.js";
import { parseJsonArray } from "../utils/jsonSafe.js";
import { withTransaction } from "../utils/mysqlTransaction.js";
import { executeBatchValues } from "../utils/batchUpsert.js";
import { collectProductAliasKeywords } from "./productDerive.shared.js";

const SCOPE = "knowledgeService";

const SYMPTOM_MAX = 2000;

/** Semantic tokens for product_meta.normalized_name (no OEM codes, numbers, common units, optional brands). */
function normalizeSemantic(str) {
  return normalizeText(String(str), {
    semantic: true,
    stripBrands: process.env.NORMALIZE_STRIP_BRANDS === "1",
  });
}

/** Chunk size for `WHERE id IN (?)` to stay under common placeholder / packet limits. */
const PRODUCT_SELECT_IN_CHUNK = 500;

/**
 * Batch-load product rows by id; returns a map for in-memory lookup.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number[]} ids
 * @returns {Promise<Map<number, Record<string, unknown>>>}
 */
async function loadProductsByIdMap(conn, ids) {
  const map = new Map();
  const uniq = [...new Set(ids.map(Number))].filter(
    (id) => Number.isFinite(id) && id > 0,
  );
  for (let i = 0; i < uniq.length; i += PRODUCT_SELECT_IN_CHUNK) {
    const chunk = uniq.slice(i, i + PRODUCT_SELECT_IN_CHUNK);
    if (!chunk.length) continue;
    const [rows] = await conn.query(`SELECT * FROM products WHERE id IN (?)`, [
      chunk,
    ]);
    for (const row of rows) {
      map.set(Number(row.id), row);
    }
  }
  return map;
}

/**
 * @param {unknown} row
 * @returns {string[]}
 */
function collectKnowledgeAliasKeywords(row) {
  const out = new Set();
  const push = (t) => {
    const s = String(t || "").trim();
    if (s) out.add(s);
  };
  push(row.canonical_name);
  push(row.name_vi);
  push(row.name_en);
  push(row.slug && String(row.slug).replace(/-/g, " "));
  const a1 = parseJsonArray(row.aliases_json);
  const a2 = parseJsonArray(row.regional_aliases_json);
  for (const x of a1 || []) push(x);
  for (const x of a2 || []) push(x);
  return [...out];
}

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitSymptomChunks(text) {
  if (!text || !String(text).trim()) return [];
  return String(text)
    .split(/\r?\n|;|•|·/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
}

/**
 * @param {Record<string, unknown>} pk
 * @param {Record<string, unknown>} pr
 * @returns {Record<string, unknown>}
 */
function buildMetaFromKnowledgeAndProduct(pk, pr) {
  const partName = pr?.partName != null ? String(pr.partName) : null;
  const slug =
    (pr?.slug != null && String(pr.slug)) || (pk.slug != null && String(pk.slug)) || null;
  const canon =
    (pk.name_vi && String(pk.name_vi)) ||
    (pk.canonical_name && String(pk.canonical_name)) ||
    partName;
  return {
    slug,
    search_keywords: buildSearchKeywordsFromKnowledge(pk, pr),
    normalized_name: canon
      ? normalizeSemantic(canon)
      : partName
        ? normalizeSemantic(partName)
        : null,
    oem_brand: pk.brand_persona_v3 != null ? String(pk.brand_persona_v3) : null,
    quality_grade: null,
    install_position: pk.vehicle_area != null ? String(pk.vehicle_area) : null,
    life_cycle_km: null,
    priority_score:
      pk.search_score != null && pk.search_score !== ""
        ? Number(pk.search_score)
        : pk.ai_priority != null && pk.ai_priority !== ""
          ? Number(pk.ai_priority)
          : null,
  };
}

/**
 * @param {Record<string, unknown>} pk
 * @param {Record<string, unknown>} pr
 * @returns {string|null}
 */
function buildSearchKeywordsFromKnowledge(pk, pr) {
  const parts = [
    ...collectKnowledgeAliasKeywords(pk),
    pr?.partNumber,
    pr?.partName,
    pr?.origin,
  ]
    .map((x) => (x != null ? String(x).trim() : ""))
    .filter(Boolean);
  if (pk.category_name) parts.push(String(pk.category_name).trim());
  if (pk.system_group) parts.push(String(pk.system_group).trim());
  return parts.length ? [...new Set(parts)].join(" | ") : null;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {{ symptom: string, score: number }[]}
 */
function buildSymptomRowsFromKnowledge(row) {
  const out = [];
  const fromJson = parseJsonArray(row.symptom_keywords_json);
  if (fromJson) {
    for (const t of fromJson) {
      const text = String(t).trim().slice(0, SYMPTOM_MAX);
      if (!text) continue;
      out.push({ symptom: text, score: 0.85 });
    }
  }
  for (const line of splitSymptomChunks(
    row.symptoms_text != null ? String(row.symptoms_text) : "",
  )) {
    out.push({ symptom: line.slice(0, SYMPTOM_MAX), score: 0.7 });
  }
  const seen = new Set();
  return out.filter((r) => {
    if (seen.has(r.symptom)) return false;
    seen.add(r.symptom);
    return true;
  });
}

/**
 * Merged product_aliases from part_knowledge + catalog row.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} productId
 * @param {Record<string, unknown>} pk
 * @param {Record<string, unknown>} pr
 */
export async function upsertProductAliasesFromKnowledge(
  conn,
  productId,
  pk,
  pr,
) {
  const a = new Set([...collectKnowledgeAliasKeywords(pk), ...collectProductAliasKeywords(pr)]);
  const keys = [...a];
  await conn.query(`DELETE FROM product_aliases WHERE product_id = ?`, [productId]);
  if (!keys.length) return 0;
  await executeBatchValues(
    conn,
    `INSERT INTO product_aliases (product_id, keyword) VALUES ?
     ON DUPLICATE KEY UPDATE keyword = VALUES(keyword)`,
    keys.map((keyword) => [productId, keyword]),
  );
  return keys.length;
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} productId
 * @param {Record<string, unknown>} pk
 * @param {Record<string, unknown>} pr
 */
export async function upsertProductMetaFromKnowledge(conn, productId, pk, pr) {
  const m = buildMetaFromKnowledgeAndProduct(pk, pr);
  await conn.query(
    `INSERT INTO product_meta (
       product_id, slug, search_keywords, normalized_name, oem_brand,
       quality_grade, install_position, life_cycle_km, priority_score
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       slug = VALUES(slug),
       search_keywords = VALUES(search_keywords),
       normalized_name = VALUES(normalized_name),
       oem_brand = VALUES(oem_brand),
       quality_grade = VALUES(quality_grade),
       install_position = VALUES(install_position),
       life_cycle_km = VALUES(life_cycle_km),
       priority_score = VALUES(priority_score)`,
    [
      productId,
      m.slug,
      m.search_keywords,
      m.normalized_name,
      m.oem_brand,
      m.quality_grade,
      m.install_position,
      m.life_cycle_km,
      m.priority_score,
    ],
  );
  return 1;
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} productId
 * @param {Record<string, unknown>} pk
 */
export async function upsertProductSymptomsFromKnowledge(conn, productId, pk) {
  const sy = buildSymptomRowsFromKnowledge(pk);
  const strings = sy.map((s) => s.symptom);
  if (strings.length) {
    await conn.query(
      `DELETE FROM product_symptoms WHERE product_id = ? AND symptom NOT IN (${strings.map(() => "?").join(",")})`,
      [productId, ...strings],
    );
  } else {
    await conn.query(`DELETE FROM product_symptoms WHERE product_id = ?`, [productId]);
  }
  if (!sy.length) return 0;
  await executeBatchValues(
    conn,
    `INSERT INTO product_symptoms (product_id, symptom, score) VALUES ?
     ON DUPLICATE KEY UPDATE score = VALUES(score)`,
    sy.map((s) => [productId, s.symptom, s.score]),
  );
  return sy.length;
}

/**
 * @param {number|string} partId part_knowledge.id
 * @returns {Promise<{ products: number, aliases: number, meta: number, symptoms: number }>}
 */
export async function syncKnowledge(partId) {
  const id = Number(partId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error("Invalid partId");
    logError(SCOPE, err.message, { partId });
    throw err;
  }

  const [[pk]] = await pool.query(`SELECT * FROM part_knowledge WHERE id = ? LIMIT 1`, [id]);
  if (!pk) {
    logWarn(SCOPE, "part_knowledge row not found", { partId: id });
    return { products: 0, aliases: 0, meta: 0, symptoms: 0 };
  }

  try {
    return await withTransaction(pool, async (conn) => {
      const productIds = await getProductIdsForPartKnowledge(conn, id);
      const uniqueProductIds = [...new Set(productIds.map(Number))].filter(
        (pid) => Number.isFinite(pid) && pid > 0,
      );
      if (!uniqueProductIds.length) {
        logInfo(
          SCOPE,
          "no products linked to part_knowledge id (add FK or junction to sync product rows)",
          { partId: id },
        );
        return { products: 0, aliases: 0, meta: 0, symptoms: 0 };
      }

      const productById = await loadProductsByIdMap(conn, uniqueProductIds);

      let aliases = 0;
      let meta = 0;
      let symptoms = 0;
      for (const pid of uniqueProductIds) {
        const pr = productById.get(pid);
        if (!pr) continue;
        aliases += await upsertProductAliasesFromKnowledge(conn, pid, pk, pr);
        meta += await upsertProductMetaFromKnowledge(conn, pid, pk, pr);
        symptoms += await upsertProductSymptomsFromKnowledge(conn, pid, pk);
      }

      logInfo(SCOPE, "syncKnowledge done", {
        partId: id,
        products: uniqueProductIds.length,
        aliases,
        meta,
        symptoms,
      });
      return { products: uniqueProductIds.length, aliases, meta, symptoms };
    });
  } catch (e) {
    logError(SCOPE, e instanceof Error ? e.message : String(e), {
      partId: id,
      code: e?.code,
    });
    throw e;
  }
}

export { buildMetaFromKnowledgeAndProduct, collectKnowledgeAliasKeywords };
