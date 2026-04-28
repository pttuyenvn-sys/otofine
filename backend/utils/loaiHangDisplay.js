/**
 * Display mapping for "Loại hàng" product-grade codes stored in DB.
 * Does not modify stored values; mapping is presentation-only.
 * Keys are matched case-insensitively; spaces/diacritics normalized for lookup.
 */

const LOAI_HANG_BY_KEY = {
  xin: "Cao cấp",
  zin: "Zin tháo xe",
  loai1: "Tiêu chuẩn cao",
  oem: "OEM",
  chinhhang: "Chính hãng",
  bai: "Đã qua sử dụng",
};

function normKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_\-]/g, "");
}

/**
 * @param {string} raw - value as stored in DB (e.g. p.origin for grade codes)
 * @returns {string | null} display label if raw matches a known key, else null
 */
export function mapLoaiHangDisplay(raw) {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const k = normKey(t);
  if (LOAI_HANG_BY_KEY[k] != null) {
    return LOAI_HANG_BY_KEY[k];
  }
  return null;
}

/**
 * When `origin` is used for both grade codes and geographic text:
 * if it matches a loại hàng key → use only as loại hàng; else treat as xuất xứ/địa lý.
 * @returns {{ loaiHangLabel: string | null, geoLabel: string | null }}
 */
export function classifyOriginForCard(raw) {
  const t = String(raw ?? "").trim();
  if (!t) {
    return { loaiHangLabel: null, geoLabel: null };
  }
  const mapped = mapLoaiHangDisplay(t);
  if (mapped) {
    return { loaiHangLabel: mapped, geoLabel: null };
  }
  const geo = t.replace(/^\s*h[àa]ng\s+/i, "").trim() || t;
  return { loaiHangLabel: null, geoLabel: geo };
}
