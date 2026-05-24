import path from "path";
import {
  checkSlugAvailability,
  getMyPublicPage,
  saveAvatar,
  saveCover,
  updateMyPublicPage,
} from "../services/sellerPublicPage.service.js";
import { uploadToR2 } from "../../../utils/r2-sdk.js";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

function extFromMime(mime) {
  switch (mime) {
    case "image/png": return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

/** GET /api/shop/public-page */
export async function handleGetMyPublicPage(req, res) {
  try {
    const dto = await getMyPublicPage(req.shop.id);
    if (!dto) return res.status(404).json({ error: "Shop không tồn tại" });
    res.json(dto);
  } catch (err) {
    console.error("[sellerPublicPage] get error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/** PUT /api/shop/public-page */
export async function handleUpdateMyPublicPage(req, res) {
  try {
    const result = await updateMyPublicPage(req.shop.id, req.body || {});
    if (!result.ok) {
      return res.status(400).json({ ok: false, errors: result.errors });
    }
    res.json(result);
  } catch (err) {
    console.error("[sellerPublicPage] update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/** GET /api/shop/public-page/check-slug?slug=... */
export async function handleCheckSlug(req, res) {
  try {
    const slug = String(req.query.slug ?? "").trim();
    const result = await checkSlugAvailability(req.shop.id, slug);
    res.json(result);
  } catch (err) {
    console.error("[sellerPublicPage] check-slug error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

function validateUploadFile(file) {
  if (!file) return { ok: false, status: 400, error: "Thiếu file ảnh" };
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return {
      ok: false,
      status: 400,
      error: "Định dạng ảnh không hợp lệ. Chỉ chấp nhận PNG, JPG, WEBP.",
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "Ảnh quá lớn. Tối đa 5MB.",
    };
  }
  return { ok: true };
}

/** POST /api/shop/public-page/upload-avatar */
export async function handleUploadAvatar(req, res) {
  try {
    const file = req.file;
    const v = validateUploadFile(file);
    if (!v.ok) return res.status(v.status).json({ ok: false, error: v.error });

    const ext = extFromMime(file.mimetype);
    const key = `shop-public/avatar/${req.shop.id}.${ext}`;
    const url = await uploadToR2(file.buffer, key);
    const fresh = await saveAvatar(req.shop.id, url);
    res.json({ ok: true, avatar: fresh.avatar });
  } catch (err) {
    console.error("[sellerPublicPage] upload-avatar error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}

/** POST /api/shop/public-page/upload-cover */
export async function handleUploadCover(req, res) {
  try {
    const file = req.file;
    const v = validateUploadFile(file);
    if (!v.ok) return res.status(v.status).json({ ok: false, error: v.error });

    const ext = extFromMime(file.mimetype);
    const key = `shop-public/cover/${req.shop.id}.${ext}`;
    const url = await uploadToR2(file.buffer, key);
    const fresh = await saveCover(req.shop.id, url);
    res.json({ ok: true, coverImage: fresh.coverImage });
  } catch (err) {
    console.error("[sellerPublicPage] upload-cover error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
