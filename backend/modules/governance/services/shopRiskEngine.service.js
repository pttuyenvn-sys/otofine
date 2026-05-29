import { pool } from "../../../../config/db.js";

/**
 * Shop Risk Engine — deterministic scoring based on moderation events.
 *
 * Scoring weights:
 * - prohibited_content reject: +50
 * - spam reject: +40
 * - duplicate_listing reject: +20
 * - hidden products: +10
 * - rejected products (any): +5
 *
 * Levels:
 * 0-19 => low
 * 20-49 => medium
 * 50-99 => high
 * 100+  => critical
 */

function determineRiskLevel(score) {
  if (score >= 100) return "critical";
  if (score >= 50) return "high";
  if (score >= 20) return "medium";
  return "low";
}

export async function calculateShopRisk(shopId) {
  const sid = Number(shopId);
  if (!Number.isFinite(sid) || sid <= 0) return null;

  // Aggregate moderation events joined to products to attribute to shop
  const [rows] = await pool.query(
    `
      SELECT
        SUM(CASE WHEN e.new_status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
        SUM(CASE WHEN e.new_status = 'hidden' THEN 1 ELSE 0 END) AS hidden_count,
        SUM(CASE WHEN e.new_status = 'rejected' AND e.reject_reason = 'prohibited_content' THEN 1 ELSE 0 END) AS prohibited_count,
        SUM(CASE WHEN e.new_status = 'rejected' AND e.reject_reason = 'duplicate_listing' THEN 1 ELSE 0 END) AS duplicate_count,
        SUM(CASE WHEN e.new_status = 'rejected' AND e.reject_reason = 'spam' THEN 1 ELSE 0 END) AS spam_count
      FROM product_moderation_events e
      JOIN products p ON p.id = e.product_id
      WHERE p.shopId = ?
    `,
    [sid],
  );

  const agg = rows[0] || {};
  const rejected = Number(agg.rejected_count || 0);
  const hidden = Number(agg.hidden_count || 0);
  const prohibited = Number(agg.prohibited_count || 0);
  const duplicateCnt = Number(agg.duplicate_count || 0);
  const spamCnt = Number(agg.spam_count || 0);

  const score =
    prohibited * 50 + spamCnt * 40 + duplicateCnt * 20 + hidden * 10 + rejected * 5;

  const level = determineRiskLevel(score);
  const now = new Date();

  // Upsert into shop_risk_scores
  const [[existing]] = await pool.query(
    `SELECT id FROM shop_risk_scores WHERE shop_id = ? LIMIT 1`,
    [sid],
  );

  if (existing && existing.id) {
    await pool.query(
      `UPDATE shop_risk_scores SET
         risk_score = ?, risk_level = ?, rejected_products_count = ?, prohibited_content_count = ?, duplicate_listing_count = ?, spam_reject_count = ?, hidden_products_count = ?, last_calculated_at = ?, updated_at = NOW()
       WHERE shop_id = ?`,
      [score, level, rejected, prohibited, duplicateCnt, spamCnt, hidden, now, sid],
    );
  } else {
    await pool.query(
      `INSERT INTO shop_risk_scores
         (shop_id, risk_score, risk_level, rejected_products_count, prohibited_content_count, duplicate_listing_count, spam_reject_count, hidden_products_count, last_calculated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sid, score, level, rejected, prohibited, duplicateCnt, spamCnt, hidden, now],
    );
  }

  return {
    shopId: sid,
    riskScore: Number(score),
    riskLevel: level,
    rejectedProductsCount: rejected,
    prohibitedContentCount: prohibited,
    duplicateListingCount: duplicateCnt,
    spamRejectCount: spamCnt,
    hiddenProductsCount: hidden,
    lastCalculatedAt: now,
  };
}

export async function recalculateAllShopRiskScores() {
  const [rows] = await pool.query(`SELECT DISTINCT shopId FROM products WHERE shopId IS NOT NULL`);
  const shopIds = rows.map((r) => Number(r.shopId)).filter((n) => Number.isFinite(n) && n > 0);
  const out = [];
  for (const sid of shopIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await calculateShopRisk(sid);
      out.push(res);
    } catch (e) {
      console.error("recalculateAllShopRiskScores error for shop", sid, e);
    }
  }
  return out;
}

