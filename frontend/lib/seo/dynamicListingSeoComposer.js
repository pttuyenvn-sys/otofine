import { API_BASE } from "@/lib/config";
import { classifyListingTier } from "@/lib/seo/homePageTitle";

/* ── helpers ── */

function toNumberFromPriceText(text) {
  const raw = String(text || "");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatVnd(n) {
  if (!Number.isFinite(n)) return "";
  return `${new Intl.NumberFormat("vi-VN").format(n)}đ`;
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean).map((x) => String(x).trim()).filter(Boolean))];
}

function extractBrands(products, filters) {
  const known = [];
  if (filters?.brand) known.push(String(filters.brand).trim());
  for (const p of products || []) {
    const src = [p?.subtitleLine1, p?.subtitleLine2, p?.shortDescription, p?.summary]
      .filter(Boolean)
      .join(" ");
    const m = src.match(/\b(Toyota|Honda|Mazda|Kia|Hyundai|Ford|Mercedes|BMW|Audi|Lexus|Nissan|Mitsubishi|Suzuki|Isuzu|Chevrolet)\b/gi);
    if (m) known.push(...m);
  }
  return unique(known).slice(0, 8);
}

function extractModels(products, filters) {
  const out = [];
  if (filters?.model) out.push(String(filters.model).trim());
  for (const p of products || []) {
    const src = [p?.subtitleLine1, p?.subtitleLine2, p?.shortDescription]
      .filter(Boolean)
      .join(" ");
    const m = src.match(/\b(Vios|Camry|Altis|Civic|City|CR-V|Mazda 3|Mazda 6|CX-5|Morning|Cerato|Seltos|Accent|Elantra|Ranger|Everest|S450)\b/gi);
    if (m) out.push(...m);
  }
  return unique(out).slice(0, 10);
}

function priceRange(products) {
  const prices = (products || [])
    .map((p) => toNumberFromPriceText(p?.priceText))
    .filter((x) => Number.isFinite(x));
  if (!prices.length) return { min: null, max: null };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

function priceSnippet(h1, count, min, max) {
  if (min != null && max != null)
    return `${h1} hiện có ${count} sản phẩm, giá từ ${formatVnd(min)} đến ${formatVnd(max)}.`;
  if (count > 0) return `${h1} hiện có ${count} sản phẩm đang hiển thị.`;
  return `${h1} — đang cập nhật danh sách sản phẩm.`;
}

function toSlugHref(label) {
  return `/${label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

/* ── tier-specific section builders ── */

function sectionsPartCarYearCity(h1, cat, f, count, min, max, brands) {
  const car = [f.brand, f.model, f.year].filter(Boolean).join(" ");
  return [
    { heading: `${cat} cho ${car} tại ${f.city}`, content: priceSnippet(h1, count, min, max) },
    { heading: `Tương thích ${car}`, content: `Kiểm tra đúng mã OEM và đời xe ${car} trước khi đặt. Các thương hiệu phổ biến: ${brands.join(", ") || "đang cập nhật"}.` },
    { heading: `Mua ${cat} tại ${f.city}`, content: `Hỗ trợ giao hàng khu vực ${f.city}. Nên chọn shop có xác minh và chính sách đổi trả rõ ràng.` },
  ];
}

function sectionsPartCarYear(h1, cat, f, count, min, max, brands) {
  const car = [f.brand, f.model, f.year].filter(Boolean).join(" ");
  return [
    { heading: `${cat} cho ${car}`, content: priceSnippet(h1, count, min, max) },
    { heading: "Kiểm tra tương thích", content: `Đối chiếu mã phụ tùng OEM với ${car}. Lưu ý phân biệt bản máy xăng / diesel nếu có.` },
    { heading: "Thương hiệu gợi ý", content: brands.length > 0 ? `Ưu tiên: ${brands.join(", ")}.` : "Đang cập nhật dữ liệu thương hiệu." },
  ];
}

function sectionsPartCar(h1, cat, f, count, min, max, brands) {
  const car = [f.brand, f.model].filter(Boolean).join(" ");
  return [
    { heading: `${cat} cho ${car}`, content: priceSnippet(h1, count, min, max) },
    { heading: "Lưu ý chọn mua", content: `So sánh thông số kỹ thuật và mã OEM khi chọn ${cat.toLowerCase()} cho ${car}. Gửi ảnh phụ tùng cũ để shop đối chiếu.` },
    { heading: "Thương hiệu phổ biến", content: brands.length > 0 ? brands.join(", ") + "." : "Đang cập nhật." },
  ];
}

function sectionsCarOnly(h1, f, count, min, max, brands, models) {
  const car = [f.brand, f.model, f.year].filter(Boolean).join(" ");
  return [
    { heading: `Phụ tùng ${car}`, content: priceSnippet(h1, count, min, max) },
    { heading: "Danh mục phổ biến", content: "Má phanh, đèn pha, lọc gió, lọc dầu, bơm nước, gương chiếu hậu — là các nhóm thường được tìm nhiều nhất." },
    { heading: "Dòng xe liên quan", content: models.length > 0 ? models.join(", ") + "." : `Thêm bộ lọc dòng xe để thu hẹp kết quả cho ${f.brand || "hãng xe"}.` },
  ];
}

function sectionsPartOnly(h1, cat, count, min, max, brands) {
  return [
    { heading: `Tổng quan ${cat} ô tô`, content: priceSnippet(h1, count, min, max) },
    { heading: "Hướng dẫn chọn mua", content: `Kiểm tra tương thích theo mã OEM, đời xe, phiên bản máy. ${brands.length > 0 ? "Ưu tiên: " + brands.slice(0, 3).join(", ") + "." : ""}` },
    { heading: "Bảo dưỡng", content: `Thay ${cat.toLowerCase()} đúng chu kỳ theo khuyến cáo nhà sản xuất để đảm bảo an toàn vận hành.` },
  ];
}

function sectionsCityOnly(h1, f, count, min, max) {
  return [
    { heading: `Phụ tùng ô tô tại ${f.city}`, content: priceSnippet(h1, count, min, max) },
    { heading: "Giao hàng và lắp đặt", content: `Hỗ trợ giao hàng nhanh khu vực ${f.city}. Nhiều shop hỗ trợ lắp đặt tại garage đối tác.` },
    { heading: "Tìm đúng phụ tùng", content: "Dùng bộ lọc hãng xe, dòng xe và danh mục phụ tùng để thu hẹp kết quả nhanh nhất." },
  ];
}

function sectionsHomepage(h1, count, min, max, brands) {
  return [
    { heading: "Tìm phụ tùng đúng xe", content: priceSnippet(h1, count, min, max) + " Chọn hãng xe và dòng xe để thu hẹp kết quả." },
    { heading: "Thương hiệu nổi bật", content: brands.length > 0 ? brands.join(", ") + "." : "Toyota, Honda, Hyundai, Kia, Mazda, Ford và nhiều hãng khác." },
    { heading: "Cam kết", content: "Giá minh bạch, shop xác minh, hỗ trợ tìm đúng mã phụ tùng theo xe — gọi trực tiếp cửa hàng." },
  ];
}

/* ── main export ── */

export function buildDynamicListingSeoContent({
  h1,
  products = [],
  filters = {},
  selectedCategory = "",
  knowledgeRows = [],
  tier: tierOverride,
}) {
  const safeH1 = String(h1 || "Phụ tùng ô tô chính hãng giá tốt").trim();
  const f = filters || {};
  const cat = (selectedCategory || "").trim();
  const count = Array.isArray(products) ? products.length : 0;
  const { min, max } = priceRange(products);
  const brands = extractBrands(products, f);
  const models = extractModels(products, f);
  const tier = tierOverride ?? classifyListingTier(cat, f).tier;

  let sections;
  switch (tier) {
    case 1:  sections = sectionsPartCarYearCity(safeH1, cat, f, count, min, max, brands); break;
    case 2:  sections = sectionsPartCarYear(safeH1, cat, f, count, min, max, brands); break;
    case 3:  sections = sectionsPartCar(safeH1, cat, f, count, min, max, brands); break;
    case 4:  sections = sectionsCarOnly(safeH1, f, count, min, max, brands, models); break;
    case 5:  sections = sectionsPartOnly(safeH1, cat, count, min, max, brands); break;
    case 6:  sections = sectionsCityOnly(safeH1, f, count, min, max); break;
    case 7:
    default: sections = sectionsHomepage(safeH1, count, min, max, brands); break;
  }

  const relatedLinks = unique([
    cat ? `${cat} ô tô` : "",
    f.brand ? `Phụ tùng ${f.brand}` : "",
    f.model ? `Phụ tùng ${f.model}` : "",
    f.city ? `Phụ tùng ô tô tại ${f.city}` : "",
    "Phụ tùng ô tô",
    "Má phanh ô tô",
    "Đèn pha ô tô",
  ]).map((label) => ({ label, href: toSlugHref(label) }));

  return {
    title: `${safeH1} | Otofine`,
    intro: priceSnippet(safeH1, count, min, max),
    sections,
    relatedLinks,
    tier,
  };
}

export async function fetchPartKnowledgeHints({
  h1,
  selectedCategory,
  products = [],
}) {
  const seeds = unique([
    h1,
    selectedCategory,
    ...products.slice(0, 6).map((p) => p?.shortDescription || p?.subtitleLine1 || ""),
  ]).slice(0, 6);
  const rowsById = new Map();
  for (const q of seeds) {
    const url = `${String(API_BASE).replace(/\/$/, "")}/part-knowledge?page=1&limit=20&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const body = await res.json().catch(() => ({}));
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      for (const row of rows) {
        const key = String(row?.id || row?.slug || "");
        if (!key) continue;
        if (!rowsById.has(key)) rowsById.set(key, row);
      }
    } catch {
      /* ignore */
    }
  }
  return [...rowsById.values()];
}
