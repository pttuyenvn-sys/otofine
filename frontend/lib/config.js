const publicApiUrl = (process.env.NEXT_PUBLIC_API_URL || "").trim();
const publicBase = (process.env.NEXT_PUBLIC_API_BASE_URL || "").trim();

/**
 * Origin của backend (ảnh /uploads, URL tuyệt đối). Chỉ cần khi dùng proxy /api.
 * Mặc định trùng cổng Express local.
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

function serverApiBase() {
  const fromPublicUrl = apiBaseFromOrigin(publicApiUrl);
  if (fromPublicUrl) return fromPublicUrl;
  if (publicBase) return publicBase;
  return `${internalOrigin}/api`;
}

/**
 * Base URL gọi REST. Ưu tiên NEXT_PUBLIC_API_URL để browser gọi thẳng
 * backend Express thay vì đi qua Next route/proxy.
 */
export const API_BASE = serverApiBase();

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
