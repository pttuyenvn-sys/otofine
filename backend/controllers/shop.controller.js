// controllers/shop.controller.js
import Shop from "../models/shop.model.js";
import path from "path";
import { uploadToR2 } from "../utils/r2-sdk.js"; // 🔥 THÊM
import { pool } from "../config/db.js";
import { syncProductListViewForShop } from "../services/productListViewSync.service.js";
import { sanitizeShopHtml } from "../domains/shopPublic/utils/htmlSanitize.util.js";
// Bug-fix Phase A.1: legacy /api/shop/me must invalidate the public
// storefront cache the same way /api/shop/public-page already does,
// otherwise a Basic-tab save lags up to 5 min on the storefront.
import { invalidateShop } from "../domains/shopPublic/cache/caches.js";
import { resolveShopZalo } from "../utils/resolveShopZalo.js";

/**
 * Three legacy rich-text fields (`descriptionHtml`, `salePolicy`,
 * `warrantyPolicy`) are rendered with `dangerouslySetInnerHTML` on the
 * marketplace product detail page.  Phase B upgraded the policy
 * inputs from plain textareas to a Tiptap editor that can emit
 * `<img>`, `<iframe>`, etc., so we MUST sanitize on the write side.
 *
 * Returns `null` for empty / whitespace-only / "<p></p>"-only payloads
 * so the column stays NULL instead of "<p></p>". `undefined` inputs
 * (field not present in PATCH) are forwarded as-is so the model's
 * PATCH semantics still skip the column.
 */
function sanitizeRichField(raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const cleaned = sanitizeShopHtml(String(raw));
  if (!cleaned) return null;
  const stripped = cleaned
    .replace(/<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/gi, "")
    .replace(/<br\s*\/?>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .trim();
  return stripped ? cleaned : null;
}

export async function getMyShop(req, res) {
  try {
    const accountId = req.user.id;
    const shop = await Shop.getByAccountId(accountId);

    if (!shop) {
      return res.status(200).json(null);
    }

    // Bug-fix Phase A.1: normalize the legacy response shape so the
    // Basic-tab field on /shop/settings pre-fills with the storefront's
    // resolved value. We DO NOT remove or rename `zalo_phone`; the
    // public-page DTO consumed by the Storefront tab is unchanged.
    // Drift on already-saved rows self-heals on the next legacy save
    // because the mirror also flips `zalo_phone` to match.
    const resolved = resolveShopZalo(shop);
    res.json({
      ...shop,
      zalo: resolved || shop.zalo || null,
      zalo_phone: resolved || shop.zalo_phone || null,
    });
  } catch (err) {
    console.error("getMyShop error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

export async function createShop(req, res) {
  try {
    const accountId = req.user.id;
    const existing = await Shop.getByAccountId(accountId);
    if (existing) return res.status(400).json({ message: "Bạn đã có shop" });

    const data = {
      accountId,
      name: req.body.name,
      phone: req.body.phone,
      email: req.body.email,
      zalo: req.body.zalo,
      website: req.body.website,
      provinceId: req.body.provinceId,
      districtId: req.body.districtId,
      wardId: req.body.wardId,
      addressDetail: req.body.addressDetail,
      descriptionHtml: sanitizeRichField(req.body.descriptionHtml),
      salePolicy:      sanitizeRichField(req.body.salePolicy),
      warrantyPolicy:  sanitizeRichField(req.body.warrantyPolicy),
    };

    // ❗ KHÔNG set avatar/cover ở đây nữa
    const newShop = await Shop.create(data);

    /**
     * =========================
     * AVATAR → R2 (GHI ĐÈ)
     * =========================
     */
    if (req.files?.avatar?.length) {
      const file = req.files.avatar[0];
      const avatarUrl = await uploadToR2(
        file.buffer,
        `shops/${newShop.id}/avatar.png`,
      );
      await Shop.update(newShop.id, { avatar: avatarUrl });
    }

    /**
     * =========================
     * COVER → R2 (GHI ĐÈ)
     * =========================
     */
    if (req.files?.cover?.length) {
      const file = req.files.cover[0];
      const coverUrl = await uploadToR2(
        file.buffer,
        `shops/${newShop.id}/cover.png`,
      );
      await Shop.update(newShop.id, { cover: coverUrl });
    }

    res.json({ message: "Tạo shop thành công", id: newShop.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

export async function updateMyShop(req, res) {
  try {
    const accountId = req.user.id;
    const shop = await Shop.getByAccountId(accountId);
    if (!shop) return res.status(404).json({ message: "Shop không tồn tại" });

    // PATCH-style payload: only forward keys that the client actually
    // sent. The model's `update()` then skips any column not present.
    // This is critical for two flows:
    //   1. ShopSettings no longer sends `descriptionHtml` → column
    //      keeps its existing value (used as fallback by storefront).
    //   2. A future client could PATCH just `salePolicy` without
    //      wiping `name`, `phone`, etc.
    const data = {};
    const PLAIN_FIELDS = [
      "name", "phone", "email", "zalo", "website",
      "provinceId", "districtId", "wardId", "addressDetail",
    ];
    for (const k of PLAIN_FIELDS) {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    }
    if (req.body.descriptionHtml !== undefined) data.descriptionHtml = sanitizeRichField(req.body.descriptionHtml);
    if (req.body.salePolicy      !== undefined) data.salePolicy      = sanitizeRichField(req.body.salePolicy);
    if (req.body.warrantyPolicy  !== undefined) data.warrantyPolicy  = sanitizeRichField(req.body.warrantyPolicy);

    // Bug-fix Phase A.1: bidirectional zalo↔zalo_phone mirror.
    // When the Basic tab on /shop/settings saves `zalo`, also persist
    // the same value into the public-page column. Empty/whitespace
    // collapses to NULL on both sides so a "clear" request still
    // works. Without this mirror, the storefront would keep rendering
    // the stale `zalo_phone` that the public-page tab last wrote.
    if (Object.prototype.hasOwnProperty.call(data, "zalo")) {
      const normalized =
        data.zalo == null || String(data.zalo).trim() === ""
          ? null
          : String(data.zalo).trim();
      data.zalo = normalized;
      data.zalo_phone = normalized;
    }

    /**
     * =========================
     * AVATAR → R2 (GHI ĐÈ)
     * =========================
     */
    if (req.files?.avatar?.length) {
      const file = req.files.avatar[0];
      data.avatar = await uploadToR2(
        file.buffer,
        `shops/${shop.id}/avatar.png`,
      );
    }

    /**
     * =========================
     * COVER → R2 (GHI ĐÈ)
     * =========================
     */
    if (req.files?.cover?.length) {
      const file = req.files.cover[0];
      data.cover = await uploadToR2(file.buffer, `shops/${shop.id}/cover.png`);
    }

    await Shop.update(shop.id, data);
    await syncProductListViewForShop(shop.id).catch(() => { });
    const { queueSearchIndexSyncForShop } = await import("../services/search/searchIndexDispatcher.js");
    queueSearchIndexSyncForShop(shop.id, { source: "shop.update", reason: "location" });
    // Bug-fix Phase A.1: invalidate the storefront cache so the new
    // value surfaces on `<slug>.otofine.com` immediately rather than
    // waiting up to 5 minutes for the existing TTL to lapse. Slug
    // pulled from the freshly-loaded row above; safe no-op when
    // missing.
    if (shop.slug) {
      try { invalidateShop(shop.slug); } catch {}
    }
    res.json({ message: "Cập nhật shop thành công" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi server" });
  }
}

/**
 * Upload ảnh cho editor (CHƯA ĐỤNG – vẫn dùng local nếu bạn muốn)
 * Khi cần → tôi chuyển sang R2 cho bạn
 */
export async function uploadEditorImage(req, res) {
  try {
    if (!req.file) return res.status(400).json({ message: "Không có file" });
    const url = `/uploads/shops/${req.file.filename}`;
    res.json({ location: url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi upload" });
  }
}

export async function getProvinces(req, res) {
  const [rows] = await pool.query(`
    SELECT MIN(id) as id, tinh_tp
    FROM address
    GROUP BY tinh_tp
    ORDER BY tinh_tp
  `);

  res.json(rows);
}

export async function getWards(req, res) {
  const { tinh_tp } = req.query;

  const [rows] = await pool.query(
    `
    SELECT id, phuong_xa
    FROM address
    WHERE tinh_tp = ?
    ORDER BY phuong_xa
  `,
    [tinh_tp],
  );

  res.json(rows);
}
