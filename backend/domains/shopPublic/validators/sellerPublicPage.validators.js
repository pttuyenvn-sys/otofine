import { isValidShopSlug, normalizeSlugParam } from "../utils/slug.util.js";
import { RESERVED_SHOP_SLUGS } from "../config/publicShop.config.js";
import { sanitizeShopHtml } from "../utils/htmlSanitize.util.js";

const MAX_BIO_LEN = 255;
const MAX_INTRO_LEN = 50_000; // pre-sanitize cap; sanitizer may shrink further
const MAX_TEXT_LEN = 500;
const MAX_URL_LEN = 500;

/** Public statuses exposed in the seller API. Stored value is the same. */
const PUBLIC_STATUSES = new Set(["draft", "public", "suspended"]);

/**
 * Translate the seller-facing status to the DB enum. The DB still keeps
 * the original `pending` ENUM value from migration 038, so we map
 * draft → pending without an enum migration.
 */
export function toDbStatus(status) {
  if (!status) return null;
  const s = String(status).toLowerCase().trim();
  if (s === "draft") return "pending";
  if (s === "public" || s === "suspended") return s;
  return null;
}

/** Inverse: DB enum → seller-facing status. */
export function fromDbStatus(dbStatus) {
  if (!dbStatus) return "draft";
  const s = String(dbStatus).toLowerCase();
  if (s === "pending") return "draft";
  return s; // "public" or "suspended"
}

function trimMax(value, max) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function safeUrl(value, max = MAX_URL_LEN) {
  const s = trimMax(value, max);
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  return s;
}

/**
 * Validate a seller-supplied slug for the PUT endpoint.
 * Returns { ok: true, slug } or { ok: false, error, code }.
 */
export function validateSlugForUpdate(rawSlug, currentShopId, ownerOfSlug) {
  const slug = normalizeSlugParam(rawSlug);
  if (!slug) {
    return { ok: false, code: "EMPTY", error: "Slug không được để trống" };
  }
  if (RESERVED_SHOP_SLUGS.has(slug)) {
    return { ok: false, code: "RESERVED", error: "Slug này đã được hệ thống dành riêng" };
  }
  if (!isValidShopSlug(slug)) {
    return {
      ok: false,
      code: "INVALID",
      error: "Slug chỉ chấp nhận chữ thường, số và dấu gạch (3-40 ký tự)",
    };
  }
  if (ownerOfSlug != null && ownerOfSlug !== currentShopId) {
    return { ok: false, code: "TAKEN", error: "Slug này đã được shop khác sử dụng" };
  }
  return { ok: true, slug };
}

/**
 * Validate + sanitize the PUT body. Each field is independently
 * coerced; unknown fields are silently dropped (whitelist).
 *
 * Returns the projected `data` payload for the repository update.
 * `errors` is non-empty if validation failed.
 */
export function buildUpdatePayload(body) {
  const errors = [];
  const data = {};

  if (Object.prototype.hasOwnProperty.call(body, "slug")) {
    data._slugCandidate = normalizeSlugParam(body.slug);
  }

  if (Object.prototype.hasOwnProperty.call(body, "public_status")) {
    const mapped = toDbStatus(body.public_status);
    if (!mapped) errors.push({ field: "public_status", message: "Trạng thái không hợp lệ" });
    else data.public_status = mapped;
  }

  if (Object.prototype.hasOwnProperty.call(body, "bio")) {
    data.bio = trimMax(body.bio, MAX_BIO_LEN);
  }

  if (Object.prototype.hasOwnProperty.call(body, "intro_html")) {
    const raw = String(body.intro_html ?? "");
    const capped = raw.length > MAX_INTRO_LEN ? raw.slice(0, MAX_INTRO_LEN) : raw;
    data.intro_html = sanitizeShopHtml(capped) || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "facebook_url")) {
    if (body.facebook_url == null || String(body.facebook_url).trim() === "") {
      data.facebook_url = null;
    } else {
      const url = safeUrl(body.facebook_url);
      if (!url) errors.push({ field: "facebook_url", message: "URL Facebook phải bắt đầu bằng https://" });
      else data.facebook_url = url;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "zalo_phone")) {
    data.zalo_phone = trimMax(body.zalo_phone, 50);
  }

  if (Object.prototype.hasOwnProperty.call(body, "working_hours")) {
    data.working_hours = trimMax(body.working_hours, MAX_TEXT_LEN);
  }

  if (Object.prototype.hasOwnProperty.call(body, "map_embed_url")) {
    if (body.map_embed_url == null || String(body.map_embed_url).trim() === "") {
      data.map_embed_url = null;
    } else {
      const url = safeUrl(body.map_embed_url);
      if (!url) errors.push({ field: "map_embed_url", message: "Map URL phải bắt đầu bằng https://" });
      else data.map_embed_url = url;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, "addressDetail")) {
    data.addressDetail = trimMax(body.addressDetail, MAX_TEXT_LEN);
  }

  return { data, errors };
}

/**
 * Validate the realtime slug-availability query.
 */
export function validateSlugAvailabilityQuery(slug) {
  const norm = normalizeSlugParam(slug);
  if (!norm) {
    return { ok: false, code: "EMPTY", error: "Slug không được để trống" };
  }
  if (RESERVED_SHOP_SLUGS.has(norm)) {
    return { ok: false, code: "RESERVED", error: "Slug này đã được hệ thống dành riêng" };
  }
  if (!isValidShopSlug(norm)) {
    return {
      ok: false,
      code: "INVALID",
      error: "Slug chỉ chấp nhận chữ thường, số và dấu gạch (3-40 ký tự)",
    };
  }
  return { ok: true, slug: norm };
}
