import { pool } from "../config/db.js";
import * as plvRepo from "../repositories/productListView.repository.js";
import { invalidateListCache } from "./listCache.service.js";
import { buildSeoProductSlug } from "../utils/productSlug.js";
import { sqlCategoryKeyFromPartName } from "../utils/categoryKey.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";

function normalizeThumbnailUrl(raw) {
  if (!raw) return null;
  const u = String(raw).trim();
  if (!u) return null;
  if (u.startsWith("http")) return u;
  const base = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
  if (!base) return u.startsWith("/") ? u : `/${u}`;
  const pathPart = decodeURIComponent(u).replace(/^\/+/, "");
  return `${base}/${pathPart}`;
}

const BRAND_SUBQUERY = `
      (
        SELECT MIN(cm.hang_xe)
        FROM product_car_applications pa
        INNER JOIN car_models cm ON cm.id = pa.carModelId
        WHERE pa.productId = p.id
      ) AS brand_primary
`;

export async function syncProductListViewByProductId(productId) {
  const id = Number(productId);
  if (!Number.isFinite(id) || id <= 0) return;

  const exists = await plvRepo.productListViewTableExists();
  if (!exists) return;

  const pc = await getProductsColumnsResolved();
  const slugSel = pc.slugSqlSelect("p");
  const ord = pc.orderExprQualified("p");

  const [rows] = await pool.query(
    `
    SELECT
      p.id,
      ${slugSel},
      p.partNumber,
      p.partName,
      p.price,
      ${ord} AS updatedAt,
      s.name AS shopName,
      ap.tinh_tp AS city,
      ${BRAND_SUBQUERY},
      (
        SELECT pi.url
        FROM product_images pi
        WHERE pi.productId = p.id
        ORDER BY pi.isPrimary DESC, pi.id ASC
        LIMIT 1
      ) AS thumbRaw
    FROM products p
    INNER JOIN shops s ON s.id = p.shopId
    LEFT JOIN address ap ON ap.id = s.provinceId
    WHERE p.id = ?
    `,
    [id],
  );

  const row = rows[0];
  if (!row) {
    await plvRepo.deleteProductListViewRow(id);
    await invalidateListCache();
    return;
  }

  const slug =
    row.slug && String(row.slug).trim()
      ? String(row.slug).trim()
      : buildSeoProductSlug({
          id: row.id,
          partName: row.partName,
          partNumber: row.partNumber,
        });

  const category_norm = sqlCategoryKeyFromPartName(row.partName);
  const brand_primary = row.brand_primary || null;

  await plvRepo.upsertProductListViewRow({
    productId: row.id,
    slug,
    partNumber: row.partNumber,
    partName: row.partName,
    brand_primary,
    category_norm,
    price: row.price,
    thumbnailUrl: normalizeThumbnailUrl(row.thumbRaw),
    shopName: row.shopName || "",
    city: row.city || null,
    updatedAt: row.updatedAt,
  });

  await invalidateListCache();
}

export async function syncProductListViewForShop(shopId) {
  const sid = Number(shopId);
  if (!Number.isFinite(sid) || sid <= 0) return;
  const exists = await plvRepo.productListViewTableExists();
  if (!exists) return;
  await plvRepo.updateShopFieldsForShop(sid);
  await invalidateListCache();
}
