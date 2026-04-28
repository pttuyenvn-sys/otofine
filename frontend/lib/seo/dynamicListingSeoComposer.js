import { API_BASE } from "@/lib/config";

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

function technicalSnippet(row) {
  if (!row) return "";
  const pieces = [
    row.summary,
    row.functionText,
    row.structureText,
    row.operationText,
    row.vnUsageNotesText,
  ]
    .filter(Boolean)
    .map((x) => String(x).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!pieces.length) return "";
  const joined = pieces.join(" ");
  return joined.length > 420 ? `${joined.slice(0, 417)}...` : joined;
}

/**
 * Generate category overview content
 */
function generateCategoryOverview(categoryName, productCount, minPrice, maxPrice) {
  const priceInfo = minPrice && maxPrice 
    ? ` với mức giá từ ${formatVnd(minPrice)} đến ${formatVnd(maxPrice)}`
    : productCount > 0 
      ? ` với nhiều mức giá khác nhau`
      : ` đang cập nhật`;
  
  return `${categoryName} là một trong những bộ phận quan trọng của hệ thống ô tô, đảm bảo xe vận hành an toàn và hiệu quả. Hiện có ${productCount} sản phẩm${priceInfo}, được phân loại theo các thương hiệu và thông số kỹ thuật khác nhau để phù hợp với mọi nhu cầu sử dụng.`;
}

/**
 * Generate category buying guide
 */
function generateCategoryBuyingGuide(categoryName, brands) {
  const brandInfo = brands.length > 0 
    ? ` Nên ưu tiên các thương hiệu uy tín như: ${brands.slice(0, 3).join(", ")}.`
    : "";
  
  return `Khi chọn mua ${categoryName.toLowerCase()}, cần chú ý đến các yếu tố: thông số kỹ thuật tương thích với dòng xe, chất lượng vật liệu, thương hiệu sản xuất, và chế độ bảo hành.${brandInfo} Luôn kiểm tra kỹ sản phẩm trước khi lắp đặt và yêu cầu tư vấn từ các kỹ thuật viên có kinh nghiệm.`;
}

/**
 * Generate category maintenance tips
 */
function generateCategoryMaintenanceTips(categoryName) {
  return `Để đảm bảo ${categoryName.toLowerCase()} hoạt động tốt và kéo dài tuổi thọ, cần tuân thủ lịch bảo dưỡng định kỳ theo khuyến nghị của nhà sản xuất. Kiểm tra tình trạng hoạt động thường xuyên, vệ sinh đúng cách, và thay thế kịp thời khi có dấu hiệu hư hỏng. Sử dụng dịch vụ bảo dưỡng chuyên nghiệp để đảm bảo chất lượng.`;
}

/**
 * Check if slug represents a category page
 * @param {string} slug
 * @returns {boolean}
 */
function isCategorySlug(slug) {
  if (!slug || typeof slug !== "string") return false;
  const s = slug.trim().toLowerCase();
  // Category slugs end with "-o-to" but don't start with "phu-tung-o-to"
  return s.endsWith("-o-to") && !s.startsWith("phu-tung-o-to");
}

/**
 * Extract category name from slug
 * @param {string} slug
 * @returns {string}
 */
function extractCategoryFromSlug(slug) {
  if (!isCategorySlug(slug)) return "";
  const s = slug.trim().toLowerCase();
  // Remove "-o-to" suffix and convert back to readable format
  const baseName = s.slice(0, -6); // Remove "-o-to"
  // Convert slug back to readable category name
  return baseName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function buildDynamicListingSeoContent({
  h1,
  products = [],
  filters = {},
  selectedCategory = "",
  knowledgeRows = [],
  slug = "",
}) {
  const safeH1 = String(h1 || "Phụ tùng ô tô").trim();
  const count = Array.isArray(products) ? products.length : 0;
  const prices = (products || [])
    .map((p) => toNumberFromPriceText(p?.priceText))
    .filter((x) => Number.isFinite(x));
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;
  const brands = extractBrands(products, filters);
  const models = extractModels(products, filters);
  const firstKnowledge = knowledgeRows?.[0] || null;

  // Check if this is a category page
  const isCategory = slug && isCategorySlug(slug);
  const categoryName = isCategory ? extractCategoryFromSlug(slug) : selectedCategory;

  const summaryLine =
    minPrice != null && maxPrice != null
      ? `${safeH1} hiện có ${count} sản phẩm, giá từ ${formatVnd(minPrice)} đến ${formatVnd(maxPrice)}.`
      : `${safeH1} hiện có ${count} sản phẩm đang hiển thị.`;

  // Generate category-specific sections if this is a category page
  let sections = [];
  
  if (isCategory && categoryName) {
    sections = [
      {
        heading: `Tổng quan về ${categoryName} ô tô`,
        content: generateCategoryOverview(categoryName, count, minPrice, maxPrice),
      },
      {
        heading: "Hướng dẫn chọn mua",
        content: generateCategoryBuyingGuide(categoryName, brands),
      },
      {
        heading: "Bảo dưỡng và lưu ý quan trọng",
        content: generateCategoryMaintenanceTips(categoryName),
      },
    ];

    // Add brand section if available
    if (brands.length > 0) {
      sections.push({
        heading: "Thương hiệu uy tín",
        content: `Các thương hiệu ${categoryName.toLowerCase()} nổi bật: ${brands.join(", ")}. Nên ưu tiên các sản phẩm có chứng nhận chất lượng và bảo hành rõ ràng.`,
      });
    }
  } else {
    // Original sections for non-category pages
    sections = [
      {
        heading: `Tổng quan ${safeH1}`,
        content:
          `${summaryLine} Danh sách được cập nhật theo bộ lọc hiện tại để bạn so sánh nhanh thông số, mức giá và nhà bán phù hợp.`,
      },
      {
        heading: "Thương hiệu phổ biến trong kết quả",
        content:
          brands.length > 0
            ? `Các thương hiệu xuất hiện nhiều: ${brands.join(", ")}. Nên ưu tiên đối chiếu thông số và điều kiện bảo hành trước khi chốt mua.`
            : "Hiện chưa đủ dữ liệu thương hiệu nổi bật từ kết quả; bạn có thể mở rộng bộ lọc để xem thêm lựa chọn.",
      },
      {
        heading: "Dòng xe tương thích",
        content:
          models.length > 0
            ? `Các dòng xe được nhắc đến trong kết quả: ${models.join(", ")}. Hãy kiểm tra đúng đời xe và phiên bản máy để hạn chế đặt nhầm.`
            : "Chưa có nhiều tín hiệu dòng xe trong danh sách hiện tại; nên kết hợp thêm lọc hãng, model hoặc năm sản xuất.",
      },
      {
        heading: "Kiến thức kỹ thuật liên quan",
        content:
          technicalSnippet(firstKnowledge) ||
          "Chưa có ghi chú kỹ thuật chuyên sâu phù hợp trực tiếp trong tập tri thức hiện tại. Bạn nên xác nhận mã phụ tùng và thông số lắp đặt với cửa hàng trước khi thanh toán.",
      },
      {
        heading: "Kinh nghiệm mua phụ tùng đúng nhu cầu",
        content:
          "Luôn so sánh trên cùng tiêu chuẩn kỹ thuật, không chỉ theo giá thấp nhất. Trước khi chốt đơn, nên gửi ảnh phụ tùng cũ hoặc mã cũ để cửa hàng đối chiếu lại lần cuối.",
      },
      {
        heading: "Liên kết nội bộ gợi ý",
        content:
          selectedCategory
            ? `Bạn có thể khám phá thêm các trang cùng nhóm ${selectedCategory} hoặc mở rộng sang các nhóm phụ tùng liên quan để tối ưu lựa chọn và ngân sách.`
            : "Bạn có thể xem thêm các nhóm phụ tùng phổ biến theo hãng và dòng xe để mở rộng phương án thay thế.",
      },
    ];
  }

  const relatedLinks = unique([
    selectedCategory ? `${selectedCategory} ô tô` : "",
    filters?.brand ? `Phụ tùng ${filters.brand}` : "",
    filters?.model ? `Phụ tùng ${filters.model}` : "",
    "Phụ tùng ô tô",
    "Má phanh ô tô",
    "Đèn pha ô tô",
  ]).map((label) => ({
    label,
    href: `/${label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")}`,
  }));

  return {
    title: `${safeH1}: thông tin giá, tương thích và kinh nghiệm chọn mua`,
    intro: summaryLine,
    sections,
    relatedLinks,
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
