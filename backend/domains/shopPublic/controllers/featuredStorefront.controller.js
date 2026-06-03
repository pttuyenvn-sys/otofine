import { getFeaturedStorefronts } from "../services/featuredStorefront.service.js";

/**
 * GET /api/storefronts/featured
 */
export async function handleGetFeaturedStorefronts(req, res) {
  try {
    const limit = req.query?.limit;
    const payload = await getFeaturedStorefronts({ limit });
    return res.json(payload);
  } catch (err) {
    console.error("[featuredStorefront] getFeatured error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
