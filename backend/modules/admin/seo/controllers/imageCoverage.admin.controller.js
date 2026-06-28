import {
  exportMissingImageProductsCsv,
  getImageCoverageReport,
  getShopImageCoverageProducts,
  validateImageCoverageParity,
} from "../services/imageCoverage.service.js";

/**
 * GET /api/admin/seo/image-coverage
 */
export async function getImageCoverageHandler(req, res) {
  try {
    const report = await getImageCoverageReport(req.query || {});
    return res.json(report);
  } catch (err) {
    console.error("[admin:seo:image-coverage] list error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/admin/seo/image-coverage/shops/:shopId/products
 */
export async function getShopImageCoverageProductsHandler(req, res) {
  try {
    const shopId = Number(req.params.shopId);
    if (!Number.isFinite(shopId) || shopId <= 0) {
      return res.status(400).json({ error: "Invalid shopId" });
    }
    const payload = await getShopImageCoverageProducts(shopId, req.query || {});
    return res.json(payload);
  } catch (err) {
    console.error("[admin:seo:image-coverage] shop products error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/admin/seo/image-coverage/export
 */
export async function exportImageCoverageCsvHandler(req, res) {
  try {
    const { csv, rowCount, totals } = await exportMissingImageProductsCsv(req.query || {});
    const filename = `otofine-missing-images-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("X-Export-Row-Count", String(rowCount));
    res.setHeader("X-Coverage-Without-Images", String(totals.withoutImages));
    return res.send(csv);
  } catch (err) {
    console.error("[admin:seo:image-coverage] export error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/admin/seo/image-coverage/validate (internal QA)
 */
export async function validateImageCoverageHandler(req, res) {
  try {
    const result = await validateImageCoverageParity();
    return res.json(result);
  } catch (err) {
    console.error("[admin:seo:image-coverage] validate error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
