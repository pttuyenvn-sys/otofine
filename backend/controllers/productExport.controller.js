import { exportProductsToExcel } from "../services/productExport.service.js";

export const exportProducts = async (req, res) => {
  try {
    console.log("✅ ĐANG CHẠY EXPORT MỚI");

    const shopId = req.shop.id;

    const filters = {
      keyword: req.query.keyword,
      brand: req.query.brand,
      model: req.query.model,
      year: req.query.year,
      sortBy: req.query.sortBy,
      sortDir: req.query.sortDir,
    };

    const { filePath, fileName } = await exportProductsToExcel(shopId, filters);

    res.download(filePath, fileName);
  } catch (err) {
    console.error("exportProducts error:", err);
    res.status(500).json({ message: err.message });
  }
};
