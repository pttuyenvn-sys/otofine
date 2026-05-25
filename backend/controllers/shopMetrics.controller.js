import { getShopMetricsOverview } from "../services/shopMetrics.service.js";

/**
 * GET /api/shop/metrics/overview
 *
 * Requires `requireAuth` + `requireShop` middleware (mounted in
 * `routes/shopMetrics.routes.js`). The shop id is resolved upstream
 * onto `req.shop.id` so the controller never has to trust input.
 *
 * Response shape:
 *   {
 *     shopId, windowDays,
 *     cards: {
 *       productCount, rfqReceivedLast30d,
 *       ctaClicksLast30d, conversationsLast30d
 *     },
 *     eventCountsLast30d: { phone_click: N, zalo_click: N, ... },
 *     storefrontViewsLast30d
 *   }
 */
export async function handleGetShopMetricsOverview(req, res) {
  try {
    const shopId = req.shop?.id;
    if (!shopId) return res.status(400).json({ message: "Missing shop context" });

    const data = await getShopMetricsOverview(shopId);

    // Browser-side cache for a short window — the dashboard refresh
    // cadence is "open the page", not "live tail". 30s gives us
    // good React-StrictMode dedupe without staleness anyone notices.
    res.set("Cache-Control", "private, max-age=30");
    res.json(data);
  } catch (err) {
    console.error("handleGetShopMetricsOverview error:", err);
    res.status(500).json({ message: "Failed to load shop metrics" });
  }
}
