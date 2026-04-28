import xlsx from "xlsx";
import path from "path";
import fs from "fs";
import { pool } from "../config/db.js";

export async function exportProductsToExcel(shopId, filters) {
  const [rows] = await pool.query(
    `
    SELECT
      p.id,
      p.shopId,
      p.partNumber,
      p.partName,
      p.stock,
      p.price,

      c.hang_xe,
      c.ten_xe,
      a.year_from,
      a.year_to,

      MAX(CASE WHEN at.code = 'dong_co' THEN attr.name END) AS dong_co,
      MAX(CASE WHEN at.code = 'hop_so' THEN attr.name END) AS hop_so,
      MAX(CASE WHEN at.code = 'so_cau' THEN attr.name END) AS so_cau,
      MAX(CASE WHEN at.code = 'kieu_dang' THEN attr.name END) AS kieu_dang,

      MAX(cms.engine_cc) AS cc,

      p.origin,
      p.shortDescription,
      p.description AS fullDescription,
      p.weight,
      p.length,
      p.width,
      p.height

    FROM products p
    LEFT JOIN product_car_applications a ON a.productId = p.id
    LEFT JOIN car_models c ON c.id = a.carModelId
    LEFT JOIN car_model_attributes cma ON cma.car_model_id = c.id
    LEFT JOIN attributes attr ON attr.id = cma.attribute_id
    LEFT JOIN attribute_types at ON at.id = attr.attribute_type_id
    LEFT JOIN car_model_specs cms ON cms.car_model_id = c.id

    WHERE p.shopId = ?

    GROUP BY p.id, c.id, a.year_from, a.year_to
    `,
    [shopId],
  );

  const excelData = rows.map((p) => ({
    ShopID: p.shopId,
    PartNumber: p.partNumber,
    PartName: p.partName,
    Stock: p.stock,
    Price: Number(p.price).toLocaleString("vi-VN"),

    hang_xe: p.hang_xe,
    ten_xe: p.ten_xe,
    year_from: p.year_from,
    year_to: p.year_to,

    dong_co: p.dong_co,
    hop_so: p.hop_so,
    so_cau: p.so_cau,
    kieu_dang: p.kieu_dang,
    cc: p.cc,

    Origin: p.origin,
    ShortDescription: p.shortDescription,
    FullDescription: p.fullDescription,
    Weight: p.weight,
    Length: p.length,
    Width: p.width,
    Height: p.height,
  }));

  const ws = xlsx.utils.json_to_sheet(excelData);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Products");

  const fileName = `products_export_${Date.now()}.xlsx`;
  const filePath = path.join("uploads", "exports", fileName);

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  xlsx.writeFile(wb, filePath);

  return { filePath, fileName };
}
