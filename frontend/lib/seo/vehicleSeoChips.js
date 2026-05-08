/**
 * Chip "Mua phụ tùng theo hãng & dòng xe" — fallback khi API /filter/vehicle-hot lỗi/rỗng.
 * API: GET /api/filter/vehicle-hot → { brands, models } với score đã tính phía server.
 */

/** 10 hãng — fallback khi API /filter/vehicle-hot lỗi/rỗng */
export const FALLBACK_SEO_TOP_BRANDS = [
  "Toyota",
  "Mazda",
  "Kia",
  "Hyundai",
  "Ford",
  "Honda",
  "Mitsubishi",
  "VinFast",
  "Nissan",
  "Mercedes-Benz",
];

/** 20 cặp brand+model — fallback khi không có dữ liệu DB */
export const FALLBACK_SEO_HOT_MODELS = [
  { brand: "Toyota", model: "Camry" },
  { brand: "Mazda", model: "3" },
  { brand: "Kia", model: "Cerato" },
  { brand: "Hyundai", model: "Tucson" },
  { brand: "Ford", model: "Ranger" },
  { brand: "Honda", model: "City" },
  { brand: "Mitsubishi", model: "Xpander" },
  { brand: "VinFast", model: "VF 8" },
  { brand: "Mazda", model: "CX-5" },
  { brand: "Toyota", model: "Vios" },
  { brand: "Kia", model: "Seltos" },
  { brand: "Hyundai", model: "i10" },
  { brand: "Ford", model: "Everest" },
  { brand: "Honda", model: "CR-V" },
  { brand: "Toyota", model: "Fortuner" },
  { brand: "Mitsubishi", model: "Triton" },
  { brand: "Nissan", model: "Navara" },
  { brand: "Hyundai", model: "Santa Fe" },
  { brand: "Mercedes-Benz", model: "C-Class" },
  { brand: "Toyota", model: "Innova" },
];

function keyBrand(name) {
  return String(name || "")
    .trim()
    .toLowerCase();
}

function keyModel(row) {
  return `${String(row.brand || "").trim().toLowerCase()}|${String(row.model || "").trim().toLowerCase()}`;
}

/**
 * Lấy tối đa n mục: ưu tiên `primary`, bổ sung từ `fallback` (không trùng key).
 * @param {string[]} primary
 * @param {string[]} fallback
 * @param {number} n
 * @returns {string[]}
 */
export function mergeBrandNamesToLength(primary, fallback, n) {
  const out = [];
  const seen = new Set();
  for (const raw of primary || []) {
    if (out.length >= n) break;
    const name = String(raw || "").trim();
    if (!name) continue;
    const k = keyBrand(name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(name);
  }
  for (const raw of fallback || []) {
    if (out.length >= n) break;
    const name = String(raw || "").trim();
    if (!name) continue;
    const k = keyBrand(name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(name);
  }
  return out;
}

/**
 * @param {Array<{ brand: string, model: string }>} primary
 * @param {Array<{ brand: string, model: string }>} fallback
 * @param {number} n
 */
export function mergeModelRowsToLength(primary, fallback, n) {
  const out = [];
  const seen = new Set();
  for (const row of primary || []) {
    if (out.length >= n) break;
    if (!row?.brand && !row?.model) continue;
    const b = String(row.brand || "").trim();
    const m = String(row.model || "").trim();
    if (!b || !m) continue;
    const item = { brand: b, model: m };
    const k = keyModel(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  for (const row of fallback || []) {
    if (out.length >= n) break;
    const b = String(row.brand || "").trim();
    const m = String(row.model || "").trim();
    if (!b || !m) continue;
    const item = { brand: b, model: m };
    const k = keyModel(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
