import {
  buildYearSegment,
  pickPrimaryFitment,
} from "../identity/buildProductIdentity.js";

/** @typedef {Record<string, unknown> & { productIdentity?: { h1?: string; fitment?: Record<string, unknown> } }} ProductAltInput */

export const PRODUCT_IMAGE_ALT_TARGET_LENGTH = 180;
export const PRODUCT_IMAGE_ALT_MAX_LENGTH = 220;
export const PRODUCT_IMAGE_ALT_FALLBACK = "Phụ tùng ô tô";

/**
 * Strip HTML / normalize whitespace for ALT text.
 *
 * @param {unknown} value
 */
export function stripProductAltText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Raw part name (without vehicle context).
 *
 * @param {ProductAltInput | null | undefined} product
 * @param {{ productName?: string }} [options]
 */
export function resolveProductAltPartName(product, options = {}) {
  if (options.productName) {
    return stripProductAltText(options.productName);
  }
  if (!product) return "";

  for (const candidate of [product.partName, product.part_name, product.name]) {
    const clean = stripProductAltText(candidate);
    if (clean) return clean;
  }

  return "";
}

/**
 * @param {ProductAltInput | null | undefined} product
 */
export function resolveProductAltName(product) {
  const partName = resolveProductAltPartName(product);
  if (partName) return partName;

  if (!product) return "";

  for (const candidate of [
    product.productName,
    product.displayTitle,
    product.productIdentity?.h1,
    product.title,
    product.h1,
  ]) {
    const clean = stripProductAltText(candidate);
    if (clean) return clean;
  }

  return "";
}

/**
 * @param {ProductAltInput | null | undefined} product
 */
export function resolveProductAltPartNumber(product) {
  if (!product) return "";
  const raw =
    product.partNumber ??
    product.part_number ??
    product.PartNumber ??
    product.oem ??
    product.sku ??
    "";
  return String(raw).trim();
}

/**
 * @param {ProductAltInput | null | undefined} product
 */
export function resolvePrimaryFitmentForAlt(product) {
  if (!product) return null;

  if (product.primaryFitment && typeof product.primaryFitment === "object") {
    return product.primaryFitment;
  }

  const idFit = product.productIdentity?.fitment;
  if (
    idFit &&
    (idFit.brand || idFit.model || idFit.year_from != null || idFit.year_to != null)
  ) {
    return {
      hang_xe: idFit.brand,
      ten_xe: idFit.model,
      year_from: idFit.year_from,
      year_to: idFit.year_to,
    };
  }

  const fromCars = pickPrimaryFitment(
    Array.isArray(product.cars) ? product.cars : [],
  );
  if (fromCars) return fromCars;

  const brand = product.brand ?? product.hang_xe ?? "";
  const model = product.model ?? product.ten_xe ?? "";
  const yearFrom = product.yearFrom ?? product.year_from ?? null;
  const yearTo = product.yearTo ?? product.year_to ?? null;

  if (brand || model || yearFrom != null || yearTo != null) {
    return {
      hang_xe: brand,
      ten_xe: model,
      year_from: yearFrom,
      year_to: yearTo,
    };
  }

  return null;
}

/**
 * @param {Record<string, unknown> | null | undefined} fitment
 */
export function normalizeFitmentForAlt(fitment) {
  if (!fitment) {
    return { brand: "", model: "", yearRange: "" };
  }

  const brand = stripProductAltText(fitment.hang_xe ?? fitment.brand);
  const model = stripProductAltText(fitment.ten_xe ?? fitment.model);
  const yearRange = buildYearSegment(
    fitment.year_from ?? fitment.yearFrom,
    fitment.year_to ?? fitment.yearTo,
  );

  return { brand, model, yearRange };
}

/**
 * @param {string} value
 * @param {number} [maxLen]
 */
function truncateAlt(value, maxLen = PRODUCT_IMAGE_ALT_MAX_LENGTH) {
  const text = String(value || "").trim();
  if (text.length <= maxLen) return text;

  const cut = text.slice(0, Math.max(0, maxLen - 1)).trimEnd();
  const lastSpace = cut.lastIndexOf(" ");
  const trimmed =
    lastSpace > Math.floor(maxLen * 0.55) ? cut.slice(0, lastSpace).trimEnd() : cut;
  return `${trimmed}…`;
}

/**
 * Build descriptive ALT for product images (Google Images + a11y).
 *
 * Priority: {productName} {brand} {model} {yearRange} - Mã {partNumber}
 *
 * @param {ProductAltInput | null | undefined} [product]
 * @param {{ productName?: string; partNumber?: string }} [options]
 */
export function buildProductImageAlt(product, options = {}) {
  const partNumber = options.partNumber
    ? stripProductAltText(options.partNumber)
    : resolveProductAltPartNumber(product);
  const partName = resolveProductAltPartName(product, options);
  const fitment = resolvePrimaryFitmentForAlt(product);
  const { brand, model, yearRange } = normalizeFitmentForAlt(fitment);
  const hasFitment = Boolean(brand || model || yearRange);

  let lead = "";

  if (partName) {
    if (hasFitment) {
      lead = [partName, brand, model, yearRange].filter(Boolean).join(" ").trim();
    } else {
      lead = partName;
    }
  } else {
    const fallbackTitle = resolveProductAltName(product);
    if (fallbackTitle) {
      lead = fallbackTitle;
    }
  }

  if (!lead && !partNumber) {
    return PRODUCT_IMAGE_ALT_FALLBACK;
  }

  if (!lead && partNumber) {
    return truncateAlt(`Phụ tùng ô tô - Mã ${partNumber}`, PRODUCT_IMAGE_ALT_MAX_LENGTH);
  }

  const suffix = partNumber ? ` - Mã ${partNumber}` : "";
  if (!suffix) {
    return truncateAlt(lead, PRODUCT_IMAGE_ALT_MAX_LENGTH);
  }

  const maxLeadLen = PRODUCT_IMAGE_ALT_MAX_LENGTH - suffix.length;
  if (maxLeadLen < 8) {
    return truncateAlt(`${lead}${suffix}`, PRODUCT_IMAGE_ALT_MAX_LENGTH);
  }

  const trimmedLead =
    lead.length > maxLeadLen
      ? truncateAlt(lead, maxLeadLen)
      : lead;

  return `${trimmedLead}${suffix}`;
}
