import xlsx from "xlsx";
import { pool } from "../config/db.js";
import { syncProductImages } from "./productImage.service.js";
import {
  assertExactlyOnePrimaryFitment,
} from "../modules/products/services/productFitmentPrimary.server.js";

function normalizeText(str = "") {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function cleanModelName(str = "") {
  str = normalizeText(str);

  return str
    .replace(/\b\d{4}\b/g, "") // bỏ năm 2015
    .replace(/\bnew\b/g, "")
    .replace(/\ball new\b/g, "")
    .replace(/\bfacelift\b/g, "")
    .replace(/\bslx\b/g, "")
    .replace(/\bmt\b/g, "")
    .replace(/\bat\b/g, "")
    .replace(/\b1\.4\b/g, "")
    .replace(/\b1\.6\b/g, "")
    .replace(/\b2\.0\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function similarity(a, b) {
  a = cleanModelName(a);
  b = cleanModelName(b);

  if (a === b) return 1;

  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

export async function importProductsFromExcel(shopId, filePath) {
  console.log("🚀 IMPORT VERSION NEW RUNNING");
  const wb = xlsx.readFile(filePath);

  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error("Không tìm thấy sheet");

  const rawRows = xlsx.utils.sheet_to_json(sheet);

  const rows = rawRows.map((row) => {
    const newRow = {};
    Object.keys(row).forEach((key) => {
      newRow[key.trim()] = row[key];
    });
    return newRow;
  });

  const clean = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };

  const num = (v) => {
    if (v === undefined || v === null || v === "") return 0;
    return Number(v) || 0;
  };

  const intOrNull = (v) => {
    if (v === undefined || v === null || v === "") return null;

    const n = parseInt(v, 10);

    return Number.isNaN(n) ? null : n;
  };

  const conn = await pool.getConnection();
  let i = 0;
  const errors = [];
  try {
    await conn.beginTransaction();

    const processedProducts = new Set();
    const primaryAssigned = new Set();

    for (i = 0; i < rows.length; i++) {
      const r = rows[i];

      if (!r.PartNumber) {
        errors.push(`Dòng ${i + 2}: Thiếu PartNumber`);
        continue;
      }

      let productId;
      let carId = null;

      if (clean(r.hang_xe)) {
        const [cars] = await conn.query(
          `
          SELECT id, hang_xe, ten_xe
          FROM car_models
          WHERE LOWER(hang_xe)=LOWER(?)
          `,
          [clean(r.hang_xe)],
        );

        if (!cars.length) {
          errors.push(
            `Dòng ${i + 2}: Hãng xe "${clean(r.hang_xe)}" chưa tồn tại hệ thống.`,
          );
          continue;
        }

        // Nếu có tên xe -> fuzzy match như cũ
        if (clean(r.ten_xe)) {
          let bestCar = null;
          let bestScore = 0;

          for (const item of cars) {
            const score = similarity(r.ten_xe, item.ten_xe);

            if (score > bestScore) {
              bestScore = score;
              bestCar = item;
            }
          }

          if (bestCar && bestScore >= 0.65) {
            carId = bestCar.id;
          } else {
            errors.push(
              `Dòng ${i + 2}: Hãng xe "${clean(r.hang_xe)}" - mẫu xe "${clean(r.ten_xe)}" chưa tồn tại hệ thống.`,
            );
            continue;
          }
        } else {
          const [brandRows] = await conn.query(
            `
          SELECT id
          FROM car_models
          WHERE LOWER(hang_xe)=LOWER(?)
            AND (ten_xe='' OR ten_xe IS NULL)
          LIMIT 1
          `,
            [clean(r.hang_xe)],
          );

          if (brandRows.length) {
            carId = brandRows[0].id;
          } else {
            carId = null;
          }
        }
      }

      // ===== PRODUCT =====
      const [pRows] = await conn.query(
        `SELECT id FROM products WHERE shopId=? AND partNumber=?`,
        [shopId, r.PartNumber],
      );

      if (pRows.length) {
        productId = pRows[0].id;

        await conn.query(
          `
          UPDATE products SET
            partName=?,
            stock=?,
            price=?,
            origin=?,
            shortDescription=?,
            description=?,
            weight=?,
            length=?,
            width=?,
            height=?
          WHERE id=? AND shopId=?
          `,
          [
            clean(r.PartName),
            num(r.Stock),
            num(r.Price),
            clean(r.Origin),
            clean(r.ShortDescription),
            clean(r.FullDescription),
            num(r.Weight),
            num(r.Length),
            num(r.Width),
            num(r.Height),
            productId,
            shopId,
          ],
        );
      } else {
        const [rs] = await conn.query(
          `
          INSERT INTO products
          (shopId, partNumber, partName, stock, price, origin,
           shortDescription, description, weight, length, width, height)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
            shopId,
            r.PartNumber,
            clean(r.PartName),
            num(r.Stock),
            num(r.Price),
            clean(r.Origin),
            clean(r.ShortDescription),
            clean(r.FullDescription),
            num(r.Weight),
            num(r.Length),
            num(r.Width),
            num(r.Height),
          ],
        );

        productId = rs.insertId;
      }

      if (carId) {
        if (!processedProducts.has(productId)) {
          await conn.query(
            `DELETE FROM product_car_applications WHERE productId=?`,
            [productId],
          );
          processedProducts.add(productId);
        }

        let yearFrom = intOrNull(r.year_from);
        let yearTo = intOrNull(r.year_to);

        /* Có 1 bên -> copy sang bên kia */
        if (yearFrom !== null && yearTo === null) {
          yearTo = yearFrom;
        }

        if (yearFrom === null && yearTo !== null) {
          yearFrom = yearTo;
        }

        /* Cả 2 trống -> giữ null */
        if (yearFrom === null && yearTo === null) {
          yearFrom = null;
          yearTo = null;
        }

        /* Nếu nhập ngược */
        if (yearFrom !== null && yearTo !== null && yearFrom > yearTo) {
          [yearFrom, yearTo] = [yearTo, yearFrom];
        }

        await conn.query(
          `INSERT INTO product_car_applications
          (productId, carModelId, year_from, year_to, is_primary)
          VALUES (?, ?, ?, ?, ?)`,
          [
            productId,
            carId,
            yearFrom,
            yearTo,
            primaryAssigned.has(productId) ? 0 : 1,
          ],
        );
        primaryAssigned.add(productId);
      }
    }

    for (const pid of processedProducts) {
      await assertExactlyOnePrimaryFitment(conn, pid);
    }

    await conn.commit();

    const updated = await syncProductImages(shopId);
    console.log("SYNC DONE:", updated);

    if (errors.length > 0) {
      return {
        success: true,
        partial: true,
        message: errors.join("\n"),
      };
    }

    return {
      success: true,
      partial: false,
    };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {}

    console.error("IMPORT ERROR:", e);

    throw new Error(e.message);
  } finally {
    conn.release();
  }
}
