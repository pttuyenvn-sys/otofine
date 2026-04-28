import { pool } from "../config/db.js";
import { getRelatedProductsForDetail } from "../services/productRelated.service.js";
import { getProductsColumnsResolved } from "../utils/productsTableColumns.server.js";

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

export const getProductDetail = async (req, res) => {
  try {
    const raw = req.params.id;
    const resolved = resolveProductIdParam(raw);

    if (!resolved) {
      return res.status(400).json({ message: "Tham số không hợp lệ" });
    }

    let rows;
    if (typeof resolved === "number") {
      [rows] = await pool.query(
        `
      SELECT 
        p.*,

        s.name AS shopName,
        s.phone,
        s.addressDetail,
        s.salePolicy,
        s.warrantyPolicy,
        s.wardId,
        s.provinceId,

        a.phuong_xa,
        a.tinh_tp

      FROM products p

      LEFT JOIN shops s 
        ON s.id = p.shopId

      LEFT JOIN address a
        ON a.id = s.wardId

      WHERE p.id = ?
      `,
        [resolved],
      );
    } else {
      const pc = await getProductsColumnsResolved();
      const col = pc.slugColumnQualified("p");
      if (!col) {
        return res.status(404).json({
          message: "Không tìm thấy sản phẩm",
        });
      }
      [rows] = await pool.query(
        `
        SELECT 
          p.*,

          s.name AS shopName,
          s.phone,
          s.addressDetail,
          s.salePolicy,
          s.warrantyPolicy,
          s.wardId,
          s.provinceId,

          a.phuong_xa,
          a.tinh_tp

        FROM products p

        LEFT JOIN shops s 
          ON s.id = p.shopId

        LEFT JOIN address a
          ON a.id = s.wardId

        WHERE ${col} = ?
        `,
        [resolved.slug],
      );
    }

    if (!rows.length) {
      return res.status(404).json({
        message: "Không tìm thấy sản phẩm",
      });
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

    res.json({
      product,

      shop: {
        name: product.shopName,
        phone: product.phone,
        avatar: shopExtras.avatar,
        zalo: shopExtras.zalo,

        addressDetail: product.addressDetail,
        wardId: product.wardId,
        provinceId: product.provinceId,

        phuong_xa: product.phuong_xa,
        tinh_tp: product.tinh_tp,

        salePolicy: product.salePolicy,
        warrantyPolicy: product.warrantyPolicy,
      },

      images,
      cars,
      related,
    });
  } catch (err) {
    console.error("getProductDetail error:", err);

    res.status(500).json({
      message: "Server error",
    });
  }
};
