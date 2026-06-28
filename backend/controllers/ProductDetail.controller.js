import { pool } from "../config/db.js";
import { getRelatedProductsForDetail } from "../services/productRelated.service.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";
import {
  buildPdpProductWhereClause,
  resolvePdpArchiveState,
} from "../modules/products/services/productPublicVisibility.server.js";
import { getOrSetCache } from "../services/listCache.service.js";
import { buildCanonicalFields } from "../modules/products/services/canonicalPath.server.js";
import {
  buildProductIdentity,
  pickPrimaryFitment,
} from "../../frontend/lib/identity/buildProductIdentity.js";

const DETAIL_CACHE_TTL_MS = 60 * 1000;

function resolveProductIdParam(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  const legacy = /^sp-(\d+)$/i.exec(s);
  if (legacy) {
    const n = Number(legacy[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  return { slug: s };
}

async function buildProductDetailPayload(resolved) {
  let rows;
  const vis = await buildPdpProductWhereClause({ aliasP: "p" });
  const shopSelect = `
        s.id AS shopRowId,
        s.slug AS shopSlug,
        s.public_status AS shopPublicStatus,
        s.name AS shopName,
        s.phone,
        s.addressDetail,
        s.salePolicy,
        s.warrantyPolicy,
        s.wardId,
        s.provinceId,
  `;
  if (typeof resolved === "number") {
    [rows] = await pool.query(
      `
      SELECT 
        p.*,

        ${shopSelect}

        a.phuong_xa,
        a.tinh_tp

      FROM products p

      INNER JOIN shops s 
        ON s.id = p.shopId

      LEFT JOIN address a
        ON a.id = s.wardId

      WHERE p.id = ?
      ${vis.sql}
      `,
      [resolved],
    );
  } else {
    const pc = await getProductsColumnsResolved();
    const col = pc.slugColumnQualified("p");
    if (!col) {
      const err = new Error("NOT_FOUND");
      err.code = "NOT_FOUND";
      throw err;
    }
    [rows] = await pool.query(
      `
        SELECT 
          p.*,

          ${shopSelect}

          a.phuong_xa,
          a.tinh_tp

        FROM products p

        INNER JOIN shops s 
          ON s.id = p.shopId

        LEFT JOIN address a
          ON a.id = s.wardId

        WHERE ${col} = ?
        ${vis.sql}
        `,
      [resolved.slug],
    );
  }

  if (!rows.length) {
    const err = new Error("NOT_FOUND");
    err.code = "NOT_FOUND";
    throw err;
  }

  const product = rows[0];
  const id = product.id;

  product.image = `${process.env.R2_PUBLIC_URL}/shops/${product.shopId}/${String(
    product.partNumber,
  )
    .trim()
    .toUpperCase()}.webp`;

  const [images] = await pool.query(
    `
      SELECT *
      FROM product_images
      WHERE productId = ?
      ORDER BY isPrimary DESC, id ASC
      `,
    [id],
  );

  const [cars] = await pool.query(
    `
      SELECT 
        cm.hang_xe,
        cm.ten_xe,
        pca.year_from,
        pca.year_to
      FROM product_car_applications pca
      JOIN car_models cm ON cm.id = pca.carModelId
      WHERE pca.productId = ?
      ORDER BY pca.is_primary DESC, pca.id ASC
      `,
    [id],
  );

  const [categories] = await pool.query(
    `
      SELECT
        pc.id,
        pc.category_name,
        pc.canonical_name,
        COALESCE(NULLIF(pc.canonical_slug, ''), pc.category_slug) AS canonical_slug
      FROM product_category_map pcm
      JOIN product_categories pc ON pc.id = pcm.category_id
      WHERE pcm.product_id = ?
      ORDER BY pcm.is_primary DESC, pc.category_name ASC
      `,
    [id],
  );

  let shopExtras = { avatar: null, zalo: null };
  if (product.shopId) {
    try {
      const [sx] = await pool.query(
        "SELECT avatar, zalo FROM shops WHERE id = ? LIMIT 1",
        [product.shopId],
      );
      if (sx[0]) {
        shopExtras = {
          avatar: sx[0].avatar || null,
          zalo: sx[0].zalo || null,
        };
      }
    } catch (e) {
      if (e.code !== "ER_BAD_FIELD_ERROR") throw e;
    }
  }

  let related = [];
  try {
    related = await getRelatedProductsForDetail(id, { limit: 12 });
  } catch (e) {
    console.error("getRelatedProductsForDetail:", e);
    related = [];
  }

  const canonical = buildCanonicalFields(
    {
      id: product.id,
      partName: product.partName,
      partNumber: product.partNumber,
      shortDescription: product.shortDescription,
    },
    cars,
  );
  const productIdentity = buildProductIdentity(
    {
      id: product.id,
      partName: product.partName,
      partNumber: product.partNumber,
    },
    pickPrimaryFitment(cars),
    { siteOrigin: process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://otofine.com" },
  );

  const archive = resolvePdpArchiveState(product.shopPublicStatus);

  return {
    product,

    shop: {
      id: product.shopRowId ?? product.shopId ?? null,
      slug: product.shopSlug || null,
      name: product.shopName,
      phone: product.phone,
      avatar: shopExtras.avatar,
      zalo: shopExtras.zalo,
      publicStatus: product.shopPublicStatus || null,
      sellerUnavailable: archive.sellerUnavailable,

      addressDetail: product.addressDetail,
      wardId: product.wardId,
      provinceId: product.provinceId,

      phuong_xa: product.phuong_xa,
      tinh_tp: product.tinh_tp,

      salePolicy: product.salePolicy,
      warrantyPolicy: product.warrantyPolicy,
    },

    pdpArchiveState: archive.archived ? "archived" : "active",

    images,
    cars,
    categories: (categories || []).map((row) => ({
      id: row.id,
      categoryName: row.category_name,
      canonicalName: row.canonical_name || row.category_name,
      canonicalSlug: row.canonical_slug,
    })),
    related,
    canonicalPath: canonical.canonicalPath,
    canonicalUrl: canonical.canonicalUrl,
    productIdentity,
  };
}

export const getProductDetail = async (req, res) => {
  try {
    const raw = req.params.id;
    const resolved = resolveProductIdParam(raw);

    if (!resolved) {
      return res.status(400).json({ message: "Tham số không hợp lệ" });
    }

    const payload =
      typeof resolved === "number"
        ? await getOrSetCache(
            `detail:${resolved}`,
            DETAIL_CACHE_TTL_MS,
            () => buildProductDetailPayload(resolved),
          )
        : await buildProductDetailPayload(resolved);

    res.json(payload);
  } catch (err) {
    if (err.code === "NOT_FOUND") {
      return res.status(404).json({
        message: "Không tìm thấy sản phẩm",
      });
    }
    console.error("getProductDetail error:", err);

    res.status(500).json({
      message: "Server error",
    });
  }
};
