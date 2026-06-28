const publicApiUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim();
const publicBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();

/**
 * Origin của backend (ảnh /uploads, URL tuyệt đối). Luôn public-facing —
 * browser dùng ghép /uploads, không dùng loopback.
 */
const publicOrigin = (process.env.NEXT_PUBLIC_API_ORIGIN || "").trim().replace(/\/$/, "");

const internalOrigin = (
  process.env.API_INTERNAL_ORIGIN ||
  process.env.API_PROXY_TARGET ||
  "http://127.0.0.1:5000"
)
  .replace(/\/$/, "")
  .replace(/\/api\/?$/i, "");

function apiBaseFromOrigin(value) {
  const raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw) return "";
  return /\/api$/i.test(raw) ? raw : `${raw}/api`;
}

/**
 * SHOP-INTERNAL-API-01 — SSR / RSC / route handlers.
 * Ưu tiên loopback để tránh SSR đi qua public edge (429).
 */
function serverApiBase() {
  const fromInternal = apiBaseFromOrigin(internalOrigin);
  if (fromInternal) return fromInternal;

  const fromPublicUrl = apiBaseFromOrigin(publicApiUrl);
  if (fromPublicUrl) return fromPublicUrl;
  if (publicBase) return publicBase;

  return "http://127.0.0.1:5000/api";
}

/** Browser / client components — giữ public API URL. */
function clientApiBase() {
  const fromPublicUrl = apiBaseFromOrigin(publicApiUrl);
  if (fromPublicUrl) return fromPublicUrl;
  if (publicBase) return publicBase;
  return `${internalOrigin}/api`;
}

/**
 * Base URL gọi REST.
 * - Server: internal origin (127.0.0.1:5000 mặc định)
 * - Client: NEXT_PUBLIC_API_URL
 */
export const API_BASE =
  typeof window === "undefined" ? serverApiBase() : clientApiBase();

/** Origin không có suffix /api — dùng ghép path tĩnh (/uploads/...). */
export const API_ORIGIN = (() => {
  if (publicApiUrl) {
    return publicApiUrl.replace(/\/api\/?$/i, "").replace(/\/$/, "") || internalOrigin;
  }
  if (publicBase) {
    const o = publicBase.replace(/\/api\/?$/i, "");
    return o || internalOrigin;
  }
  return publicOrigin || internalOrigin;
})();

/**
 * Zalo OA (NEXT_PUBLIC_ZALO_OA_URL). Frontend-only link.
 * TODO: future OA API integration — CMS/static JSON if needed.
 */
export const ZALO_OA_URL = (process.env.NEXT_PUBLIC_ZALO_OA_URL || "").trim() || "";
