import { pool } from "../../../config/db.js";

export async function listShopRisk(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 2000);
    const [rows] = await pool.query(
      `
      SELECT
        s.id AS shopId,
        s.name AS shopName,
        COALESCE(sr.risk_score, 0) AS riskScore,
        COALESCE(sr.risk_level, 'low') AS riskLevel,
        COALESCE(sr.rejected_products_count, 0) AS rejectedProductsCount,
        COALESCE(sr.prohibited_content_count, 0) AS prohibitedContentCount,
        COALESCE(sr.duplicate_listing_count, 0) AS duplicateListingCount,
        COALESCE(sr.spam_reject_count, 0) AS spamRejectCount,
        COALESCE(sr.hidden_products_count, 0) AS hiddenProductsCount,
        COALESCE(sr.last_calculated_at, sr.created_at) AS lastCalculatedAt
      FROM shops s
      LEFT JOIN shop_risk_scores sr ON sr.shop_id = s.id
      ORDER BY COALESCE(sr.risk_score, 0) DESC
      LIMIT ?
      `,
      [limit],
    );
    return res.json({ rows });
  } catch (err) {
    console.error("listShopRisk error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

