import {
  checkSlugAvailability,
  getMyPublicPage,
  saveAvatar,
  saveCover,
  updateMyPublicPage,
} from "../services/sellerPublicPage.service.js";
import { uploadToR2 } from "../../../utils/r2-sdk.js";
import { invalidateShop } from "../cache/caches.js";
import {
  optimizeAvatar,
  optimizeContent,
  optimizeCover,
} from "../utils/imageOptimize.util.js";
import crypto from "node:crypto";
import { shopsiteLog } from "../observability/logger.js";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

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
      const slugErr = (result.errors || []).find((e) => e.field === "slug");
      if (slugErr) {
        shopsiteLog.warn("seller.slug-collision", {
          shopId: req.shop.id,
          code: slugErr.code,
        });
      }
      return res.status(400).json({ ok: false, errors: result.errors });
    }

    const slug = result.data?.slug;
    if (slug) {
      const inv = invalidateShop(slug);
      shopsiteLog.info("seller.publish-toggle", {
        shopId: req.shop.id,
        slug,
        status: result.data?.publicStatus,
        invalidated_api_entries: inv.apiEntries,
      });
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

/**
 * POST /api/shop/public-page/upload-avatar
 *
 * Pipeline: multer (already enforced size + mime allow-list) →
 * `validateUploadFile` (re-check at handler layer) → `optimizeAvatar`
 * (re-decode + 512² webp + strip EXIF; rejects non-images) → R2 →
 * DB save → cache invalidation.
 */
export async function handleUploadAvatar(req, res) {
  const t = Date.now();
  try {
    const file = req.file;
    const v = validateUploadFile(file);
    if (!v.ok) return res.status(v.status).json({ ok: false, error: v.error });

    const baseKey = `shop-public/avatar/${req.shop.id}.webp`;
    let optimized;
    try {
      optimized = await optimizeAvatar(file.buffer, baseKey);
    } catch (err) {
      shopsiteLog.warn("upload.decode-failed", {
        shopId: req.shop.id,
        kind: "avatar",
        bytes_in: file.size,
        msg: err.message || "decode err",
      });
      return res.status(err.status || 400).json({ ok: false, error: err.message || "Ảnh không hợp lệ" });
    }
    const url = await uploadToR2(optimized.buffer, optimized.key, optimized.contentType);
    const fresh = await saveAvatar(req.shop.id, url);
    const inv = invalidateShop(fresh.slug);
    shopsiteLog.info("upload.ok", {
      shopId: req.shop.id,
      slug: fresh.slug,
      kind: "avatar",
      bytes_in: optimized.bytesIn,
      bytes_out: optimized.bytesOut,
      saved_pct: pctSaved(optimized.bytesIn, optimized.bytesOut),
      dur_ms: Date.now() - t,
      invalidated_api_entries: inv.apiEntries,
    });
    res.json({ ok: true, avatar: fresh.avatar });
  } catch (err) {
    shopsiteLog.error("upload.fail", {
      shopId: req.shop?.id,
      kind: "avatar",
      msg: err?.message || "err",
      dur_ms: Date.now() - t,
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

/** POST /api/shop/public-page/upload-cover */
export async function handleUploadCover(req, res) {
  const t = Date.now();
  try {
    const file = req.file;
    const v = validateUploadFile(file);
    if (!v.ok) return res.status(v.status).json({ ok: false, error: v.error });

    const baseKey = `shop-public/cover/${req.shop.id}.webp`;
    let optimized;
    try {
      optimized = await optimizeCover(file.buffer, baseKey);
    } catch (err) {
      shopsiteLog.warn("upload.decode-failed", {
        shopId: req.shop.id,
        kind: "cover",
        bytes_in: file.size,
        msg: err.message || "decode err",
      });
      return res.status(err.status || 400).json({ ok: false, error: err.message || "Ảnh không hợp lệ" });
    }
    const url = await uploadToR2(optimized.buffer, optimized.key, optimized.contentType);
    const fresh = await saveCover(req.shop.id, url);
    const inv = invalidateShop(fresh.slug);
    shopsiteLog.info("upload.ok", {
      shopId: req.shop.id,
      slug: fresh.slug,
      kind: "cover",
      bytes_in: optimized.bytesIn,
      bytes_out: optimized.bytesOut,
      saved_pct: pctSaved(optimized.bytesIn, optimized.bytesOut),
      dur_ms: Date.now() - t,
      invalidated_api_entries: inv.apiEntries,
    });
    res.json({ ok: true, coverImage: fresh.coverImage });
  } catch (err) {
    shopsiteLog.error("upload.fail", {
      shopId: req.shop?.id,
      kind: "cover",
      msg: err?.message || "err",
      dur_ms: Date.now() - t,
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/shop/public-page/upload-content
 *
 * Inline image used inside the rich-text storefront editor.
 * Unlike avatar/cover, each upload is its own object (the editor can
 * insert many images), so the key carries a random suffix.
 *
 * Response shape is shaped for the Tiptap image extension:
 *   { ok: true, url, width, height }
 */
export async function handleUploadContent(req, res) {
  const t = Date.now();
  try {
    const file = req.file;
    const v = validateUploadFile(file);
    if (!v.ok) return res.status(v.status).json({ ok: false, error: v.error });

    const rand = crypto.randomBytes(8).toString("hex");
    const baseKey = `shop-public/content/${req.shop.id}-${rand}.webp`;
    let optimized;
    try {
      optimized = await optimizeContent(file.buffer, baseKey);
    } catch (err) {
      shopsiteLog.warn("upload.decode-failed", {
        shopId: req.shop.id,
        kind: "content",
        bytes_in: file.size,
        msg: err.message || "decode err",
      });
      return res.status(err.status || 400).json({ ok: false, error: err.message || "Ảnh không hợp lệ" });
    }
    const url = await uploadToR2(optimized.buffer, optimized.key, optimized.contentType);
    shopsiteLog.info("upload.ok", {
      shopId: req.shop.id,
      kind: "content",
      bytes_in: optimized.bytesIn,
      bytes_out: optimized.bytesOut,
      saved_pct: pctSaved(optimized.bytesIn, optimized.bytesOut),
      width: optimized.width,
      height: optimized.height,
      dur_ms: Date.now() - t,
    });
    res.json({
      ok: true,
      url,
      width: optimized.width,
      height: optimized.height,
    });
  } catch (err) {
    shopsiteLog.error("upload.fail", {
      shopId: req.shop?.id,
      kind: "content",
      msg: err?.message || "err",
      dur_ms: Date.now() - t,
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

function pctSaved(bytesIn, bytesOut) {
  if (!bytesIn || !bytesOut) return 0;
  return Math.max(0, Math.round((1 - bytesOut / bytesIn) * 100));
}
