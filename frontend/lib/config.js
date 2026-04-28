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

function serverApiBase() {
  if (publicBase) return publicBase;
  return `${internalOrigin}/api`;
}

/**
 * Base URL gọi REST. Trên trình duyệt: nếu không set NEXT_PUBLIC_API_BASE_URL
 * thì dùng `/api` (Next rewrite → Express), tránh CORS và dễ chạy local.
 */
export const API_BASE =
  typeof window !== "undefined" ? publicBase || "/api" : serverApiBase();

/** Origin không có suffix /api — dùng ghép path tĩnh (/uploads/...). */
export const API_ORIGIN = (() => {
  if (publicBase) {
    const o = publicBase.replace(/\/api\/?$/i, "");
    return o || internalOrigin;
  }
  if (typeof window !== "undefined") {
    return publicOrigin || internalOrigin;
  }
  return internalOrigin;
})();
