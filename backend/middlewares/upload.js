// middlewares/upload.js
import multer from "multer";
import { S3Client } from "@aws-sdk/client-s3";
import multerS3 from "multer-s3";

// ===== CONFIG R2 =====
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_KEY_ID,
    secretAccessKey: process.env.R2_SECRET,
  },
});

// ===== UPLOAD PRODUCT (KHÔNG RAM) =====
export const upload = multer({
  storage: multerS3({
    s3,
    bucket: "otofine-images",

    contentType: multerS3.AUTO_CONTENT_TYPE,

    key: (req, file, cb) => {
      try {
        const shopId = req.shop.id;
        const partNumber = req.body.partNumber?.toUpperCase() || "unknown";

        if (!req.imageIndex) req.imageIndex = 0;
        req.imageIndex++;

        let fileName;

        if (req.imageIndex === 1) {
          fileName = `${partNumber}.webp`;
        } else {
          fileName = `${partNumber}_${req.imageIndex - 1}.webp`;
        }

        const fullPath = `shops/${shopId}/${fileName}`;

        cb(null, fullPath);
      } catch (err) {
        cb(err);
      }
    },
  }),
});

// ===== GIỮ NGUYÊN CHO MODULE KHÁC =====
const memoryStorage = multer.memoryStorage();

export const uploadShop = multer({ storage: memoryStorage });
export const uploadImages = multer({ storage: memoryStorage });

export const uploadProductMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
