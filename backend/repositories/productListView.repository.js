import { pool } from "../config/db.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";

const NO_SUCH_TABLE = "ER_NO_SUCH_TABLE";

export async function productListViewTableExists() {
  const [[row]] = await pool.query(
    `
    SELECT COUNT(*) AS c
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'product_list_view'
    `,
  );
  return Number(row?.c) > 0;
}

export async function deleteProductListViewRow(productId) {
  try {
    await pool.query(`DELETE FROM product_list_view WHERE productId = ?`, [
      productId,
    ]);
  } catch (e) {
    if (e.code === NO_SUCH_TABLE) return;
    throw e;
  }
}

export async function deleteProductListViewRows(productIds) {
  if (!productIds?.length) return;
  try {
    await pool.query(`DELETE FROM product_list_view WHERE productId IN (?)`, [
      productIds,
    ]);
  } catch (e) {
    if (e.code === NO_SUCH_TABLE) return;
    throw e;
  }
}

const LEGACY_UPSERT = `
      INSERT INTO product_list_view
        (productId, slug, partNumber, partName, price, thumbnailUrl, shopName, city, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        slug = VALUES(slug),
        partNumber = VALUES(partNumber),
        partName = VALUES(partName),
        price = VALUES(price),
        thumbnailUrl = VALUES(thumbnailUrl),
        shopName = VALUES(shopName),
        city = VALUES(city),
        updatedAt = VALUES(updatedAt)
      `;

const FULL_UPSERT = `
      INSERT INTO product_list_view
        (productId, slug, partNumber, partName, brand_primary, category_norm, price, thumbnailUrl, shopName, city, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        slug = VALUES(slug),
        partNumber = VALUES(partNumber),
        partName = VALUES(partName),
        brand_primary = VALUES(brand_primary),
        category_norm = VALUES(category_norm),
        price = VALUES(price),
        thumbnailUrl = VALUES(thumbnailUrl),
        shopName = VALUES(shopName),
        city = VALUES(city),
        updatedAt = VALUES(updatedAt)
      `;

export async function upsertProductListViewRow({
  productId,
  slug,
  partNumber,
  partName,
  brand_primary = null,
  category_norm = null,
  price,
  thumbnailUrl,
  shopName,
  city,
  updatedAt,
}) {
  const legacyParams = [
    productId,
    slug,
    partNumber,
    partName,
    price,
    thumbnailUrl,
    shopName,
    city,
    updatedAt,
  ];

  const fullParams = [
    productId,
    slug,
    partNumber,
    partName,
    brand_primary,
    category_norm,
    price,
    thumbnailUrl,
    shopName,
    city,
    updatedAt,
  ];

  try {
    await pool.query(FULL_UPSERT, fullParams);
  } catch (e) {
    if (e.code === NO_SUCH_TABLE) return;
    if (e.code === "ER_BAD_FIELD_ERROR") {
      try {
        await pool.query(LEGACY_UPSERT, legacyParams);
      } catch (e2) {
        if (e2.code === NO_SUCH_TABLE) return;
        throw e2;
      }
      return;
    }
    throw e;
  }
}

export async function updateShopFieldsForShop(shopId) {
  try {
    const pc = await getProductsColumnsResolved();
    const pid = pc.idExpr("p");
    const sid = pc.shopIdExpr("p");
    await pool.query(
      `
      UPDATE product_list_view v
      INNER JOIN products p ON ${pid} = v.productId
      INNER JOIN shops s ON ${pc.shopJoinOn("p", "s")}
      LEFT JOIN address ap ON ap.id = s.provinceId
      SET v.shopName = s.name,
          v.city = ap.tinh_tp
      WHERE ${sid} = ?
      `,
      [shopId],
    );
  } catch (e) {
    if (e.code === NO_SUCH_TABLE) return;
    throw e;
  }
}
