import { pool } from "../config/db.js";
import { logError, logInfo, logWarn } from "../utils/syncLogger.js";
import { normalizeText } from "../utils/normalizeText.js";
import { withTransaction } from "../utils/mysqlTransaction.js";
import { executeBatchValues } from "../utils/batchUpsert.js";

const SCOPE = "carService";

/**
 * @param {Record<string, unknown>} row
 */
function slugFromCarRow(row) {
  const b = normalizeText(String(row.hang_xe || "")).replace(/\s+/g, "-");
  const m = normalizeText(String(row.ten_xe || "")).replace(/\s+/g, "-");
  const s = [b, m].filter(Boolean).join("-").slice(0, 500);
  return s || null;
}

/**
 * @param {Record<string, unknown>} row
 */
function pickYear(row, fromKey, toKey) {
  const yf = row[fromKey];
  const yt = row[toKey];
  const n1 = yf != null && yf !== "" ? Number(yf) : null;
  const n2 = yt != null && yt !== "" ? Number(yt) : null;
  return {
    year_from: Number.isFinite(n1) ? n1 : null,
    year_to: Number.isFinite(n2) ? n2 : null,
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function buildCarMetaPayload(row) {
  const brand = row.hang_xe != null ? String(row.hang_xe).trim() : null;
  const model = row.ten_xe != null ? String(row.ten_xe).trim() : null;
  const display = [brand, model].filter(Boolean).join(" ").trim();
  let years = pickYear(row, "year_from", "year_to");
  if (years.year_from == null && years.year_to == null) {
    years = pickYear(row, "year_start", "year_end");
  }
  const aliasesPayload = JSON.stringify({
    brand,
    model,
    full: display,
    normalized: display ? normalizeText(display) : null,
  });
  return {
    slug: slugFromCarRow(row),
    segment: null,
    body_type: null,
    origin_country: null,
    year_from: years.year_from,
    year_to: years.year_to,
    status: "active",
    popularity_score: null,
    aliases: aliasesPayload,
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function buildCarKeywordRows(row) {
  const brand = String(row.hang_xe || "").trim();
  const model = String(row.ten_xe || "").trim();
  const full = [brand, model].filter(Boolean).join(" ");
  /** @type {Map<string, { keyword: string, intent: string, priority: number }>} */
  const byKeyword = new Map();
  const add = (intent, text, priority) => {
    const t = String(text || "").trim();
    if (!t) return;
    const prev = byKeyword.get(t);
    if (!prev || priority > prev.priority) {
      byKeyword.set(t, { keyword: t, intent, priority });
    }
  };
  add("brand", brand, 90);
  add("model", model, 80);
  add("search", full, 100);
  if (brand && model) add("combined", `${model} ${brand}`, 85);
  return [...byKeyword.values()];
}

function defaultMaintenanceRows() {
  return [
    { item_name: "Dầu động cơ & lọc dầu", every_km: 10_000, every_month: 6, priority: 100 },
    { item_name: "Hệ thống phanh & dầu phanh", every_km: 20_000, every_month: 12, priority: 90 },
    { item_name: "Nước làm mát & ống dẫn", every_km: 40_000, every_month: 24, priority: 80 },
  ];
}

/**
 * @param {Record<string, unknown>} row
 */
function defaultFaultRows(row) {
  const display = [row.hang_xe, row.ten_xe].filter(Boolean).join(" ");
  return [
    {
      title: "Gợi ý chung",
      symptom:
        "Triệu chứng thực tế phụ thuộc đời xe và lịch sử bảo dưỡng.",
      cause_text: `Cần chẩn đoán tại xưởng; tham chiếu dòng ${display || "N/A"}.`,
      priority: 1,
    },
  ];
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} carModelId
 * @param {Record<string, unknown>} row
 */
export async function rebuildCarModelKeywords(conn, carModelId, row) {
  const kws = buildCarKeywordRows(row);
  await conn.query(`DELETE FROM car_model_keywords WHERE car_model_id = ?`, [carModelId]);
  if (!kws.length) return 0;
  await executeBatchValues(
    conn,
    `INSERT INTO car_model_keywords (car_model_id, keyword, intent, priority) VALUES ?
     ON DUPLICATE KEY UPDATE keyword = VALUES(keyword), intent = VALUES(intent), priority = VALUES(priority)`,
    kws.map((k) => [carModelId, k.keyword, k.intent, k.priority]),
  );
  return kws.length;
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} carModelId
 * @param {Record<string, unknown>} row
 */
export async function rebuildCarModelMeta(conn, carModelId, row) {
  const m = buildCarMetaPayload(row);
  await conn.query(
    `INSERT INTO car_model_meta (
       car_model_id, slug, segment, body_type, origin_country,
       year_from, year_to, status, popularity_score, aliases
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       slug = VALUES(slug),
       segment = VALUES(segment),
       body_type = VALUES(body_type),
       origin_country = VALUES(origin_country),
       year_from = VALUES(year_from),
       year_to = VALUES(year_to),
       status = VALUES(status),
       popularity_score = VALUES(popularity_score),
       aliases = VALUES(aliases)`,
    [
      carModelId,
      m.slug,
      m.segment,
      m.body_type,
      m.origin_country,
      m.year_from,
      m.year_to,
      m.status,
      m.popularity_score,
      m.aliases,
    ],
  );
  return 1;
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} carModelId
 */
export async function rebuildCarModelMaintenance(conn, carModelId) {
  const items = defaultMaintenanceRows();
  await conn.query(`DELETE FROM car_model_maintenance WHERE car_model_id = ?`, [carModelId]);
  await executeBatchValues(
    conn,
    `INSERT INTO car_model_maintenance (car_model_id, item_name, every_km, every_month, priority) VALUES ?
     ON DUPLICATE KEY UPDATE every_km = VALUES(every_km), every_month = VALUES(every_month), priority = VALUES(priority)`,
    items.map((i) => [carModelId, i.item_name, i.every_km, i.every_month, i.priority]),
  );
  return items.length;
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} carModelId
 * @param {Record<string, unknown>} row
 */
export async function rebuildCarModelCommonFaults(conn, carModelId, row) {
  const faults = defaultFaultRows(row);
  await conn.query(`DELETE FROM car_model_common_faults WHERE car_model_id = ?`, [carModelId]);
  await executeBatchValues(
    conn,
    `INSERT INTO car_model_common_faults (car_model_id, title, symptom, cause_text, priority) VALUES ?
     ON DUPLICATE KEY UPDATE symptom = VALUES(symptom), cause_text = VALUES(cause_text), priority = VALUES(priority)`,
    faults.map((f) => [carModelId, f.title, f.symptom, f.cause_text, f.priority]),
  );
  return faults.length;
}

/**
 * @param {import('mysql2/promise').PoolConnection} [outerConn]
 * @returns {Promise<number>}
 */
export async function rebuildAllCarModelRelations(outerConn) {
  const run = async (c) => {
    await c.query(`DELETE FROM car_model_relations WHERE relation_type = 'same_brand_sibling'`);
    const [brands] = await c.query(
      `SELECT hang_xe AS b FROM car_models WHERE hang_xe IS NOT NULL AND TRIM(hang_xe) <> '' GROUP BY hang_xe`,
    );
    let total = 0;
    for (const { b } of brands) {
      const [ids] = await c.query(
        `SELECT id FROM car_models WHERE hang_xe = ? ORDER BY id ASC LIMIT 200`,
        [b],
      );
      const list = ids.map((r) => r.id);
      const batch = [];
      for (let i = 0; i < list.length; i++) {
        const maxJ = Math.min(i + 9, list.length);
        for (let j = i + 1; j < maxJ; j++) {
          const a = list[i];
          const bId = list[j];
          batch.push([a, bId, "same_brand_sibling"]);
          if (batch.length >= 200) {
            await executeBatchValues(
              c,
              `INSERT INTO car_model_relations (car_model_id, related_car_model_id, relation_type) VALUES ?
               ON DUPLICATE KEY UPDATE relation_type = VALUES(relation_type)`,
              batch,
            );
            total += batch.length;
            batch.length = 0;
          }
        }
      }
      if (batch.length) {
        await executeBatchValues(
          c,
          `INSERT INTO car_model_relations (car_model_id, related_car_model_id, relation_type) VALUES ?
           ON DUPLICATE KEY UPDATE relation_type = VALUES(relation_type)`,
          batch,
        );
        total += batch.length;
      }
    }
    return total;
  };

  if (outerConn) {
    return run(outerConn);
  }
  return withTransaction(pool, run);
}

/**
 * @param {number|string} carModelId
 */
export async function syncCar(carModelId) {
  const id = Number(carModelId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error("Invalid carModelId");
    logError(SCOPE, err.message, { carModelId });
    throw err;
  }

  const [[row]] = await pool.query(`SELECT * FROM car_models WHERE id = ? LIMIT 1`, [id]);
  if (!row) {
    logWarn(SCOPE, "car_models row not found", { carModelId: id });
    return { keywords: 0, meta: 0, maintenance: 0, faults: 0 };
  }

  try {
    return await withTransaction(pool, async (conn) => {
      const keywords = await rebuildCarModelKeywords(conn, id, row);
      const meta = await rebuildCarModelMeta(conn, id, row);
      const maintenance = await rebuildCarModelMaintenance(conn, id);
      const faults = await rebuildCarModelCommonFaults(conn, id, row);
      logInfo(SCOPE, "syncCar done", { carModelId: id, keywords, meta, maintenance, faults });
      return { keywords, meta, maintenance, faults };
    });
  } catch (e) {
    logError(SCOPE, e instanceof Error ? e.message : String(e), {
      carModelId: id,
      code: e?.code,
    });
    throw e;
  }
}
