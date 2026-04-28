/**
 * Auto-map products.part_knowledge_id by matching partName to part_knowledge
 * fields: name_vi, name_en, aliases_json, slug.
 */
import { pool } from "../config/db.js";
import { logError, logInfo, logWarn } from "../utils/syncLogger.js";
import { normalizeText } from "../utils/normalizeText.js";
import { parseJsonArray } from "../utils/jsonSafe.js";
import { clearPartKnowledgeLinkCache } from "../utils/partKnowledgeProductIds.js";

const SCOPE = "partKnowledgeMatch";

function matchNorm(s) {
  return normalizeText(s, {
    semantic: true,
    stripBrands: process.env.NORMALIZE_STRIP_BRANDS === "1",
  });
}

/** Max non-exact score is 850; above this only exact (map) or impossible. */
const EARLY_EXIT_SCORE = 850;

const BATCH = 200;

/** @type {(a: string, b: string) => number} */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * @param {string} a
 * @param {string} b
 */
function fuzzyScore01(a, b) {
  if (!a.length || !b.length) return 0;
  const d = levenshtein(a, b);
  const max = Math.max(a.length, b.length);
  return 1 - d / max;
}

/**
 * @param {string} aN
 * @param {string} bN
 */
function tokenJaccard(aN, bN) {
  const tok = (s) =>
    new Set(
      String(s)
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 1),
    );
  const A = tok(aN);
  const B = tok(bN);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) inter++;
  }
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

/**
 * @param {string} kind
 */
function baseExactForKind(kind) {
  switch (kind) {
    case "name_vi":
      return 1000;
    case "name_en":
      return 995;
    case "slug":
      return 990;
    case "alias":
      return 980;
    default:
      return 960;
  }
}

/**
 * O(variants) map: normalized string → best { partId, score } (higher score wins, lower id on tie).
 * @param {{ id: number, variants: { n: string, kind: string }[] }[]} knowledge
 * @returns {Map<string, { partId: number, score: number }>}
 */
function buildExactMatchMap(knowledge) {
  const m = new Map();
  for (const k of knowledge) {
    for (const v of k.variants) {
      const t = v.n;
      if (!t) continue;
      const sc = baseExactForKind(v.kind);
      const prev = m.get(t);
      if (
        !prev ||
        sc > prev.score ||
        (sc === prev.score && k.id < prev.partId)
      ) {
        m.set(t, { partId: k.id, score: sc });
      }
    }
  }
  return m;
}

/**
 * @param {string} pn
 * @param {{ id: number, variants: { n: string, kind: string }[] }[]} knowledge
 * @param {Map<string, { partId: number, score: number }>} exactMap
 */
function bestMatchForProduct(
  pn,
  knowledge,
  exactMap,
) {
  if (!pn) {
    return { partId: 0, score: 0 };
  }
  let best = { partId: 0, score: 0 };
  const e = exactMap.get(pn);
  if (e) {
    best = { partId: e.partId, score: e.score };
  }
  if (best.score > EARLY_EXIT_SCORE) {
    return best;
  }
  for (const k of knowledge) {
    const s = scoreAgainstKnowledge(pn, k);
    if (s > best.score) {
      best = { partId: k.id, score: s };
    }
  }
  return best;
}

/**
 * @param {string} pn — normalized part name
 * @param {{ id: number, variants: { raw: string, n: string, kind: string }[] }} k
 */
function scoreAgainstKnowledge(pn, k) {
  if (!pn) return 0;
  let best = 0;
  for (const v of k.variants) {
    const t = v.n;
    if (!t) continue;
    const kind = v.kind;

    if (pn === t) {
      best = Math.max(best, baseExactForKind(kind));
      continue;
    }

    if (t.length >= 3 && pn.length >= 3 && (t.includes(pn) || pn.includes(t))) {
      best = Math.max(best, 850);
      continue;
    }

    const fz = fuzzyScore01(pn, t);
    if (fz >= 0.88) {
      best = Math.max(best, Math.round(400 + 450 * fz));
    } else if (fz >= 0.75) {
      best = Math.max(best, Math.round(350 + 300 * fz));
    }

    const jac = tokenJaccard(pn, t);
    if (jac >= 0.4) {
      best = Math.max(best, Math.round(200 + 350 * jac));
    }
  }
  return best;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {{ id: number, variants: { raw: string, n: string, kind: string }[] }}
 */
function knowledgeToVariants(row) {
  const id = Number(row.id);
  const variants = [];
  const add = (raw, kind) => {
    if (raw == null || String(raw).trim() === "") return;
    const s = String(raw).trim();
    const n = matchNorm(s);
    if (n) variants.push({ raw: s, n, kind });
  };
  add(row.name_vi, "name_vi");
  add(row.name_en, "name_en");
  if (row.slug != null && String(row.slug).trim() !== "") {
    const s = String(row.slug)
      .trim()
      .replace(/-/g, " ");
    const n = matchNorm(s);
    if (n) {
      variants.push({ raw: String(row.slug).trim(), n, kind: "slug" });
    }
  }
  for (const x of parseJsonArray(row.aliases_json) || []) {
    add(x, "alias");
  }
  return { id, variants };
}

async function assertPartKnowledgeColumn() {
  const [[db]] = await pool.query(`SELECT DATABASE() AS d`);
  const schema = db?.d;
  if (!schema) return false;
  const [rows] = await pool.query(
    `SELECT 1 AS ok FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'products' AND COLUMN_NAME = 'part_knowledge_id'`,
    [schema],
  );
  return rows.length > 0;
}

async function loadProducts() {
  try {
    const [pRows] = await pool.query(
      `SELECT id, partName, part_knowledge_id FROM products`,
    );
    return pRows;
  } catch (e) {
    if (e?.code === "ER_BAD_FIELD_ERROR") {
      const [pRows] = await pool.query(
        `SELECT id, part_name AS partName, part_knowledge_id FROM products`,
      );
      return pRows;
    }
    throw e;
  }
}

/**
 * @param {object} [opts]
 * @param {number} [opts.minScore]
 * @param {boolean} [opts.overwrite]
 * @param {boolean} [opts.dryRun]
 * @param {(line: string) => void} [opts.onLog] — e.g. console.log
 * @param {number} [opts.batchSize] — default 200
 */
export async function runPartKnowledgeProductMatch(opts = {}) {
  const t0 = Date.now();
  const onLog = typeof opts.onLog === "function" ? opts.onLog : () => {};
  const batchSize = Math.max(
    1,
    Number(opts.batchSize || process.env.PART_MATCH_BATCH || BATCH),
  );
  const minScore = Number(
    opts.minScore ?? process.env.PART_MATCH_MIN_SCORE ?? 450,
  );
  const overwrite = Boolean(
    opts.overwrite ?? process.env.PART_MATCH_OVERWRITE === "1",
  );
  const dryRun = Boolean(
    opts.dryRun ?? process.env.PART_MATCH_DRY_RUN === "1",
  );

  const hasCol = await assertPartKnowledgeColumn();
  if (!hasCol) {
    logWarn(
      SCOPE,
      "Column products.part_knowledge_id is missing. Run migration 013_products_part_knowledge_id_mysql.sql first.",
    );
    throw new Error("products.part_knowledge_id not found");
  }

  const [kRows] = await pool.query(
    `SELECT id, name_vi, name_en, aliases_json, slug FROM part_knowledge`,
  );
  const knowledge = kRows.map(knowledgeToVariants);
  const exactMap = buildExactMatchMap(knowledge);

  const pRows = await loadProducts();
  const loadedProducts = pRows.length;
  const loadedKnowledge = kRows.length;
  onLog(`loaded products count: ${loadedProducts}`);
  onLog(`loaded part_knowledge count: ${loadedKnowledge}`);

  /** @type {{ productId: number, pn: string }[]} */
  const work = [];
  for (const p of pRows) {
    const name = p.partName;
    if (!name || !String(name).trim()) continue;
    work.push({
      productId: Number(p.id),
      pn: matchNorm(String(name)),
    });
  }
  const withName = work.length;
  onLog(`products with partName (match set): ${withName}`);

  const productById = new Map(pRows.map((p) => [Number(p.id), p]));

  /** @type {{ productId: number, partKnowledgeId: number, score: number }[]} */
  const candidates = [];
  for (let i = 0; i < work.length; i += batchSize) {
    const end = Math.min(i + batchSize, work.length);
    onLog(
      `processing products ${i + 1}–${end} / ${withName} (batch size ${batchSize})`,
    );
    for (let j = i; j < end; j++) {
      const w = work[j];
      const b = bestMatchForProduct(w.pn, knowledge, exactMap);
      if (b.partId && b.score >= minScore) {
        candidates.push({
          productId: w.productId,
          partKnowledgeId: b.partId,
          score: b.score,
        });
      }
    }
  }

  const matchedAtThreshold = candidates.length;
  const unmatched = Math.max(0, withName - matchedAtThreshold);

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.productId - b.productId;
  });

  /** @type {{ productId: number, partKnowledgeId: number, score: number }[]} */
  const toApply = [];
  let skipped = 0;
  for (const c of candidates) {
    const pr = productById.get(c.productId);
    if (!pr) continue;
    const existing = pr.part_knowledge_id;
    if (!overwrite && existing != null && Number(existing) > 0) {
      skipped++;
      continue;
    }
    toApply.push(c);
  }

  onLog(
    `matched (score ≥ min ${minScore}): ${matchedAtThreshold}, unmatched: ${unmatched}, to apply (after skip rules): ${toApply.length}, skipped: ${skipped}`,
  );

  if (dryRun) {
    const durationMs = Date.now() - t0;
    onLog(`duration ms: ${durationMs} (dry run, no DB writes)`);
    logInfo(SCOPE, "dry run — no UPDATE executed", {
      minScore,
      overwrite,
      wouldApply: toApply.length,
      skipped,
    });
    return {
      updated: 0,
      mapped: toApply,
      skipped,
      candidates: matchedAtThreshold,
      loadedProducts,
      withName,
      loadedKnowledge,
      matched: matchedAtThreshold,
      unmatched,
      toApply: toApply.length,
      durationMs,
    };
  }

  const conn = await pool.getConnection();
  let updated = 0;
  try {
    await conn.beginTransaction();
    for (let u = 0; u < toApply.length; u += batchSize) {
      const slice = toApply.slice(u, u + batchSize);
      onLog(
        `writing updates ${u + 1}–${u + slice.length} / ${toApply.length}`,
      );
      for (const c of slice) {
        await conn.query(
          `UPDATE products SET part_knowledge_id = ? WHERE id = ?`,
          [c.partKnowledgeId, c.productId],
        );
        updated++;
      }
    }
    await conn.commit();
    clearPartKnowledgeLinkCache();
  } catch (e) {
    await conn.rollback();
    logError(SCOPE, "match failed", { err: String(e?.message || e) });
    throw e;
  } finally {
    conn.release();
  }

  const durationMs = Date.now() - t0;
  onLog(`duration ms: ${durationMs}`);

  logInfo(SCOPE, "part knowledge match done", {
    minScore,
    overwrite,
    updated,
    skipped,
    durationMs,
  });
  return {
    updated,
    mapped: toApply,
    skipped,
    candidates: matchedAtThreshold,
    loadedProducts,
    withName,
    loadedKnowledge,
    matched: matchedAtThreshold,
    unmatched,
    toApply: toApply.length,
    durationMs,
  };
}
