import multer from "multer";
import { rfqUploadMaxBytes } from "../../../config/rfq.config.js";

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const rfqUploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: rfqUploadMaxBytes },
  fileFilter(req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error("INVALID_MIME"), { status: 400 }), false);
  },
});

/** Capture multer LIMIT_FILE_SIZE / fileFilter errors into HTTP JSON */
import { sendHttpError } from "../utils/httpError.js";

export function rfqMulterSingle(fieldName) {
  return function rfqMulterSingleMw(req, res, next) {
    rfqUploadMemory.single(fieldName)(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") {
        Object.assign(err, { message: "UPLOAD_TOO_LARGE", status: 400 });
      } else if (err.message === "INVALID_MIME" || err.message?.includes("INVALID_MIME")) {
        Object.assign(err, { status: 400 });
      } else if (!err.status) Object.assign(err, { status: 400, message: err.message || "UPLOAD_REJECTED" });
      sendHttpError(res, err);
    });
  };
}
