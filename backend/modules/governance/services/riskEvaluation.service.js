import { pool } from "../../../config/db.js";
import { logEvaluationFailure } from "./governanceLogger.server.js";

/** @type {Promise<boolean> | null} */
let riskEvaluatedAtColumnCache = null;

async function hasRiskEvaluatedAtColumn() {
  if (!riskEvaluatedAtColumnCache) {
    riskEvaluatedAtColumnCache = (async () => {
      const [rows] = await pool.query(
        `
        SELECT COUNT(*) AS n
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'products'
          AND COLUMN_NAME = 'risk_evaluated_at'
      `,
      );
      return Number(rows?.[0]?.n || 0) > 0;
    })();
  }
  return riskEvaluatedAtColumnCache;
}

export async function markProductRiskEvaluated(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return;
  if (!(await hasRiskEvaluatedAtColumn())) return;
  await pool.query(`UPDATE products SET risk_evaluated_at = NOW() WHERE id = ?`, [id]);
}

export async function countPendingProductsNeedingEvaluation({ skipMinutes = 10 } = {}) {
  const skip = Math.max(1, Math.floor(Number(skipMinutes) || 10));
  const hasCol = await hasRiskEvaluatedAtColumn();

  if (hasCol) {
    const [[row]] = await pool.query(
      `
        SELECT COUNT(*) AS n
        FROM products
        WHERE TRIM(LOWER(moderation_status)) = 'pending_review'
          AND (
            risk_evaluated_at IS NULL
            OR risk_evaluated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
          )
      `,
      [skip],
    );
    return Number(row?.n || 0);
  }

  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS n FROM products WHERE TRIM(LOWER(moderation_status)) = 'pending_review'`,
  );
  return Number(row?.n || 0);
}

/** Canonical product risk flag codes. */
export const FLAG_CODES = {
  HIGH_REJECT_RATE: "HIGH_REJECT_RATE",
  NEW_SHOP_HIGH_VOLUME: "NEW_SHOP_HIGH_VOLUME",
  DUPLICATE_PART_NUMBER: "DUPLICATE_PART_NUMBER",
  TOO_MANY_PENDING: "TOO_MANY_PENDING",
  LOW_IMAGE_COUNT: "LOW_IMAGE_COUNT",
  NO_DESCRIPTION: "NO_DESCRIPTION",
  SUSPICIOUS_PRICE: "SUSPICIOUS_PRICE",
};

/** Deterministic score weights — mirrored across dashboard + queue. */
export const FLAG_WEIGHTS = {
  [FLAG_CODES.HIGH_REJECT_RATE]: 50,
  [FLAG_CODES.NEW_SHOP_HIGH_VOLUME]: 40,
  [FLAG_CODES.DUPLICATE_PART_NUMBER]: 25,
  [FLAG_CODES.TOO_MANY_PENDING]: 20,
  [FLAG_CODES.LOW_IMAGE_COUNT]: 10,
  [FLAG_CODES.NO_DESCRIPTION]: 10,
  [FLAG_CODES.SUSPICIOUS_PRICE]: 20,
};

export const RISK_THRESHOLDS = {
  critical: 80,
  high: 50,
  medium: 25,
};

const PRIORITY_RANK = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export function getFlagWeightSql(alias = "rf") {
  const a = String(alias || "rf").replace(/`/g, "");
  const cases = Object.entries(FLAG_WEIGHTS)
    .map(([code, weight]) => `WHEN '${code}' THEN ${weight}`)
    .join("\n        ");
  return `
      CASE \`${a}\`.flag_code
        ${cases}
        ELSE 0
      END
    `;
}

export function computeProductRiskScore({ flags = [], priorRejections = 0 } = {}) {
  let score = 0;
  for (const f of flags) {
    const code = f.code || f.flag_code;
    score += Number(FLAG_WEIGHTS[code] || 0);
  }
  const rejects = Number(priorRejections || 0);
  if (rejects > 0) {
    score += Math.min(50, rejects * 15);
  }
  return Math.max(0, Math.floor(score));
}

export function scoreToPriorityLevel(score) {
  const s = Number(score || 0);
  if (s >= RISK_THRESHOLDS.critical) return "CRITICAL";
  if (s >= RISK_THRESHOLDS.high) return "HIGH";
  if (s >= RISK_THRESHOLDS.medium) return "MEDIUM";
  return "LOW";
}

export function scoreToRiskBucket(score) {
  const s = Number(score || 0);
  if (s >= RISK_THRESHOLDS.critical) return "critical";
  if (s >= RISK_THRESHOLDS.high) return "high";
  if (s >= RISK_THRESHOLDS.medium) return "medium";
  return "low";
}

export function priorityLevelRank(level) {
  return PRIORITY_RANK[String(level || "LOW").toUpperCase()] || 0;
}

export function compareByRiskPriority(a, b) {
  const pr =
    priorityLevelRank(b.priorityLevel || scoreToPriorityLevel(b.riskScore)) -
    priorityLevelRank(a.priorityLevel || scoreToPriorityLevel(a.riskScore));
  if (pr !== 0) return pr;

  const scoreDiff = Number(b.riskScore || 0) - Number(a.riskScore || 0);
  if (scoreDiff !== 0) return scoreDiff;

  const ta = new Date(a.createdAt || 0).getTime() || 0;
  const tb = new Date(b.createdAt || 0).getTime() || 0;
  return tb - ta;
}

async function upsertFlag(productId, flagCode, severity = "low") {
  const [existing] = await pool.query(
    `SELECT id, severity FROM product_risk_flags WHERE product_id = ? AND flag_code = ? ORDER BY id ASC LIMIT 1`,
    [productId, flagCode],
  );
  if (existing?.length) {
    if (String(existing[0].severity) !== String(severity)) {
      await pool.query(`UPDATE product_risk_flags SET severity = ? WHERE id = ?`, [severity, existing[0].id]);
    }
    return "updated";
  }
  await pool.query(
    `INSERT INTO product_risk_flags (product_id, flag_code, severity) VALUES (?, ?, ?)`,
    [productId, flagCode, severity],
  );
  return "inserted";
}

function dedupeFlags(flags = []) {
  const map = new Map();
  for (const f of flags) {
    if (!f?.code) continue;
    map.set(f.code, { code: f.code, severity: f.severity || "low" });
  }
  return [...map.values()];
}

async function removeDuplicateFlagRows(productId) {
  const [dupes] = await pool.query(
    `
      SELECT flag_code
      FROM product_risk_flags
      WHERE product_id = ?
      GROUP BY flag_code
      HAVING COUNT(*) > 1
    `,
    [productId],
  );
  for (const row of dupes || []) {
    const [ids] = await pool.query(
      `SELECT id FROM product_risk_flags WHERE product_id = ? AND flag_code = ? ORDER BY id ASC`,
      [productId, row.flag_code],
    );
    for (let i = 1; i < (ids || []).length; i++) {
      await pool.query(`DELETE FROM product_risk_flags WHERE id = ?`, [ids[i].id]);
    }
  }
}

/**
 * Evaluate deterministic risk rules for a product.
 * SAFE MODE: returns flags only — no bans, no visibility changes, no upload blocks.
 */
export async function evaluateProductRiskRules(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return [];

  const [[prodRow]] = await pool.query(
    `SELECT id, shopId, partNumber, price, shortDescription, description, moderation_status
     FROM products WHERE id = ? LIMIT 1`,
    [id],
  );
  if (!prodRow) return [];

  const shopId = prodRow.shopId;

  const [[{ imageCount }]] = await pool.query(
    `SELECT COUNT(*) AS imageCount FROM product_images WHERE productId = ?`,
    [id],
  );
  const [[{ recentShopProducts }]] = await pool.query(
    `SELECT COUNT(*) AS recentShopProducts FROM products WHERE shopId = ? AND createdAt > DATE_SUB(NOW(), INTERVAL 7 DAY)`,
    [shopId],
  );
  const [[{ shopProductCount }]] = await pool.query(
    `SELECT COUNT(*) AS shopProductCount FROM products WHERE shopId = ?`,
    [shopId],
  );
  const [[{ shopPendingCount }]] = await pool.query(
    `SELECT COUNT(*) AS shopPendingCount FROM products WHERE shopId = ? AND TRIM(LOWER(moderation_status)) = 'pending_review'`,
    [shopId],
  );
  const [[shopRow]] = await pool.query(`SELECT createdAt FROM shops WHERE id = ? LIMIT 1`, [shopId]);
  const [[{ shopRejects }]] = await pool.query(
    `SELECT COUNT(*) AS shopRejects
     FROM product_moderation_events e
     JOIN products p ON p.id = e.product_id
     WHERE p.shopId = ? AND e.new_status = 'rejected' AND e.created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)`,
    [shopId],
  );

  const partNumber = String(prodRow.partNumber || "").trim();
  let dupCount = 0;
  if (partNumber) {
    const [[dupRow]] = await pool.query(
      `SELECT COUNT(*) AS dupCount FROM products WHERE shopId = ? AND partNumber = ?`,
      [shopId, partNumber],
    );
    dupCount = Number(dupRow?.dupCount || 0);
  }

  const flags = [];

  if ((imageCount || 0) < 2) {
    flags.push({ code: FLAG_CODES.LOW_IMAGE_COUNT, severity: "medium" });
  }

  const descLen = String(prodRow.description || prodRow.shortDescription || "").trim().length;
  if (descLen < 50) {
    flags.push({ code: FLAG_CODES.NO_DESCRIPTION, severity: "low" });
  }

  if (shopRow?.createdAt) {
    const ageMs = Date.now() - new Date(shopRow.createdAt).getTime();
    if (ageMs < 7 * 24 * 60 * 60 * 1000 && (recentShopProducts || 0) >= 10) {
      flags.push({ code: FLAG_CODES.NEW_SHOP_HIGH_VOLUME, severity: "high" });
    }
  }

  const totalProducts = Number(shopProductCount || 0);
  const rejects = Number(shopRejects || 0);
  const rejectRate = totalProducts > 0 ? rejects / totalProducts : 0;
  if (rejects >= 5 || rejectRate >= 0.2) {
    flags.push({ code: FLAG_CODES.HIGH_REJECT_RATE, severity: "high" });
  }

  const pendingCount = Number(shopPendingCount || 0);
  const pendingRate = totalProducts > 0 ? pendingCount / totalProducts : 0;
  if (pendingCount >= 10 || pendingRate >= 0.3) {
    flags.push({ code: FLAG_CODES.TOO_MANY_PENDING, severity: "medium" });
  }

  if (partNumber && dupCount > 1) {
    flags.push({ code: FLAG_CODES.DUPLICATE_PART_NUMBER, severity: "medium" });
  }

  if (prodRow.price != null) {
    const price = Number(prodRow.price || 0);
    if (price > 10_000_000 || (price > 0 && price < 1000)) {
      flags.push({ code: FLAG_CODES.SUSPICIOUS_PRICE, severity: "medium" });
    }
  }

  return flags;
}

export async function storeProductRiskFlags(productId, flags = []) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return [];

  const desired = dedupeFlags(flags);
  const desiredCodes = new Set(desired.map((f) => f.code));

  const [existingRows] = await pool.query(
    `SELECT id, flag_code FROM product_risk_flags WHERE product_id = ?`,
    [id],
  );

  for (const row of existingRows || []) {
    if (!desiredCodes.has(row.flag_code)) {
      await pool.query(`DELETE FROM product_risk_flags WHERE id = ?`, [row.id]);
    }
  }

  for (const f of desired) {
    await upsertFlag(id, f.code, f.severity || "low");
  }

  await removeDuplicateFlagRows(id);
  return desired;
}

/** Evaluate rules and persist flags to product_risk_flags (replace set). */
export async function evaluateAndStoreProductRisk(productId) {
  const flags = await evaluateProductRiskRules(productId);
  await storeProductRiskFlags(productId, flags);
  await markProductRiskEvaluated(productId);
  return flags;
}

/**
 * Bounded pending-product evaluation batch.
 * Skips products evaluated within skipMinutes when risk_evaluated_at exists.
 */
export async function evaluatePendingProducts({ limit = 25, skipMinutes = 10 } = {}) {
  const cap = Math.max(1, Math.min(200, Math.floor(Number(limit) || 25)));
  const skip = Math.max(1, Math.floor(Number(skipMinutes) || 10));
  const hasCol = await hasRiskEvaluatedAtColumn();

  const sql = hasCol
    ? `
      SELECT id
      FROM products
      WHERE TRIM(LOWER(moderation_status)) = 'pending_review'
        AND (
          risk_evaluated_at IS NULL
          OR risk_evaluated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
        )
      ORDER BY COALESCE(risk_evaluated_at, '1970-01-01') ASC, id DESC
      LIMIT ?
    `
    : `
      SELECT id
      FROM products
      WHERE TRIM(LOWER(moderation_status)) = 'pending_review'
      ORDER BY id DESC
      LIMIT ?
    `;

  const params = hasCol ? [skip, cap] : [cap];
  const [rows] = await pool.query(sql, params);

  const updated = [];
  const failures = [];
  let flagsGenerated = 0;

  for (const row of rows || []) {
    try {
      const flags = await evaluateAndStoreProductRisk(row.id);
      flagsGenerated += flags.length;
      updated.push({ productId: row.id, flags });
    } catch (err) {
      const message = String(err?.message || err);
      failures.push({ productId: row.id, error: message });
      logEvaluationFailure({ productId: row.id, error: message, phase: "evaluatePendingProducts" });
    }
  }

  return {
    productsScanned: updated.length,
    productsFailed: failures.length,
    flagsGenerated,
    updated,
    failures,
  };
}

/**
 * Worker batch: evaluate pending products, refresh alert snapshots, return metrics.
 */
export async function runRiskEvaluationWorkerBatch(opts = {}) {
  const limit = Math.max(1, Math.min(200, Number(opts.limit || process.env.GOVERNANCE_RISK_BATCH || 50)));
  const skipMinutes = Math.max(1, Number(opts.skipMinutes || process.env.GOVERNANCE_RISK_SKIP_MINUTES || 10));
  const started = Date.now();

  const queueSize = await countPendingProductsNeedingEvaluation({ skipMinutes });
  const batch = await evaluatePendingProducts({ limit, skipMinutes });

  let highRiskShops = [];
  let highRiskProducts = [];
  let alertError = null;

  try {
    [highRiskShops, highRiskProducts] = await Promise.all([
      getHighRiskShopAlerts({ limit: 10 }),
      getHighRiskProductAlerts({ limit: 10 }),
    ]);
  } catch (err) {
    alertError = String(err?.message || err);
    logEvaluationFailure({ error: alertError, phase: "alertSnapshot" });
  }

  return {
    durationMs: Date.now() - started,
    queueSize,
    productsScanned: batch.productsScanned,
    productsFailed: batch.productsFailed || 0,
    productsSkipped: Math.max(0, queueSize - batch.productsScanned - (batch.productsFailed || 0)),
    flagsGenerated: batch.flagsGenerated,
    failures: batch.failures || [],
    partialSuccess: (batch.productsFailed || 0) > 0 && batch.productsScanned > 0,
    alertError,
    alerts: {
      highRiskShops,
      highRiskProducts,
    },
  };
}

export async function aggregateRiskBuckets() {
  const weightSql = getFlagWeightSql("rf");
  const [rows] = await pool.query(
    `
      SELECT
        SUM(CASE WHEN COALESCE(flag_score,0) >= ? THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN COALESCE(flag_score,0) >= ? AND COALESCE(flag_score,0) < ? THEN 1 ELSE 0 END) AS high,
        SUM(CASE WHEN COALESCE(flag_score,0) >= ? AND COALESCE(flag_score,0) < ? THEN 1 ELSE 0 END) AS medium,
        SUM(CASE WHEN COALESCE(flag_score,0) < ? THEN 1 ELSE 0 END) AS low
      FROM products p
      LEFT JOIN (
        SELECT rf.product_id, SUM(${weightSql}) AS flag_score
        FROM product_risk_flags rf
        GROUP BY rf.product_id
      ) pf ON pf.product_id = p.id
    `,
    [
      RISK_THRESHOLDS.critical,
      RISK_THRESHOLDS.high,
      RISK_THRESHOLDS.critical,
      RISK_THRESHOLDS.medium,
      RISK_THRESHOLDS.high,
      RISK_THRESHOLDS.medium,
    ],
  );
  return rows?.[0] || { critical: 0, high: 0, medium: 0, low: 0 };
}

async function fetchRankedProducts({ minScore, limit = 10 }) {
  const cap = Math.max(1, Math.min(50, Math.floor(Number(limit) || 10)));
  const weightSql = getFlagWeightSql("rf");
  const [rows] = await pool.query(
    `
      SELECT
        p.id AS productId,
        p.shopId,
        sh.name AS shopName,
        COALESCE(pf.flag_score, 0) AS riskScore,
        pf.flags_blob AS flagsBlob
      FROM products p
      LEFT JOIN shops sh ON sh.id = p.shopId
      LEFT JOIN (
        SELECT
          rf.product_id,
          SUM(${weightSql}) AS flag_score,
          GROUP_CONCAT(rf.flag_code, '::', rf.severity SEPARATOR '||') AS flags_blob
        FROM product_risk_flags rf
        GROUP BY rf.product_id
      ) pf ON pf.product_id = p.id
      WHERE COALESCE(pf.flag_score, 0) >= ?
      ORDER BY pf.flag_score DESC, p.id DESC
      LIMIT ?
    `,
    [minScore, cap],
  );

  return (rows || []).map((r) => {
    const flags = r.flagsBlob
      ? String(r.flagsBlob)
          .split("||")
          .filter(Boolean)
          .map((s) => {
            const [code, severity] = String(s).split("::");
            return { code, severity: severity || "low" };
          })
      : [];
    const riskScore = Number(r.riskScore || 0);
    return {
      productId: r.productId,
      shopId: r.shopId,
      shopName: r.shopName,
      riskScore,
      priorityLevel: scoreToPriorityLevel(riskScore),
      riskBucket: scoreToRiskBucket(riskScore),
      flags,
    };
  });
}

export async function getCriticalProducts({ limit = 10 } = {}) {
  return fetchRankedProducts({ minScore: RISK_THRESHOLDS.critical, limit });
}

export async function getHighRiskProductAlerts({ limit = 10 } = {}) {
  return fetchRankedProducts({ minScore: RISK_THRESHOLDS.high, limit });
}

export async function getCriticalShops({ limit = 10 } = {}) {
  const cap = Math.max(1, Math.min(50, Math.floor(Number(limit) || 10)));
  const weightSql = getFlagWeightSql("rf");
  const [rows] = await pool.query(
    `
      SELECT
        p.shopId,
        sh.name AS shopName,
        MAX(COALESCE(pf.flag_score, 0)) AS maxRiskScore,
        SUM(CASE WHEN COALESCE(pf.flag_score, 0) >= ? THEN 1 ELSE 0 END) AS criticalProducts,
        SUM(CASE WHEN COALESCE(pf.flag_score, 0) >= ? AND COALESCE(pf.flag_score, 0) < ? THEN 1 ELSE 0 END) AS highProducts,
        COUNT(p.id) AS productCount
      FROM products p
      JOIN shops sh ON sh.id = p.shopId
      LEFT JOIN (
        SELECT rf.product_id, SUM(${weightSql}) AS flag_score
        FROM product_risk_flags rf
        GROUP BY rf.product_id
      ) pf ON pf.product_id = p.id
      GROUP BY p.shopId, sh.name
      HAVING maxRiskScore >= ?
      ORDER BY maxRiskScore DESC, criticalProducts DESC, p.shopId DESC
      LIMIT ?
    `,
    [RISK_THRESHOLDS.critical, RISK_THRESHOLDS.high, RISK_THRESHOLDS.critical, RISK_THRESHOLDS.critical, cap],
  );

  return (rows || []).map((r) => ({
    shopId: r.shopId,
    shopName: r.shopName,
    maxRiskScore: Number(r.maxRiskScore || 0),
    criticalProducts: Number(r.criticalProducts || 0),
    highProducts: Number(r.highProducts || 0),
    productCount: Number(r.productCount || 0),
    priorityLevel: scoreToPriorityLevel(r.maxRiskScore),
    riskBucket: scoreToRiskBucket(r.maxRiskScore),
  }));
}

export async function getHighRiskShopAlerts({ limit = 10 } = {}) {
  const cap = Math.max(1, Math.min(50, Math.floor(Number(limit) || 10)));
  const weightSql = getFlagWeightSql("rf");
  const [rows] = await pool.query(
    `
      SELECT
        p.shopId,
        sh.name AS shopName,
        MAX(COALESCE(pf.flag_score, 0)) AS maxRiskScore,
        SUM(CASE WHEN COALESCE(pf.flag_score, 0) >= ? THEN 1 ELSE 0 END) AS highOrCriticalProducts,
        COUNT(p.id) AS productCount
      FROM products p
      JOIN shops sh ON sh.id = p.shopId
      LEFT JOIN (
        SELECT rf.product_id, SUM(${weightSql}) AS flag_score
        FROM product_risk_flags rf
        GROUP BY rf.product_id
      ) pf ON pf.product_id = p.id
      GROUP BY p.shopId, sh.name
      HAVING maxRiskScore >= ?
      ORDER BY maxRiskScore DESC, highOrCriticalProducts DESC, p.shopId DESC
      LIMIT ?
    `,
    [RISK_THRESHOLDS.high, RISK_THRESHOLDS.high, cap],
  );

  return (rows || []).map((r) => ({
    shopId: r.shopId,
    shopName: r.shopName,
    maxRiskScore: Number(r.maxRiskScore || 0),
    highOrCriticalProducts: Number(r.highOrCriticalProducts || 0),
    productCount: Number(r.productCount || 0),
    priorityLevel: scoreToPriorityLevel(r.maxRiskScore),
    riskBucket: scoreToRiskBucket(r.maxRiskScore),
  }));
}

export async function getRecentEnforcementEvents({ limit = 20 } = {}) {
  const cap = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)));

  const [moderationRows] = await pool.query(
    `
      SELECT
        e.id,
        'moderation' AS eventType,
        e.product_id AS productId,
        p.shopId,
        sh.name AS shopName,
        a.email AS actorEmail,
        e.old_status AS oldStatus,
        e.new_status AS newStatus,
        e.reject_reason AS rejectReason,
        e.notes AS notes,
        e.created_at AS createdAt
      FROM product_moderation_events e
      LEFT JOIN admin a ON a.id = e.moderator_admin_id
      LEFT JOIN products p ON p.id = e.product_id
      LEFT JOIN shops sh ON sh.id = p.shopId
      ORDER BY e.created_at DESC
      LIMIT ?
    `,
    [cap],
  );

  const [noteRows] = await pool.query(
    `
      SELECT
        n.id,
        'governance_note' AS eventType,
        n.target_id AS shopId,
        sh.name AS shopName,
        n.author_id AS actorAdminId,
        n.content AS notes,
        n.created_at AS createdAt
      FROM admin_moderation_notes n
      LEFT JOIN shops sh ON sh.id = n.target_id
      WHERE n.target_type = 'shop'
        AND n.deleted_at IS NULL
        AND (
          n.content LIKE 'Force private:%'
          OR n.content LIKE 'Require re-review executed.%'
          OR n.content LIKE 'Uploads suspended:%'
        )
      ORDER BY n.created_at DESC
      LIMIT ?
    `,
    [cap],
  );

  const merged = [
    ...(moderationRows || []).map((r) => ({
      id: `moderation-${r.id}`,
      eventType: r.eventType,
      productId: r.productId,
      shopId: r.shopId,
      shopName: r.shopName,
      actorEmail: r.actorEmail,
      oldStatus: r.oldStatus,
      newStatus: r.newStatus,
      rejectReason: r.rejectReason,
      notes: r.notes,
      createdAt: r.createdAt,
      summary: `${r.oldStatus || "—"} → ${r.newStatus || "—"} (product #${r.productId})`,
    })),
    ...(noteRows || []).map((r) => ({
      id: `governance-${r.id}`,
      eventType: r.eventType,
      shopId: r.shopId,
      shopName: r.shopName,
      actorAdminId: r.actorAdminId,
      notes: r.notes,
      createdAt: r.createdAt,
      summary: String(r.notes || "").split("\n")[0],
    })),
  ];

  merged.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime() || 0;
    const tb = new Date(b.createdAt || 0).getTime() || 0;
    return tb - ta;
  });

  return merged.slice(0, cap);
}
