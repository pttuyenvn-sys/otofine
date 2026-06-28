import { getPublicShopLifecycle } from "../services/shopLifecycle.service.js";
import { validateShopSlugParam } from "../validators/shopPublic.validators.js";
import { shopsiteLog } from "../observability/logger.js";
import { recordPublicRequest } from "../observability/abuseDetector.js";

const CACHE_HEADERS = "public, s-maxage=60, stale-while-revalidate=300";

/**
 * GET /api/public/shops/:slug/lifecycle
 *
 * Always 200 for a valid slug param (including unknown slugs) so edge
 * middleware can distinguish closed shops from never-existed slugs
 * without relying on HTTP error semantics.
 */
export async function handleGetShopLifecycle(req, res) {
  const t = Date.now();
  const slug = validateShopSlugParam(req.params.slug);
  if (!slug) {
    res.status(404).json({ error: "Shop không tồn tại" });
    recordPublicRequest(req, res);
    return;
  }

  try {
    const data = await getPublicShopLifecycle(slug);
    res.set("Cache-Control", CACHE_HEADERS);
    res.json(data);
    shopsiteLog.info("public-api.ok", {
      route: "lifecycle",
      slug,
      exists: data.exists,
      publicStatus: data.publicStatus,
      redirectEligible: data.redirectEligible,
      dur_ms: Date.now() - t,
    });
    recordPublicRequest(req, res);
  } catch (err) {
    shopsiteLog.error("public-api.error", {
      route: "lifecycle",
      slug,
      msg: err?.message || "err",
    });
    res.status(500).json({ error: "Internal server error" });
    recordPublicRequest(req, res);
  }
}
