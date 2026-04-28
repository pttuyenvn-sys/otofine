import { pool } from "../config/db.js";
import * as productService from "../services/product.service.js";
import { syncProductListViewByProductId } from "../services/productListViewSync.service.js";
import { queueUpsertProductInTypesense } from "../services/typesenseRealtimeSync.service.js";
import { invalidateListCache } from "../services/listCache.service.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "../config/r2.js";
import { importImagesBatch } from "../services/productImage.service.js";
import { processSingleImage } from "../services/productImage.service.js";

/* =========================
   GET ALL PRODUCTS
   ========================= */
export const getAllProducts = async (req, res) => {
  try {
    const data = await productService.getAllProducts();
    res.json(data);
  } catch (err) {
    console.error("🔥 PRODUCT ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   FILTER PRODUCTS
   ========================= */
export const filterProducts = async (req, res) => {
  try {
    const shopId = req.shop.id;
    const { company, model, category, origin } = req.query;
    const data = await productService.filterProducts(
      shopId,
      company,
      model,
      category,
      origin,
    );
    res.json(data);
  } catch (err) {
    console.error("🔥 FILTER PRODUCT ERROR:", err.message);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   DELETE ONE
   ========================= */
export const deleteProduct = async (req, res) => {
  try {
    const shopId = req.shop.id;
    const productId = req.params.id;

    const deleted = await productService.deleteProduct({
      id: productId,
      shopId,
    });

    if (!deleted) {
      return res.status(404).json({
        message: "Sản phẩm không tồn tại hoặc không thuộc shop",
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("deleteProduct error:", err);
    res.status(500).json({ message: err.message });
  }
};

export const deleteProducts = async (req, res) => {
  try {
    const shopId = req.shop.id;
    const { ids } = req.body;

    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({
        message: "Danh sách sản phẩm không hợp lệ",
      });
    }

    const count = await productService.deleteProducts({
      shopId,
      ids,
    });

    res.json({ success: true, deleted: count });
  } catch (err) {
    console.error("deleteProducts error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   DELETE MANY
   ========================= */
export const deleteManyProducts = async (req, res) => {
  try {
    const { ids } = req.body;
    await productService.deleteManyProducts(ids);
    res.json({ message: "Deleted many" });
  } catch (err) {
    console.error("DELETE MANY ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   ADD PRODUCT
   ========================= */
export const addProductAdmin = async (req, res) => {
  try {
    const id = await productService.addProduct(req.body);
    res.json({ productID: id });
  } catch (err) {
    console.error("ADD PRODUCT ERROR:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   UPDATE PRODUCT
   ========================= */
export const updateProduct = async (req, res) => {
  try {
    const shopId = req.shop.id;
    const productId = req.params.id;

    let {
      partNumber,
      partName,
      origin,
      stock,
      price,
      shortDescription,
      description,
      weight,
      length,
      width,
      height,
      deletedImages,
    } = req.body;

    // ===== PARSE deletedImages =====
    if (typeof deletedImages === "string") {
      try {
        deletedImages = JSON.parse(deletedImages);
      } catch {
        deletedImages = [];
      }
    }

    partNumber = partNumber.trim().toUpperCase();

    if (!partNumber || !partName) {
      return res.status(400).json({
        message: "Mã phụ tùng và tên phụ tùng là bắt buộc",
      });
    }

    // 1. Update product DB
    let cars = req.body.cars;

    if (typeof cars === "string") {
      try {
        cars = JSON.parse(cars);
      } catch (e) {
        cars = [];
      }
    }

    if (req.files && req.files.length > 0) {
      // ===== 1. XÓA ẢNH CŨ (R2 + DB) =====
      const [oldImages] = await pool.query(
        "SELECT url FROM product_images WHERE productId = ?",
        [productId],
      );

      for (const img of oldImages) {
        try {
          const key = img.url.replace(process.env.R2_PUBLIC_URL + "/", "");

          await r2.send(
            new DeleteObjectCommand({
              Bucket: process.env.R2_BUCKET,
              Key: key,
            }),
          );
        } catch (err) {
          console.error("DELETE R2 ERROR:", err.message);
        }
      }

      await pool.query("DELETE FROM product_images WHERE productId = ?", [
        productId,
      ]);

      // ===== 2. UPLOAD ẢNH MỚI (có watermark + resize) =====
      let index = 0;

      for (const file of req.files) {
        const result = await processSingleImage({
          file,
          shopId,
          partNumber,
          index: index === 0 ? "" : index,
        });

        if (!result) continue;

        await pool.query(
          `INSERT INTO product_images (productId, url, shopId, partNumber)
       VALUES (?, ?, ?, ?)`,
          [productId, result.url, shopId, partNumber],
        );

        index++;
      }
    }

    await productService.updateProduct({
      id: productId,
      shopId,
      partNumber,
      partName,
      origin,
      stock,
      price,
      shortDescription,
      description,
      weight,
      length,
      width,
      height,
      cars,
      deletedImages,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("updateProduct error:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        message: "Mã sản phẩm đã tồn tại",
      });
    }

    res.status(500).json({ message: err.message });
  }
};

/* =========================
   GET PRODUCT CARS
   ========================= */
export const getProductCars = async (req, res) => {
  try {
    const { productId } = req.params;

    const [rows] = await pool.query(
      `
      SELECT
        acm.hang_xe   AS company,
        acm.ten_xe    AS model,
        pca.year_from AS yearStart,
        pca.year_to   AS yearEnd
      FROM product_car_applications pca
      JOIN car_models acm ON pca.carModelId = acm.id
      WHERE pca.productId = ?
    `,
      [productId],
    );

    res.json(rows);
  } catch (err) {
    console.error("getProductCars ERROR:", err);
    res.status(500).json({ message: "Load product cars failed" });
  }
};

export const addProduct = async (req, res) => {
  try {
    const shopId = req.shop.id;
    const data = req.body;
    const { partNumber } = data;
    const files = req.files || [];

    // parse cars
    if (typeof data.cars === "string") {
      try {
        data.cars = JSON.parse(data.cars);
      } catch {
        data.cars = [];
      }
    }

    if (!data.partNumber || !data.partName) {
      return res.status(400).json({
        message: "Mã phụ tùng và tên phụ tùng là bắt buộc",
      });
    }

    // chuẩn hóa
    data.partNumber = data.partNumber.trim().toUpperCase();

    // 🔥 CHECK EXIST
    const [exist] = await pool.query(
      "SELECT id FROM products WHERE partNumber = ? AND shopId = ?",
      [data.partNumber, shopId],
    );

    let productId;

    if (exist.length) {
      // 👉 đã có → dùng lại
      productId = exist[0].id;
    } else {
      // 👉 chưa có → tạo mới
      productId = await productService.createProduct(shopId, data);
    }

    // 🔥 LƯU cars + attribute + cc
    if (data.cars && data.cars.length > 0) {
      // xóa mapping cũ (nếu update)
      await pool.query(
        "DELETE FROM product_car_applications WHERE productId = ?",
        [productId],
      );

      for (const c of data.cars) {
        const { carModelId, year_from, year_to } = c;

        // 1. mapping product ↔ car
        await pool.query(
          `INSERT INTO product_car_applications
       (productId, carModelId, year_from, year_to)
       VALUES (?, ?, ?, ?)`,
          [productId, carModelId, year_from, year_to],
        );

        // 2. attribute
        const attributeMap = {
          dong_co: 1,
          hop_so: 2,
          so_cau: 3,
          kieu_dang: 4,
        };

        for (const [key, typeId] of Object.entries(attributeMap)) {
          if (!c[key]) continue;

          const [attr] = await pool.query(
            `SELECT id FROM attributes
         WHERE attribute_type_id = ? AND name = ?
         LIMIT 1`,
            [typeId, c[key]],
          );

          if (attr.length > 0) {
            await pool.query(
              `INSERT IGNORE INTO car_model_attributes (car_model_id, attribute_id)
           VALUES (?, ?)`,
              [carModelId, attr[0].id],
            );
          }
        }

        // 3. CC
        if (c.cc) {
          await pool.query(
            `INSERT INTO car_model_specs (car_model_id, engine_cc)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE engine_cc = VALUES(engine_cc)`,
            [carModelId, c.cc],
          );
        }
      }
    }

    // 🔥 upload ảnh LUÔN
    let index = 0;

    if (files && files.length > 0) {
      for (const file of files) {
        const result = await processSingleImage({
          file,
          shopId,
          partNumber: data.partNumber,
          index: index === 0 ? "" : index,
        });

        if (!result) continue;

        await pool.query(
          `INSERT INTO product_images (productId, url, shopId, partNumber)
       VALUES (?, ?, ?, ?)`,
          [productId, result.url, shopId, data.partNumber],
        );

        index++;
      }
    }

    await syncProductListViewByProductId(productId).catch(() => {});
    queueUpsertProductInTypesense(productId);

    res.json({ success: true, productId });
  } catch (err) {
    console.error("addProduct error:", err);
    res.status(500).json({ message: err.message });
  }
};

export async function list(req, res) {
  const shopId = req.shop.id;
  const rows = await productService.listProducts(shopId);
  res.json(rows);
}

export async function create(req, res) {
  try {
    const shopId = req.shop.id;

    // chuẩn hóa
    req.body.partNumber = req.body.partNumber.trim().toUpperCase();

    const id = await productService.createProduct(shopId, req.body);

    // auto map ảnh
    await pool.query(
      `
      UPDATE product_images pi
      JOIN products p
        ON p.partNumber = pi.partNumber
        AND p.shopId = pi.shopId
      SET pi.productId = p.id
      WHERE pi.partNumber = ?
      AND pi.shopId = ?
      `,
      [req.body.partNumber, shopId],
    );

    await syncProductListViewByProductId(id).catch(() => {});
    queueUpsertProductInTypesense(id);

    res.json({ success: true, id });
  } catch (err) {
    console.error("create error:", err);

    // ✅ THÊM ĐOẠN NÀY
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        message: "Mã sản phẩm đã tồn tại",
      });
    }

    res.status(500).json({ message: err.message });
  }
}

export async function update(req, res) {
  const shopId = req.shop.id;
  await productService.updateProduct(req.params.id, shopId, req.body);
  res.json({ success: true });
}

export async function remove(req, res) {
  const shopId = req.shop.id;
  const ids = req.body.ids || [req.params.id];
  const count = await productService.deleteProducts(shopId, ids);
  res.json({ success: true, deleted: count });
}

export const getProductsByShop = async (req, res) => {
  try {
    const shopId = req.shop.id;

    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const company = req.query.company || "";
    const model = req.query.model || "";
    const origin = req.query.origin || "";
    const keyword = req.query.keyword || "";

    const { items, total } = await productService.getProductsByShop(shopId, {
      page,
      limit,
      company,
      model,
      origin,
      keyword,
    });

    res.json({
      items,
      total,
      page,
      limit,
    });
  } catch (err) {
    console.error("getProductsByShop error:", err);
    res.status(500).json({
      message: err.message,
    });
  }
};

export const getShopProductFilterOptions = async (req, res) => {
  try {
    const shopId = req.shop.id;
    const { company, model } = req.query;
    const data = await productService.getShopProductFilterOptions(shopId, {
      company,
      model,
    });
    res.json(data);
  } catch (err) {
    console.error("getShopProductFilterOptions error:", err);
    res.status(500).json({ message: err.message });
  }
};

export const importImages = async (req, res) => {
  try {
    const shopId = req.shop.id;
    const files = req.files || [];

    await importImagesBatch(files, shopId);

    await invalidateListCache();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
