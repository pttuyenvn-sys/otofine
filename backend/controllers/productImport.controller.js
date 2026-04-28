// controllers/productImport.controller.js
import { importProductsFromExcel } from "../services/productImport.service.js";
import {
  importImagesBatch,
  syncProductImages,
} from "../services/productImage.service.js";

/**
 * IMPORT SẢN PHẨM
 */
export const importProducts = async (req, res) => {
  try {
    const shopId = req.shop.id;

    const result = await importProductsFromExcel(shopId, req.file.path);

    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * IMPORT ẢNH
 */
export const importProductImages = async (req, res) => {
  try {
    const files = req.files;

    if (!files || !files.length) {
      return res.status(400).json({ message: "No images" });
    }

    const shopId = req.shop.id;

    const result = await importImagesBatch(files, shopId);

    // map ảnh với sản phẩm đã có
    await syncProductImages(shopId);

    res.json(result);
  } catch (err) {
    console.error("IMPORT IMAGE ERROR:", err);

    res.status(500).json({
      message: "Import failed",
      error: err.message,
    });
  }
};
