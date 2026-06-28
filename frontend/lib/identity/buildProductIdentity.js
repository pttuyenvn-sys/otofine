const SLUG_MAX_LEN = 140;

function stripHtml(text) {
  if (!text) return "";
  return String(text)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifyVi(text) {
  if (text == null) return "";
  let s = String(text);
  s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  s = s.replace(/đ/g, "d").replace(/Đ/g, "d");
  s = s.toLowerCase();
  s = s.replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/^-+|-+$/g, "");
  if (s.length > SLUG_MAX_LEN) {
    s = s.slice(0, SLUG_MAX_LEN).replace(/-+$/g, "");
  }
  return s;
}

function normalizeYear(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function buildYearSegment(yearFromRaw, yearToRaw) {
  const yearFrom = normalizeYear(yearFromRaw);
  const yearTo = normalizeYear(yearToRaw);

  if (yearFrom && yearTo && String(yearFrom) !== String(yearTo)) {
    return `${yearFrom}-${yearTo}`;
  }

  if (yearFrom) {
    return String(yearFrom);
  }

  if (yearTo) {
    return String(yearTo);
  }

  return "";
}

export function pickPrimaryFitment(cars) {
  if (!Array.isArray(cars) || cars.length === 0) return null;

  const explicitPrimary = cars.find((row) => {
    const value = row?.is_primary ?? row?.isPrimary ?? null;
    return Number(value) === 1 || value === true;
  });
  if (explicitPrimary) return explicitPrimary;

  return cars[0] || null;
}

function normalizeProduct(product = {}) {
  const id = product.id ?? product.productId ?? product.product_id ?? null;
  const partNumberRaw = product.partNumber ?? product.part_number ?? "";
  const partNameRaw = product.partName ?? "";

  return {
    id,
    partName: stripHtml(partNameRaw),
    partNumber: String(partNumberRaw || "").replace(/[^A-Za-z0-9]+/g, ""),
  };
}

function normalizeFitment(primaryFitment = {}) {
  const source = primaryFitment || {};
  const brandRaw = source.hang_xe ?? source.brand ?? "";
  const modelRaw = source.ten_xe ?? source.model ?? "";
  const yearFromRaw = source.year_from ?? source.yearFrom ?? null;
  const yearToRaw = source.year_to ?? source.yearTo ?? null;

  return {
    brand: stripHtml(brandRaw),
    model: stripHtml(modelRaw),
    yearFrom: normalizeYear(yearFromRaw),
    yearTo: normalizeYear(yearToRaw),
  };
}

function resolveSiteOrigin(siteOrigin) {
  const raw =
    siteOrigin ||
    process.env.FRONTEND_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    "https://otofine.com";
  return String(raw).trim().replace(/\/+$/, "");
}

/**
 * Product Identity single source of truth:
 * - products.partName
 * - products.partNumber
 * - primary fitment from product_car_applications.is_primary
 */
export function buildProductIdentity(product, primaryFitment, options = {}) {
  const p = normalizeProduct(product);
  const fitment = normalizeFitment(primaryFitment);
  const yearSegment = buildYearSegment(fitment.yearFrom, fitment.yearTo);

  const h1Parts = [p.partName, fitment.brand, fitment.model, yearSegment].filter(Boolean);
  const h1 = h1Parts.join(" ").trim() || "Sản phẩm";

  const slugParts = [p.partName, fitment.brand, fitment.model, yearSegment, p.partNumber].filter(Boolean);
  const slugSource = slugParts.join(" ").trim();
  const slug = slugifyVi(slugSource);

  const canonicalPath =
    p.id != null && p.id !== ""
      ? slug
        ? `/${slug}-${p.id}`
        : `/p/${p.id}`
      : "/";

  const siteOrigin = resolveSiteOrigin(options.siteOrigin);
  const canonicalUrl =
    canonicalPath && canonicalPath !== "/"
      ? `${siteOrigin}${canonicalPath}`
      : `${siteOrigin}/`;

  return {
    h1,
    slugSource,
    canonicalPath,
    canonicalUrl,
    seoTitle: `${h1} | Otofine`,
    yearSegment,
    fitment: {
      brand: fitment.brand,
      model: fitment.model,
      year_from: fitment.yearFrom,
      year_to: fitment.yearTo,
    },
    partName: p.partName,
    partNumber: p.partNumber,
    id: p.id,
  };
}

