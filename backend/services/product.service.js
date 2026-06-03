import { pool } from "../config/db.js";
import { mapProduct } from "./adapters/product.adapter.js";
import * as plvRepo from "../repositories/productListView.repository.js";
import { syncProductListViewByProductId } from "./productListViewSync.service.js";
import {
  queueDeleteProductFromTypesense,
  queueUpsertProductInTypesense,
} from "./typesenseRealtimeSync.service.js";
import { buildSeoProductSlug } from "../utils/productSlug.js";
import {
  buildLifecycleFilterSql,
  enrichProductGovernance,
  getShopPublicStatus,
  sqlSellerDeletedAtSelect,
} from "../modules/products/services/sellerProductGovernance.service.js";
import { getSchemaCapabilities } from "../utils/schemaCapabilities.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "../config/r2.js";

/* ======================================================
   GET ALL PRODUCTS + CARS (OTO FINE VERSION)
   ====================================================== */
export async function getAllProducts() {
  // 1️⃣ Lấy product
  const [products] = await pool.query(`
    SELECT
      p.id,
      p.shop_id,
      p.part_number,
      p.part_name,
      p.stock,
      p.price,
      p.category,
      p.origin,
      p.short_description,
      p.full_description,
      p.weight,
      p.length,
      p.width,
      p.height,
      p.image_path,
      p.created_at
    FROM products p
    ORDER BY p.id DESC
  `);

  if (!products.length) return [];

  // 2️⃣ Lấy cars theo product
  const ids = products.map((p) => p.id);

  const [cars] = await pool.query(
    `
    SELECT
      pc.product_id,
      cm.brand AS company,
      cm.model,
      cm.year_start,
      cm.year_end
    FROM product_cars pc
    JOIN car_models cm ON cm.id = pc.car_model_id
    WHERE pc.product_id IN (?)
    ORDER BY pc.product_id, cm.brand, cm.model
    `,
    [ids],
  );

  // 3️⃣ Gom cars theo product_id
  const carsByProduct = {};
  for (const c of cars) {
    if (!carsByProduct[c.product_id]) {
      carsByProduct[c.product_id] = [];
    }
    carsByProduct[c.product_id].push({
      company: c.company,
      model: c.model,
      yearStart: c.year_start,
      yearEnd: c.year_end,
    });
  }

  // 4️⃣ Map sang JSON CŨ (QUAN TRỌNG)
  return products.map((p) => mapProduct(p, carsByProduct));
}

export async function getAllProductsByShop(shopId) {
  const [rows] = await pool.query(
    `
    SELECT
      p.id,
      p.partName,
      p.price,
      p.createdAt
    FROM products p
    WHERE p.shopId = ?
    ORDER BY p.id DESC
    `,
    [shopId],
  );

  return rows.map((p) => ({
    id: p.id,
    name: p.partName,
    price: p.price,
    thumbnail: null, // hiện DB chưa có ảnh
    createdAt: p.createdAt,
  }));
}

/* ===============================
   LIST PRODUCT
================================ */
export async function listProducts(shopId, filters = {}) {
  const {
    keyword,
    brand,
    model,
    year,
    page = 1,
    limit = 20,
    sortBy = "id",
    sortDir = "desc",
  } = filters;

  const params = [shopId];
  let where = `WHERE p.shopId = ?`;

  if (keyword) {
    where += ` AND (
      p.partNumber LIKE ?
      OR p.partName LIKE ?
    )`;
    params.push(`%${keyword}%`, `%${keyword}%`);
  }

  if (brand) {
    where += ` AND c.hang_xe = ?`;
    params.push(brand);
  }

  if (model) {
    where += ` AND c.ten_xe = ?`;
    params.push(model);
  }

  if (year) {
    where += ` AND ? BETWEEN a.year_from AND a.year_to`;
    params.push(Number(year));
  }

  // whitelist cột sort (CHỐNG SQL injection)
  const sortFields = {
    id: "p.id",
    partNumber: "p.partNumber",
    partName: "p.partName",
    price: "p.price",
    stock: "p.stock",
    createdAt: "p.createdAt",
  };

  const sortCol = sortFields[sortBy] || "p.id";
  const direction = sortDir === "asc" ? "ASC" : "DESC";

  const offset = (Number(page) - 1) * Number(limit);

  const sql = `
    SELECT
      p.id,
      p.shopId,
      p.partNumber,
      p.partName,
      p.stock,
      p.price,
      p.origin,
      p.shortDescription,
      p.description AS fullDescription,
      p.weight,
      p.length,
      p.width,
      p.height,

      GROUP_CONCAT(
      DISTINCT
      CASE
        WHEN c.hang_xe IS NOT NULL
        AND c.ten_xe IS NOT NULL
        AND a.year_from IS NOT NULL
        AND a.year_to IS NOT NULL
        THEN CONCAT(
            c.hang_xe,' ',c.ten_xe,
            ' (',a.year_from,'-',a.year_to,')'
        )

        WHEN c.hang_xe IS NOT NULL
        AND c.ten_xe IS NOT NULL
        THEN CONCAT(c.hang_xe,' ',c.ten_xe)

        WHEN c.hang_xe IS NOT NULL
        THEN c.hang_xe

        ELSE ''
      END
      SEPARATOR '<br>'
      ) AS Car

    FROM products p
    LEFT JOIN product_car_applications a ON a.productId = p.id
    LEFT JOIN car_models c ON c.id = a.carModelId
    ${where}
    GROUP BY p.id
    ORDER BY ${sortCol} ${direction}
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) AS total
    FROM (
      SELECT p.id
      FROM products p
      LEFT JOIN product_car_applications a ON a.productId = p.id
      LEFT JOIN car_models c ON c.id = a.carModelId
      ${where}
      GROUP BY p.id
    ) x
  `;

  const countParams = [...params];
  const [[totalRow]] = await pool.query(countSql, countParams);

  params.push(Number(limit), offset);

  const [rows] = await pool.query(sql, params);

  const total = Number(totalRow?.total) || 0;

  return {
    items: rows,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/* ===============================
   CREATE PRODUCT
================================ */
export async function createProduct(shopId, data) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      partNumber,
      partName,
      stock,
      price,
      origin,
      shortDescription,
      description,
      weight,
      length,
      width,
      height,
      cars = [],
    } = data;

    const [rs] = await conn.query(
      `
      INSERT INTO products
      (shopId, partNumber, partName, stock, price, origin,
       shortDescription, description, weight, length, width, height, moderation_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        shopId,
        partNumber,
        partName,
        stock,
        price,
        origin,
        shortDescription,
        description,
        weight,
        length,
        width,
        height,
        'pending_review',
      ],
    );

    const productId = rs.insertId;

    try {
      const seo = buildSeoProductSlug({
        id: productId,
        partName,
        partNumber,
      });
      await conn.query(`UPDATE products SET slug = ? WHERE id = ?`, [
        seo,
        productId,
      ]);
    } catch (e) {
      if (e.code !== "ER_BAD_FIELD_ERROR") throw e;
    }

    for (const c of cars) {
      const { carModelId, year_from, year_to } = c;

      // ===== 1. mapping product ↔ car =====
      await conn.query(
        `
    INSERT INTO product_car_applications
    (productId, carModelId, year_from, year_to)
    VALUES (?, ?, ?, ?)
    `,
        [productId, carModelId, year_from, year_to],
      );

      // ===== 2. ATTRIBUTE =====
      const attributeMap = {
        dong_co: 1,
        hop_so: 2,
        so_cau: 3,
        kieu_dang: 4,
      };

      for (const [key, typeId] of Object.entries(attributeMap)) {
        if (!c[key]) continue;

        const [attr] = await conn.query(
          `
      SELECT id FROM attributes
      WHERE attribute_type_id = ? AND name = ?
      LIMIT 1
      `,
          [typeId, c[key]],
        );

        if (attr.length > 0) {
          await conn.query(
            `
        INSERT IGNORE INTO car_model_attributes (car_model_id, attribute_id)
        VALUES (?, ?)
        `,
            [carModelId, attr[0].id],
          );
        }
      }

      // ===== 3. CC =====
      if (c.cc) {
        await conn.query(
          `
      INSERT INTO car_model_specs (car_model_id, engine_cc)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE engine_cc = VALUES(engine_cc)
      `,
          [carModelId, c.cc],
        );
      }
    }

    await conn.commit();
    queueUpsertProductInTypesense(productId);
    return productId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/* ===============================
   UPDATE PRODUCT
================================ */
export async function updateProduct(data) {
  const {
    id,
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
    cars = [],
    deletedImages = [],
  } = data;

  await pool.query(
    `
  UPDATE products SET
    partNumber = ?,
    partName = ?,
    origin = ?,
    stock = ?,
    price = ?,
    shortDescription = ?,
    description = ?,
    weight = ?,
    length = ?,
    width = ?,
    height = ?
    WHERE id = ? AND shopId = ?
    `,
    [
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
      id,
      shopId,
    ],
  );

  // ===== XÓA ẢNH ĐƯỢC CHỌN =====
  if (deletedImages && deletedImages.length > 0) {
    const [rows] = await pool.query(
      `SELECT id, url FROM product_images WHERE id IN (?)`,
      [deletedImages],
    );

    for (const row of rows) {
      if (!row.url) continue;

      const key = row.url.replace(process.env.R2_PUBLIC_URL + "/", "");

      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key,
          }),
        );
      } catch (err) {
        console.error("R2 delete error:", key, err.message);
      }
    }

    await pool.query(`DELETE FROM product_images WHERE id IN (?)`, [
      deletedImages,
    ]);
  }

  // ===== XÓA cars cũ =====
  await pool.query(`DELETE FROM product_car_applications WHERE productId = ?`, [
    id,
  ]);

  // ===== INSERT cars mới =====
  for (const c of cars) {
    const { carModelId, year_from, year_to } = c;

    await pool.query(
      `
    INSERT INTO product_car_applications
    (productId, carModelId, year_from, year_to)
    VALUES (?, ?, ?, ?)
    `,
      [id, carModelId, year_from, year_to],
    );

    // ===== ATTRIBUTE =====
    const attributeMap = {
      dong_co: 1,
      hop_so: 2,
      so_cau: 3,
      kieu_dang: 4,
    };

    for (const [key, typeId] of Object.entries(attributeMap)) {
      if (!c[key]) continue;

      const [attr] = await pool.query(
        `
      SELECT id FROM attributes
      WHERE attribute_type_id = ? AND name = ?
      LIMIT 1
      `,
        [typeId, c[key]],
      );

      if (attr.length > 0) {
        await pool.query(
          `
        INSERT IGNORE INTO car_model_attributes (car_model_id, attribute_id)
        VALUES (?, ?)
        `,
          [carModelId, attr[0].id],
        );
      }
    }

    // ===== CC =====
    if (c.cc) {
      await pool.query(
        `
      INSERT INTO car_model_specs (car_model_id, engine_cc)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE engine_cc = VALUES(engine_cc)
      `,
        [carModelId, c.cc],
      );
    }
  }

  try {
    const seo = buildSeoProductSlug({
      id,
      partName,
      partNumber,
    });
    await pool.query(`UPDATE products SET slug = ? WHERE id = ? AND shopId = ?`, [
      seo,
      id,
      shopId,
    ]);
  } catch (e) {
    if (e.code !== "ER_BAD_FIELD_ERROR") throw e;
  }

  await syncProductListViewByProductId(id).catch(() => {});
  queueUpsertProductInTypesense(id);
}

/* ===============================
   DELETE (single / bulk)
================================ */
export async function deleteProduct({ id, shopId }) {
  const caps = await getSchemaCapabilities();
  let rs;

  if (caps.hasSellerDeletedAt) {
    [rs] = await pool.query(
      `
      UPDATE products
      SET seller_deleted_at = COALESCE(seller_deleted_at, NOW()),
          moderation_status = 'deleted'
      WHERE id = ? AND shopId = ? AND seller_deleted_at IS NULL
      `,
      [id, shopId],
    );
  } else {
    [rs] = await pool.query(
      `
      UPDATE products
      SET moderation_status = 'hidden'
      WHERE id = ? AND shopId = ? AND TRIM(LOWER(moderation_status)) NOT IN ('hidden', 'deleted')
      `,
      [id, shopId],
    );
  }

  if (rs.affectedRows > 0) {
    await plvRepo.deleteProductListViewRow(id);
    queueDeleteProductFromTypesense(id);
  }
  return rs.affectedRows > 0;
}

export async function deleteProducts({ shopId, ids }) {
  const caps = await getSchemaCapabilities();
  let rs;

  if (caps.hasSellerDeletedAt) {
    [rs] = await pool.query(
      `
      UPDATE products
      SET seller_deleted_at = COALESCE(seller_deleted_at, NOW()),
          moderation_status = 'deleted'
      WHERE shopId = ? AND id IN (?) AND seller_deleted_at IS NULL
      `,
      [shopId, ids],
    );
  } else {
    [rs] = await pool.query(
      `
      UPDATE products
      SET moderation_status = 'hidden'
      WHERE shopId = ? AND id IN (?) AND TRIM(LOWER(moderation_status)) NOT IN ('hidden', 'deleted')
      `,
      [shopId, ids],
    );
  }

  if (rs.affectedRows > 0 && Array.isArray(ids)) {
    await plvRepo.deleteProductListViewRows(ids);
    for (const pid of ids) {
      queueDeleteProductFromTypesense(pid);
    }
  }
  return rs.affectedRows;
}

export async function getProductCars(productId) {
  const [rows] = await pool.query(
    `
    SELECT
      a.id,
      a.carModelId,
      c.hang_xe,
      c.ten_xe,
      a.year_from,
      a.year_to
    FROM product_car_applications a
    JOIN car_models c ON c.id = a.carModelId
    WHERE a.productId = ?
    ORDER BY c.hang_xe, c.ten_xe, a.year_from
    `,
    [productId],
  );
  return rows;
}

/** WHERE products p … (chỉ bảng products + EXISTS), dùng cho COUNT và base subquery */
function buildShopProductWhereClause(shopId, opts = {}, schema = {}) {
  const params = [shopId];
  const parts = ["p.shopId = ?"];

  const kw = (opts.keyword && String(opts.keyword).trim()) || "";
  if (kw) {
    const like = `%${kw}%`;
    parts.push(
      "(p.partNumber LIKE ? OR p.partName LIKE ? OR p.shortDescription LIKE ?)",
    );
    params.push(like, like, like);
  }

  const origin = (opts.origin && String(opts.origin).trim()) || "";
  if (origin) {
    parts.push("p.origin = ?");
    params.push(origin);
  }

  const company = (opts.company && String(opts.company).trim()) || "";
  const model = (opts.model && String(opts.model).trim()) || "";

  if (company) {
    parts.push(`EXISTS (
      SELECT 1 FROM product_car_applications a_f
      INNER JOIN car_models m_f ON m_f.id = a_f.carModelId
      WHERE a_f.productId = p.id AND m_f.hang_xe = ?
    )`);
    params.push(company);
  }

  if (model) {
    if (company) {
      parts.push(`EXISTS (
        SELECT 1 FROM product_car_applications a_f2
        INNER JOIN car_models m_f2 ON m_f2.id = a_f2.carModelId
        WHERE a_f2.productId = p.id AND m_f2.ten_xe = ? AND m_f2.hang_xe = ?
      )`);
      params.push(model, company);
    } else {
      parts.push(`EXISTS (
        SELECT 1 FROM product_car_applications a_f2
        INNER JOIN car_models m_f2 ON m_f2.id = a_f2.carModelId
        WHERE a_f2.productId = p.id AND m_f2.ten_xe = ?
      )`);
      params.push(model);
    }
  }

  const lifecycle = (opts.lifecycle && String(opts.lifecycle).trim()) || "";
  if (lifecycle) {
    parts.push(buildLifecycleFilterSql(lifecycle, schema));
  }

  return { whereSql: parts.join(" AND "), params };
}

/**
 * Danh sách sản phẩm shop + phân trang + lọc (hãng / loại xe / xuất xứ / từ khóa).
 * @returns {{ items: any[], total: number }}
 */
export async function getProductsByShop(shopId, opts = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
  const offset = (page - 1) * limit;
  const lifecycle = (opts.lifecycle && String(opts.lifecycle).trim()) || "";
  const caps = await getSchemaCapabilities();
  const sellerDeletedSelect = sqlSellerDeletedAtSelect(caps.hasSellerDeletedAt, "p");

  const { whereSql, params: whereParams } = buildShopProductWhereClause(
    shopId,
    opts,
    caps,
  );

  const isDev = process.env.NODE_ENV === "development";
  let totalBeforeGovernance = null;
  if (isDev) {
    const [[beforeRow]] = await pool.query(
      `SELECT COUNT(*) AS total FROM products p WHERE p.shopId = ?`,
      [shopId],
    );
    totalBeforeGovernance = Number(beforeRow?.total) || 0;
  }

  const [[countRow]] = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM (
      SELECT p.id
      FROM products p
      WHERE ${whereSql}
    ) t
    `,
    whereParams,
  );

  const total = Number(countRow?.total) || 0;

  if (isDev) {
    console.info("[seller-products:governance]", {
      shopId,
      lifecycle: lifecycle || "(none)",
      hasSellerDeletedAt: caps.hasSellerDeletedAt,
      lifecycleFilter: lifecycle ? buildLifecycleFilterSql(lifecycle, caps) : null,
      totalBeforeGovernance,
      totalAfterGovernance: total,
    });
  }

  const shopPublicStatus = await getShopPublicStatus(shopId);

  const [rows] = await pool.query(
    `
    SELECT
      p.id,
      p.shopId,
      p.partNumber,
      p.partName,
      p.stock,
      p.price,
      p.origin,
      p.shortDescription,
      p.description AS fullDescription,
      p.weight,
      p.length,
      p.width,
      p.height,
      p.createdAt,
      p.moderation_status AS moderationStatus,
      ${sellerDeletedSelect},
      (
        SELECT e.reject_reason FROM product_moderation_events e
        WHERE e.product_id = p.id AND e.new_status = 'rejected'
        ORDER BY e.created_at DESC LIMIT 1
      ) AS lastRejectReason,
      (
        SELECT e.notes FROM product_moderation_events e
        WHERE e.product_id = p.id AND e.new_status = 'rejected'
        ORDER BY e.created_at DESC LIMIT 1
      ) AS lastRejectNotes,
      (
        SELECT e.created_at FROM product_moderation_events e
        WHERE e.product_id = p.id AND e.new_status = 'rejected'
        ORDER BY e.created_at DESC LIMIT 1
      ) AS lastRejectedAt,
      MAX(CASE WHEN at.code = 'dong_co' THEN attr.name END) AS dong_co,
      MAX(CASE WHEN at.code = 'hop_so' THEN attr.name END) AS hop_so,
      MAX(CASE WHEN at.code = 'so_cau' THEN attr.name END) AS so_cau,
      MAX(CASE WHEN at.code = 'kieu_dang' THEN attr.name END) AS kieu_dang,
      MAX(cms.engine_cc) AS cc,

      GROUP_CONCAT(
      DISTINCT
      CASE
        WHEN m.hang_xe IS NOT NULL
        AND m.ten_xe IS NOT NULL
        AND a.year_from IS NOT NULL
        AND a.year_to IS NOT NULL
        THEN CONCAT(
            m.hang_xe,' ',m.ten_xe,
            ' (',a.year_from,'-',a.year_to,')'
        )

        WHEN m.hang_xe IS NOT NULL
        AND m.ten_xe IS NOT NULL
        THEN CONCAT(m.hang_xe,' ',m.ten_xe)

        WHEN m.hang_xe IS NOT NULL
        THEN m.hang_xe

        ELSE ''
      END
      SEPARATOR '<br/>'
      ) AS car

    FROM products p
    LEFT JOIN product_car_applications a ON a.productId = p.id
    LEFT JOIN car_models m ON m.id = a.carModelId
    LEFT JOIN car_model_attributes cma ON cma.car_model_id = m.id
    LEFT JOIN attributes attr ON attr.id = cma.attribute_id
    LEFT JOIN attribute_types at ON at.id = attr.attribute_type_id
    LEFT JOIN car_model_specs cms ON cms.car_model_id = m.id
    WHERE ${whereSql}
    GROUP BY p.id
    ORDER BY p.id DESC
    LIMIT ? OFFSET ?
    `,
    [...whereParams, Number(limit), Number(offset)],
  );

  if (!rows.length) {
    return { items: [], total };
  }

  // ===== lấy danh sách ID =====
  const ids = rows.map((p) => p.id);

  // ===== LẤY IMAGES =====
  const [images] = await pool.query(
    `
  SELECT id, productId, url, isPrimary
  FROM product_images
  WHERE productId IN (?)
  ORDER BY isPrimary DESC, id ASC
`,
    [ids],
  );

  const imagesMap = {};
  images.forEach((img) => {
    if (!imagesMap[img.productId]) {
      imagesMap[img.productId] = [];
    }

    if (imagesMap[img.productId].some((row) => row.url === img.url)) {
      return;
    }

    imagesMap[img.productId].push({
      id: img.id,
      url: img.url,
    });
  });

  // ===== LẤY CARS =====
  const [cars] = await pool.query(
    `
    SELECT
      a.productId,
      a.carModelId,
      MAX(a.year_from) AS year_from,
      MAX(a.year_to) AS year_to,
      m.hang_xe AS brand,

      MAX(CASE WHEN at.code = 'dong_co' THEN attr.name END) AS dong_co,
      MAX(CASE WHEN at.code = 'hop_so' THEN attr.name END) AS hop_so,
      MAX(CASE WHEN at.code = 'so_cau' THEN attr.name END) AS so_cau,
      MAX(CASE WHEN at.code = 'kieu_dang' THEN attr.name END) AS kieu_dang,
      MAX(cms.engine_cc) AS cc

    FROM product_car_applications a
    JOIN car_models m ON m.id = a.carModelId
    LEFT JOIN car_model_attributes cma ON cma.car_model_id = m.id
    LEFT JOIN attributes attr ON attr.id = cma.attribute_id
    LEFT JOIN attribute_types at ON at.id = attr.attribute_type_id
    LEFT JOIN car_model_specs cms ON cms.car_model_id = m.id

    WHERE a.productId IN (?)

    GROUP BY a.productId, a.carModelId
  `,
    [ids],
  );

  const carsMap = {};
  cars.forEach((c) => {
    if (!carsMap[c.productId]) carsMap[c.productId] = [];
    carsMap[c.productId].push({
      carModelId: c.carModelId,
      year_from: c.year_from,
      year_to: c.year_to,
      brand: c.brand,

      dong_co: c.dong_co,
      hop_so: c.hop_so,
      so_cau: c.so_cau,
      kieu_dang: c.kieu_dang,
      cc: c.cc,
    });
  });

  // ===== GỘP DATA =====
  const items = rows.map((p) => {
    const base = {
      ...p,
      dong_co: p.dong_co,
      hop_so: p.hop_so,
      so_cau: p.so_cau,
      kieu_dang: p.kieu_dang,
      cc: p.cc,
      images: imagesMap[p.id] || [],
      cars: carsMap[p.id] || [],
    };
    const gov = enrichProductGovernance(base, shopPublicStatus);
    return { ...base, ...gov };
  });

  return { items, total };
}

/** Giá trị cho dropdown lọc theo đúng kho sản phẩm của shop */
export async function getShopProductFilterOptions(shopId, query = {}) {
  const company = (query.company && String(query.company).trim()) || "";
  const model = (query.model && String(query.model).trim()) || "";

  const [brands] = await pool.query(
    `
    SELECT DISTINCT m.hang_xe AS value
    FROM products p
    INNER JOIN product_car_applications a ON a.productId = p.id
    INNER JOIN car_models m ON m.id = a.carModelId
    WHERE p.shopId = ?
      AND m.hang_xe IS NOT NULL
      AND TRIM(m.hang_xe) <> ''
    ORDER BY m.hang_xe
    `,
    [shopId],
  );

  const modelParams = [shopId];
  let modelSql = `
    SELECT DISTINCT m.ten_xe AS value
    FROM products p
    INNER JOIN product_car_applications a ON a.productId = p.id
    INNER JOIN car_models m ON m.id = a.carModelId
    WHERE p.shopId = ?
      AND m.ten_xe IS NOT NULL
      AND TRIM(m.ten_xe) <> ''
  `;
  if (company) {
    modelSql += " AND m.hang_xe = ?";
    modelParams.push(company);
  }
  modelSql += " ORDER BY m.ten_xe";
  const [models] = await pool.query(modelSql, modelParams);

  const originParams = [shopId];
  let originSql = `
    SELECT DISTINCT p.origin AS value
    FROM products p
    WHERE p.shopId = ?
      AND p.origin IS NOT NULL
      AND TRIM(p.origin) <> ''
  `;
  if (company && model) {
    originSql += `
      AND EXISTS (
        SELECT 1 FROM product_car_applications a
        INNER JOIN car_models m ON m.id = a.carModelId
        WHERE a.productId = p.id AND m.hang_xe = ? AND m.ten_xe = ?
      )`;
    originParams.push(company, model);
  } else if (company) {
    originSql += `
      AND EXISTS (
        SELECT 1 FROM product_car_applications a
        INNER JOIN car_models m ON m.id = a.carModelId
        WHERE a.productId = p.id AND m.hang_xe = ?
      )`;
    originParams.push(company);
  } else if (model) {
    originSql += `
      AND EXISTS (
        SELECT 1 FROM product_car_applications a
        INNER JOIN car_models m ON m.id = a.carModelId
        WHERE a.productId = p.id AND m.ten_xe = ?
      )`;
    originParams.push(model);
  }
  originSql += " ORDER BY p.origin";
  const [origins] = await pool.query(originSql, originParams);

  return {
    brands: brands.map((r) => r.value),
    models: models.map((r) => r.value),
    origins: origins.map((r) => r.value),
  };
}

// ===============================
// FILTER PRODUCTS (BY SHOP + CAR STRING)
// ===============================
export async function filterProducts(shopId, company, model, category, origin) {
  let sql = `
    SELECT
      p.id,
      p.shopId,
      p.partNumber,
      p.partName,
      p.stock,
      p.price,
      p.origin,
      p.shortDescription,
      p.description AS fullDescription,
      p.weight,
      p.length,
      p.width,
      p.height,
      p.createdAt,

      GROUP_CONCAT(
      DISTINCT
      CASE
        WHEN m.hang_xe IS NOT NULL
        AND m.ten_xe IS NOT NULL
        AND a.year_from IS NOT NULL
        AND a.year_to IS NOT NULL
        THEN CONCAT(
            m.hang_xe,' ',m.ten_xe,
            ' (',a.year_from,'-',a.year_to,')'
        )

        WHEN m.hang_xe IS NOT NULL
        AND m.ten_xe IS NOT NULL
        THEN CONCAT(
            m.hang_xe,' ',m.ten_xe
        )

        WHEN m.hang_xe IS NOT NULL
        THEN m.hang_xe

        ELSE ''
      END
      SEPARATOR '<br/>'
      ) AS car

    FROM products p
    LEFT JOIN product_car_applications a ON a.productId = p.id
    LEFT JOIN car_models m ON m.id = a.carModelId
    WHERE p.shopId = ?
  `;

  const params = [shopId];

  if (company) {
    sql += " AND m.hang_xe = ?";
    params.push(company);
  }

  if (model) {
    sql += " AND m.ten_xe = ?";
    params.push(model);
  }

  if (origin) {
    sql += " AND p.origin = ?";
    params.push(origin);
  }

  if (category) {
    sql += " AND p.category = ?";
    params.push(category);
  }

  sql += `
    GROUP BY p.id
    ORDER BY p.id DESC
  `;

  const [rows] = await pool.query(sql, params);
  return rows;
}
