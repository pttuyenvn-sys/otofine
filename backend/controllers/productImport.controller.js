// controllers/productImport.controller.js
import { importProductsFromExcel } from "../services/productImport.service.js";
import {
  importImagesBatch,
  syncProductImages,
} from "../services/productImage.service.js";
import { invalidateListCache } from "../services/listCache.service.js";
import { invalidateListingCaches } from "../services/redisCache.service.js";
import { syncProductListViewByProductId } from "../services/productListViewSync.service.js";
import { pool } from "../config/db.js";

/**
 * IMPORT SẢN PHẨM
 */
export const importProducts = async (req, res) => {
  try {
    const shopId = req.shop.id;

    const result = await importProductsFromExcel(shopId, req.file.path);

    if (result?.success) {
      await invalidateListingCaches();
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/** Best-effort hooks after import response — must never block HTTP. */
async function runPostImportImageHooks(shopId, uploadedFiles = []) {
  const synced = await syncProductImages(shopId);
  await invalidateListCache();

  if (uploadedFiles.length) {
    const [linked] = await pool.query(
      `
        SELECT DISTINCT productId
        FROM product_images
        WHERE shopId = ?
          AND productId IS NOT NULL
          AND url IN (?)
        `,
      [shopId, uploadedFiles],
    );

    for (const row of linked) {
      await syncProductListViewByProductId(row.productId).catch(() => {});
    }
  }

  return synced;
}

/**
 * IMPORT ẢNH
 */
export const importProductImages = async (req, res) => {
  const startedAt = Date.now();

  try {
    const files = req.files;

    if (!files || !files.length) {
      return res.status(400).json({ message: "No images" });
    }

    const shopId = req.shop.id;

    console.log("[import-images] IMPORT START", {
      shopId,
      count: files.length,
    });

    const result = await importImagesBatch(files, shopId);

    const responseBody = {
      ...result,
      success:
        result.imported > 0 &&
        result.failed.length === 0 &&
        result.dbFailed.length === 0,
    };

    if (result.imported === 0) {
      console.log("[import-images] RESPONSE_SENT", {
        shopId,
        ms: Date.now() - startedAt,
        status: 422,
        imported: 0,
        failed: result.failed.length,
        dbFailed: result.dbFailed.length,
      });

      return res.status(422).json({
        ...responseBody,
        message: "No images were imported",
      });
    }

    console.log("[import-images] RESPONSE_SENT", {
      shopId,
      ms: Date.now() - startedAt,
      status: 200,
      imported: result.imported,
      uploaded: result.uploadedFiles.length,
      failed: result.failed.length,
      dbFailed: result.dbFailed.length,
    });

    res.json(responseBody);

    setImmediate(() => {
      runPostImportImageHooks(shopId, result.uploadedFiles).catch((err) => {
        console.error("[import-images] post-import hooks failed", {
          shopId,
          error: String(err?.message || err),
        });
      });
    });
  } catch (err) {
    console.error("IMPORT IMAGE ERROR:", err);

    res.status(500).json({
      message: "Import failed",
      error: err.message,
    });
  }
};
