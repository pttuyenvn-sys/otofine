import { getSeoPageBySlug } from "../services/seoPage.service.js";
import { logError } from "../utils/syncLogger.js";

export async function getSeoPageBySlugCtrl(req, res) {
  try {
    const raw = req.params.slug;
    const slug = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (!slug) {
      return res.status(400).json({ error: "Missing slug" });
    }

    const data = await getSeoPageBySlug(slug);
    if (!data) {
      return res.status(404).json({ error: "Not found" });
    }
    return res
      .status(200)
      .set(
        "Cache-Control",
        "public, s-maxage=60, stale-while-revalidate=300",
      )
      .json(data);
  } catch (e) {
    logError("seoPage.controller", e?.message || String(e), {
      stack: e?.stack,
    });
    return res.status(500).json({ error: "Internal server error" });
  }
}
