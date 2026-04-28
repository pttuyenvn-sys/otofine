import { getRelatedProductsForDetail } from "../services/productRelated.service.js";

/**
 * GET /api/products/related?id=123
 * Trả về danh sách SP liên quan (ưu tiên category → synonym → hãng → model → shop → mới).
 */
export async function getRelatedProducts(req, res) {
  const raw = req.query.id ?? req.query.productId;
  const id = Number(raw);
  if (!Number.isFinite(id) || id < 1) {
    return res.status(400).json({
      message: "Thiếu hoặc sai id sản phẩm (query: id)",
      data: [],
    });
  }

  try {
    const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 12));
    const data = await getRelatedProductsForDetail(id, { limit });
    res.json({ data });
  } catch (e) {
    console.error("getRelatedProducts:", e);
    res.status(500).json({ message: "Lỗi server", data: [] });
  }
}
