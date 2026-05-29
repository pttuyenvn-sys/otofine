import sharp from "sharp";
import path from "path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { r2 } from "../config/r2.js";
import { pool } from "../config/db.js";

const BUCKET = process.env.R2_BUCKET;
const logoPath = path.resolve("assets/logo.png");
const patternPath = path.resolve("assets/otofine-logo.png");

const buildSmartImageKey = (files, shopId, partNumber, index) => {
  // Defensive: callers may pass undefined when only processing a single file.
  const fileList = Array.isArray(files) ? files : [];
  const numIndex = Number(index || 0);

  const sameFiles = fileList
    .map((f) => path.parse(f.originalname).name.trim().toUpperCase())
    .filter(
      (name) =>
        name === partNumber ||
        name.startsWith(partNumber + "-") ||
        name.startsWith(partNumber + "_"),
    );

  const hasMain = sameFiles.includes(partNumber);

  const indexes = sameFiles
    .map((name) => {
      const match = name.match(/[-_](\d+)$/);
      return match ? Number(match[1]) : null;
    })
    .filter((x) => x !== null);

  const minIndex = indexes.length ? Math.min(...indexes) : null;

  // TH1 Có ảnh gốc
  if (hasMain) {
    if (index === "") {
      return `shops/${shopId}/${partNumber}.webp`;
    }
    return `shops/${shopId}/${partNumber}_${numIndex}.webp`;
  }

  // TH2 + TH3 không có ảnh gốc
  if (numIndex === minIndex) {
    return `shops/${shopId}/${partNumber}.webp`;
  }

  return `shops/${shopId}/${partNumber}_${numIndex}.webp`;
};

/**
 * IMPORT ẢNH THEO partNumber
 * Tên file: shopId/partNumber/{index}.jpg
 */
export const importImagesByCode = async (files, shopId) => {
  let imported = 0;
  const uploadedFiles = [];

  for (const file of files) {
    // ✅ BƯỚC 1: LỌC FILE NGAY TỪ ĐẦU
    const ext = path.extname(file.originalname).toLowerCase();

    const allowedExt = [
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif",
      ".bmp",
      ".tiff",
      ".heic",
    ];

    if (!allowedExt.includes(ext)) {
      console.log("Bỏ qua file không hợp lệ:", file.originalname);
      continue;
    }

    // 👉 Sau đó mới xử lý tiếp
    const originalName = path.parse(file.originalname).name;

    let shopIdFromFile = shopId; // luôn dùng shopId truyền vào
    let partNumber = "";
    let index = "";

    // có dấu "-" (1780122020-1)
    if (originalName.includes("-")) {
      const parts = originalName.split("-");
      partNumber = parts[0];
      index = parts[1] || "";
    }

    // có dấu "_" (1780122020_1)
    else if (originalName.includes("_")) {
      const parts = originalName.split("_");
      partNumber = parts[0];
      index = parts[1] || "";
    }

    // chỉ có mã (1780122020)
    else {
      partNumber = originalName;
    }

    // normalize
    partNumber = partNumber.trim().toUpperCase();

    const numIndex = Number(index || 0);

    // file chính nếu:
    // aaa.jpg
    // aaa_1.jpg
    // aaa-1.jpg
    const isPrimary = index === "" || numIndex === 1 ? 1 : 0;

    let key;

    // aaa.jpg
    if (index === "") {
      key = `shops/${shopIdFromFile}/${partNumber}.webp`;
    }

    // aaa_1.jpg => aaa.webp
    else if (numIndex === 1) {
      key = `shops/${shopIdFromFile}/${partNumber}.webp`;
    }

    // aaa_2.jpg aaa_3.jpg...
    else {
      key = `shops/${shopIdFromFile}/${partNumber}_${numIndex}.webp`;
    }

    /* ===============================
       1️⃣ Resize thông minh
    =============================== */
    if (!file || !file.buffer || file.buffer.length === 0) {
      console.log("❌ File lỗi:", file?.originalname);
      return null;
    }

    const allowedMime = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/jpg",
      "image/gif",
      "image/bmp",
      "image/tiff",
      "image/heic",
      "image/heif",
    ];

    if (!allowedMime.includes(file.mimetype)) {
      console.log("❌ Không phải ảnh:", file.originalname, file.mimetype);
      return null;
    }

    let baseImage;

    try {
      baseImage = sharp(file.buffer);
    } catch (err) {
      console.log("❌ Sharp lỗi:", file.originalname);
      return null;
    }
    const meta = await baseImage.metadata();

    let imageProcessor;

    // chỉ resize khi ảnh quá lớn
    if (meta.width > 2000) {
      imageProcessor = baseImage.resize({
        width: 2000,
        withoutEnlargement: true,
      });
    } else {
      imageProcessor = baseImage;
    }

    const resizedMeta = await imageProcessor.metadata();

    /* ===============================
       2️⃣ TẠO PATTERN CHÌM TOÀN ẢNH
    =============================== */

    const svgPattern = `
    <svg width="${resizedMeta.width}" height="${resizedMeta.height}">
      <defs>
        <pattern id="p" patternUnits="userSpaceOnUse" width="420" height="260">

          <text x="0" y="150"
            fill="rgba(255,255,255,0.05)"
            font-size="72"
            font-family="Arial"
            font-weight="700"
            transform="rotate(-30 210 130)">
            otofine.com
          </text>

          <text x="2" y="152"
            fill="rgba(0,0,0,0.05)"
            font-size="72"
            font-family="Arial"
            font-weight="700"
            transform="rotate(-30 210 130)">
            otofine.com
          </text>

          <text x="0" y="150"
            fill="rgba(255,255,255,0.05)"
            stroke="rgba(0,0,0,0.15)"
            stroke-width="1"
            font-size="72"
            font-family="Arial"
            font-weight="700"
            transform="rotate(-30 210 130)">
            otofine.com
          </text>

        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#p)" />
    </svg>
    `;

    const patternBuffer = Buffer.from(svgPattern);

    /* ===============================
       3️⃣ TẠO LOGO GÓC PHẢI
    =============================== */
    const logoWidth = Math.floor(resizedMeta.width * 0.13);

    const logoBuffer = await sharp(logoPath)
      .resize({ width: logoWidth })
      .ensureAlpha(0.22) // tăng opacity để thấy trên nền trắng
      .png()
      .toBuffer();

    /* ===============================
       4️⃣ GHÉP WATERMARK 2 LỚP
    =============================== */
    let finalBuffer;

    // nếu ảnh > 500KB thì nén dần xuống <=500KB
    if (file.size > 500 * 1024) {
      let quality = 90;

      while (quality >= 40) {
        finalBuffer = await imageProcessor
          .composite([
            {
              input: patternBuffer,
              blend: "over",
            },
            {
              input: logoBuffer,
              gravity: "southwest",
              blend: "over",
            },
          ])
          .webp({ quality })
          .toBuffer();

        if (finalBuffer.length <= 500 * 1024) break;

        quality -= 5;
      }
    } else {
      // ảnh nhỏ hơn 500KB thì giữ nguyên chất lượng
      finalBuffer = await imageProcessor
        .composite([
          {
            input: patternBuffer,
            blend: "over",
          },
          {
            input: logoBuffer,
            gravity: "southwest",
            blend: "over",
          },
        ])
        .webp({ quality: 95 })
        .toBuffer();
    }

    /* ===============================
       5️⃣ Upload R2
    =============================== */

    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: finalBuffer,
        ContentType: "image/webp",
      }),
    );

    const url = `${process.env.R2_PUBLIC_URL}/${key}`;

    /* ===============================
       6️⃣ TÌM PRODUCT
    =============================== */

    const [rows] = await pool.query(
      "SELECT id FROM products WHERE partNumber = ? AND shopId = ?",
      [partNumber, shopIdFromFile],
    );

    const productId = rows.length ? rows[0].id : null;

    /* ===============================
       7️⃣ INSERT DATABASE
    =============================== */
    const [existRows] = await pool.query(
      `SELECT id FROM product_images
      WHERE shopId = ? AND partNumber = ? AND url = ?`,
      [shopIdFromFile, partNumber, url],
    );

    // nếu đã có ảnh giống → xoá file cũ trên R2
    if (existRows.length) {
      const oldUrl = existRows[0].url;

      if (oldUrl) {
        const oldKey = oldUrl.replace(process.env.R2_PUBLIC_URL + "/", "");

        // tránh xoá chính file vừa upload
        if (oldKey !== key) {
          await r2.send(
            new DeleteObjectCommand({
              Bucket: BUCKET,
              Key: oldKey,
            }),
          );
        }
      }
    }

    // insert hoặc update DB
    await pool.query(
      `INSERT INTO product_images
      (shopId, productId, partNumber, url, isPrimary)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        productId = VALUES(productId),
        isPrimary = VALUES(isPrimary)`,
      [shopIdFromFile, productId, partNumber, url, isPrimary],
    );

    imported++;
    uploadedFiles.push(key);
  }

  return { imported, uploadedFiles };
};

export const processSingleImage = async ({
  file,
  files,
  shopId,
  partNumber,
  index = "",
}) => {
  const ext = path.extname(file.originalname).toLowerCase();

  const allowedExt = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".bmp",
    ".tiff",
    ".heic",
  ];

  if (!allowedExt.includes(ext)) return null;

  partNumber = partNumber.trim().toUpperCase();

  const numIndex = Number(index || 0);

  const key = buildSmartImageKey(files, shopId, partNumber, index);

  const isPrimary = key.endsWith(`/${partNumber}.webp`) ? 1 : 0;

  // ===== COPY LOGIC SHARP =====
  if (!file || !file.buffer || file.buffer.length === 0) {
    console.log("❌ File lỗi:", file?.originalname);
    return null;
  }

  const allowedMime = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
    "image/gif",
    "image/bmp",
    "image/tiff",
    "image/heic",
    "image/heif",
  ];

  if (!allowedMime.includes(file.mimetype)) {
    console.log("❌ Không phải ảnh:", file.originalname, file.mimetype);
    return null;
  }

  let baseImage;

  try {
    baseImage = sharp(file.buffer);
  } catch (err) {
    console.log("❌ Sharp lỗi:", file.originalname);
    return null;
  }
  const meta = await baseImage.metadata();

  let imageProcessor;

  if (meta.width > 2000) {
    imageProcessor = baseImage.resize({
      width: 2000,
      withoutEnlargement: true,
    });
  } else {
    imageProcessor = baseImage;
  }

  const resizedMeta = await imageProcessor.metadata();

  const svgPattern = `
  <svg width="${resizedMeta.width}" height="${resizedMeta.height}">
    <defs>
      <pattern id="p" patternUnits="userSpaceOnUse" width="420" height="260">

        <text x="0" y="150"
          fill="rgba(255,255,255,0.04)"
          font-size="72"
          font-family="Arial"
          font-weight="700"
          transform="rotate(-30 210 130)">
          otofine.com
        </text>

        <text x="2" y="152"
          fill="rgba(0,0,0,0.05)"
          font-size="72"
          font-family="Arial"
          font-weight="700"
          transform="rotate(-30 210 130)">
          otofine.com
        </text>

        <text x="0" y="150"
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(0,0,0,0.15)"
          stroke-width="1"
          font-size="72"
          font-family="Arial"
          font-weight="700"
          transform="rotate(-30 210 130)">
          otofine.com
        </text>

      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#p)" />
  </svg>
  `;

  const patternBuffer = Buffer.from(svgPattern);

  const logoWidth = Math.floor(resizedMeta.width * 0.13);

  const logoBuffer = await sharp(logoPath)
    .resize({ width: logoWidth })
    .ensureAlpha(0.22)
    .png()
    .toBuffer();

  const finalBuffer = await imageProcessor
    .composite([
      { input: patternBuffer, blend: "over" },
      { input: logoBuffer, gravity: "southwest", blend: "over" },
    ])
    .webp({ quality: 90 })
    .toBuffer();

  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: finalBuffer,
      ContentType: "image/webp",
    }),
  );

  const url = `${process.env.R2_PUBLIC_URL}/${key}`;

  return { url, isPrimary };
};

/**
 * UPLOAD ẢNH CHO 1 SẢN PHẨM (DÙNG CHO CONTROLLER CŨ)
 */
export async function uploadProductImages({
  shopId,
  productId,
  partNumber,
  files,
}) {
  if (!files || !files.length) return;

  // đếm ảnh hiện có
  const [[{ total }]] = await pool.query(
    "SELECT COUNT(*) AS total FROM product_images WHERE productId = ?",
    [productId],
  );

  let index = total;

  await pool.query(
    "DELETE FROM product_images WHERE shopId = ? AND partNumber = ?",
    [shopId, partNumber],
  );

  for (const file of files) {
    index++;

    const ext = path.extname(file.originalname) || ".jpg";
    const key = `${shopId}/${partNumber}/${index}${ext}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const url = `${process.env.R2_PUBLIC_URL}/${key}`;

    await pool.query(
      `
      INSERT INTO product_images
      (shopId, productId, partNumber, url, isPrimary)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        productId = VALUES(productId),
        isPrimary = VALUES(isPrimary)
      `,
      [shopId, productId, partNumber, url, index === 0 ? 1 : 0],
    );
  }
}

export const importImagesBatch = async (files, shopId) => {
  let imported = 0;
  const uploadedFiles = [];

  for (const file of files) {
    const originalName = path.parse(file.originalname).name.trim();

    let partNumber = "";
    let index = "";

    if (originalName.includes("-")) {
      const arr = originalName.split("-");
      partNumber = arr[0];
      index = arr[1] || "";
    } else if (originalName.includes("_")) {
      const arr = originalName.split("_");
      partNumber = arr[0];
      index = arr[1] || "";
    } else {
      partNumber = originalName;
    }

    const result = await processSingleImage({
      file,
      files,
      shopId,
      partNumber,
      index,
    });

    if (!result) continue;

    const [rows] = await pool.query(
      `SELECT id FROM products WHERE shopId=? AND partNumber=? LIMIT 1`,
      [shopId, partNumber],
    );

    const productId = rows.length ? rows[0].id : null;

    await pool.query(
      `INSERT INTO product_images
      (shopId, productId, partNumber, url, isPrimary)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        productId = VALUES(productId),
        isPrimary = VALUES(isPrimary)`,
      [shopId, productId, partNumber, result.url, result.isPrimary],
    );

    imported++;
    uploadedFiles.push(result.url);
  }

  return { imported, uploadedFiles };
};

export async function uploadImagesForNewProduct({
  shopId,
  partNumber,
  productId,
  files,
}) {
  if (!files || !files.length) return;

  // 🔥 XÓA ẢNH CŨ
  await pool.query(
    "DELETE FROM product_images WHERE shopId = ? AND partNumber = ?",
    [shopId, partNumber],
  );

  let index = 0;

  for (const file of files) {
    const fileName =
      index === 0 ? `${partNumber}.webp` : `${partNumber}_${index}.webp`;

    const key = `shops/${shopId}/${fileName}`;

    const buffer = await sharp(file.buffer).webp({ quality: 90 }).toBuffer();

    await r2.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: "image/webp",
      }),
    );

    const url = `${process.env.R2_PUBLIC_URL}/${key}`;

    await pool.query(
      `
      INSERT INTO product_images
      (shopId, productId, partNumber, url, isPrimary)
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        productId = VALUES(productId),
        isPrimary = VALUES(isPrimary)
      `,
      [shopId, productId, partNumber, url, index === 0 ? 1 : 0],
    );

    index++;
  }
}

export const syncProductImages = async (shopId) => {
  const [result] = await pool.query(
    `
    UPDATE product_images pi
    JOIN products p
      ON p.partNumber = pi.partNumber
      AND p.shopId = pi.shopId
    SET pi.productId = p.id
    WHERE pi.productId IS NULL
    AND pi.shopId = ?
  `,
    [shopId],
  );

  console.log("SYNC IMAGES UPDATED:", result.affectedRows);

  return result.affectedRows;
};
