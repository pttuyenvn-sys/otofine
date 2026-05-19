/**
 * RFQ create form validation — mirrors backend rules (rfqCreateValidation.js).
 * Backend remains source of truth; these checks are for UX only.
 */

export const RFQ_MAX_CREATE_IMAGES = 10;
export const RFQ_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

const PLACEHOLDER_DESCRIPTIONS = new Set([
  ".",
  "..",
  "aaa",
  "test",
  "123",
  "xxxxx",
  "asdf",
  "abc",
  "none",
  "null",
  "n/a",
  "na",
  "khong",
  "không",
]);

const VN_E164_MOBILE = /^\+84[35789]\d{8}$/;

export function normalizePhoneVN(raw) {
  let s = String(raw || "").trim().replace(/\s+/g, "");
  if (!s) return "";
  if (s.startsWith("+")) return s;
  if (s.startsWith("84")) return `+${s}`;
  if (s.startsWith("0")) return `+84${s.slice(1)}`;
  return `+${s}`;
}

export function isPlaceholderPartDescription(text) {
  const t = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!t) return true;
  if (PLACEHOLDER_DESCRIPTIONS.has(t)) return true;
  if (/^[.\s\-_]+$/.test(t)) return true;
  const compact = t.replace(/\s/g, "");
  if (/^x{5,}$/i.test(compact)) return true;
  if (/^(.)\1{6,}$/.test(compact)) return true;
  return false;
}

export function validatePhoneField(phone) {
  const normalized = normalizePhoneVN(phone);
  if (!normalized) {
    return { valid: false, message: "Vui lòng nhập số điện thoại." };
  }
  if (!VN_E164_MOBILE.test(normalized)) {
    return {
      valid: false,
      message: "Số điện thoại không hợp lệ (số di động Việt Nam, VD: 0901234567).",
    };
  }
  return { valid: true, normalized };
}

export function validateDescriptionField(partDescription) {
  const trimmed = String(partDescription || "").trim();
  if (!trimmed) {
    return { valid: false, message: "Vui lòng mô tả phụ tùng hoặc triệu chứng." };
  }
  if (trimmed.length < 8) {
    return {
      valid: false,
      message: "Mô tả quá ngắn — cần ít nhất 8 ký tự.",
    };
  }
  if (isPlaceholderPartDescription(trimmed)) {
    return {
      valid: false,
      message: "Mô tả chưa cụ thể — vui lòng ghi rõ phụ tùng hoặc triệu chứng thực tế.",
    };
  }
  return { valid: true, value: trimmed };
}

export function validateVehicleField(vehicle) {
  const brand = String(vehicle?.brand ?? "").trim();
  const model = String(vehicle?.model ?? "").trim();
  const yearRaw = vehicle?.year != null ? String(vehicle.year).trim() : "";
  const year = yearRaw ? Number(yearRaw) : NaN;
  const maxYear = new Date().getFullYear() + 1;

  if (!brand) {
    return { valid: false, message: "Vui lòng chọn hãng xe.", field: "brand" };
  }
  if (!model) {
    return { valid: false, message: "Vui lòng chọn dòng xe.", field: "model" };
  }
  if (!yearRaw || !Number.isFinite(year) || year < 1950 || year > maxYear) {
    return { valid: false, message: "Vui lòng chọn năm sản xuất hợp lệ.", field: "year" };
  }
  return { valid: true, value: { brand, model, year } };
}

export function validateImageCount(totalCount) {
  if (totalCount > RFQ_MAX_CREATE_IMAGES) {
    return {
      valid: false,
      message: `Tối đa ${RFQ_MAX_CREATE_IMAGES} ảnh cho mỗi yêu cầu.`,
    };
  }
  return { valid: true };
}

/**
 * @returns {{ valid: boolean, errors: { phone?: string, partDescription?: string, vehicle?: string, images?: string }, normalized?: object }}
 */
export function validateRfqCreateForm({ phone, partDescription, vehicle, imageCount = 0 }) {
  const errors = {};

  const phoneR = validatePhoneField(phone);
  if (!phoneR.valid) errors.phone = phoneR.message;

  const descR = validateDescriptionField(partDescription);
  if (!descR.valid) errors.partDescription = descR.message;

  const vehicleR = validateVehicleField(vehicle);
  if (!vehicleR.valid) errors.vehicle = vehicleR.message;

  const imgR = validateImageCount(imageCount);
  if (!imgR.valid) errors.images = imgR.message;

  const valid = Object.keys(errors).length === 0;

  return {
    valid,
    errors,
    normalized: valid
      ? {
          phoneE164: phoneR.normalized,
          partDescription: descR.value,
          vehicle: vehicleR.value,
        }
      : null,
  };
}

export function getUploadRejectMessage(reason, { maxPerSection, maxTotal }) {
  if (reason === "type") return "Chỉ hỗ trợ ảnh JPG, PNG, WebP.";
  if (reason === "size") return "Ảnh quá lớn (tối đa 5MB mỗi ảnh).";
  if (reason === "max_section") {
    return `Tối đa ${maxPerSection} ảnh cho mục này.`;
  }
  if (reason === "max_total") {
    return `Tối đa ${maxTotal} ảnh cho toàn bộ yêu cầu.`;
  }
  return "Không thể thêm ảnh.";
}
